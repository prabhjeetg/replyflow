import { Router, type Request, type Response } from 'express';
import type { SocialAccount } from '../../types/index.ts';
import { decryptSecret, verifyMetaSignature } from '../crypto.ts';
import { getAdminServices } from '../firebaseAdmin.ts';
import { readLocalStore } from '../localStore.ts';
import { log } from '../logger.ts';
import {
  processIncomingComment,
  processIncomingDirectMessage,
  processPostbackEvent,
} from '../processor.ts';

export const webhooksRouter = Router();

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

/**
 * Meta Webhook Verification (GET)
 * Checks hub.verify_token against META_WEBHOOK_VERIFY_TOKEN env, Firestore, or Local Workspace settings.
 */
webhooksRouter.get('/meta', async (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = String(req.query['hub.verify_token'] || '');
  const challenge = req.query['hub.challenge'];

  if (mode !== 'subscribe' || !token) {
    res.status(403).send('Forbidden: Invalid hub.mode or verify_token');
    return;
  }

  const envToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  let valid = Boolean(envToken && token === envToken);

  if (!valid) {
    const { db } = getAdminServices();
    if (db) {
      const snap = await db
        .collection('settings')
        .where('metaVerifyToken', '==', token)
        .limit(1)
        .get();
      valid = !snap.empty;
    } else {
      const local = readLocalStore();
      valid = Boolean(local.settings.metaVerifyToken && token === local.settings.metaVerifyToken);
    }
  }

  if (valid) {
    log('info', 'meta_webhook_verified');
    res.status(200).send(String(challenge || ''));
    return;
  }

  log('warn', 'meta_webhook_verify_token_mismatch');
  res.status(403).send('Verification token mismatch');
});

/**
 * Meta Webhook Event Receiver (POST)
 * Validates X-Hub-Signature-256, returns 200 OK immediately, and processes events asynchronously.
 */
webhooksRouter.post('/meta', async (req: RawBodyRequest, res: Response) => {
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const payload = req.body as {
    object?: string;
    entry?: Array<{
      id?: string;
      time?: number;
      changes?: Array<{
        field?: string;
        value?: Record<string, unknown>;
      }>;
      messaging?: Array<Record<string, unknown>>;
    }>;
  };

  if (!payload || !payload.object || !Array.isArray(payload.entry)) {
    res.status(400).send('Invalid webhook payload');
    return;
  }

  const { db } = getAdminServices();
  const entryIds = payload.entry.map((e) => e.id).filter(Boolean) as string[];
  let appSecret = process.env.META_APP_SECRET || '';
  const matchedAccounts = new Map<string, SocialAccount>();

  if (db) {
    for (const entryId of entryIds) {
      const accSnap = await db
        .collection('accounts')
        .where('platformAccountId', '==', entryId)
        .limit(1)
        .get();

      let doc = accSnap.docs[0];
      if (!doc) {
        const pageSnap = await db
          .collection('accounts')
          .where('pageId', '==', entryId)
          .limit(1)
          .get();
        doc = pageSnap.docs[0];
      }

      if (doc) {
        const account = { id: doc.id, ...(doc.data() as Omit<SocialAccount, 'id'>) };
        matchedAccounts.set(entryId, account);

        if (!appSecret) {
          const secSnap = await db.collection('settingsSecrets').doc(account.userId).get();
          if (secSnap.exists && secSnap.data()?.metaAppSecretEnc) {
            appSecret = decryptSecret(secSnap.data()!.metaAppSecretEnc as string);
          }
        }
      }
    }
  } else {
    const local = readLocalStore();
    for (const entryId of entryIds) {
      const acc = local.accounts.find(
        (a) => a.platformAccountId === entryId || a.pageId === entryId
      );
      if (acc) {
        matchedAccounts.set(entryId, acc);
      }
    }
    if (!appSecret && local.settingsSecrets.metaAppSecretEnc) {
      appSecret = decryptSecret(local.settingsSecrets.metaAppSecretEnc);
    }
  }

  if (appSecret) {
    const isValidSig = verifyMetaSignature(rawBody, signature, appSecret);
    if (!isValidSig) {
      log('warn', 'meta_webhook_invalid_signature', { signature });
      res.status(401).send('Invalid X-Hub-Signature-256');
      return;
    }
  } else {
    log('warn', 'meta_webhook_no_app_secret_configured');
  }

  // Return 200 immediately as required by Meta Webhooks
  res.status(200).send('EVENT_RECEIVED');

  // Process asynchronously
  setImmediate(async () => {
    try {
      for (const entry of payload.entry || []) {
        const entryId = entry.id || '';
        const account = matchedAccounts.get(entryId);
        if (!account) continue;

        const platform = payload.object === 'instagram' ? 'instagram' : 'facebook';

        // 1. Handle Messenger / Instagram Messaging events (DMs, Story replies, Postbacks)
        for (const msgEvent of entry.messaging || []) {
          const sender = msgEvent.sender as { id?: string } | undefined;
          const senderId = sender?.id || '';
          if (!senderId) continue;

          const postback = msgEvent.postback as { payload?: string; title?: string } | undefined;
          if (postback?.payload) {
            await processPostbackEvent({
              account,
              platform,
              senderId,
              payload: postback.payload,
            });
            continue;
          }

          const message = msgEvent.message as {
            mid?: string;
            text?: string;
            is_echo?: boolean;
            reply_to?: { story?: { id?: string } };
            quick_reply?: { payload?: string };
          } | undefined;

          if (message?.is_echo) continue;
          if (message?.quick_reply?.payload) {
            await processPostbackEvent({
              account,
              platform,
              senderId,
              payload: message.quick_reply.payload,
            });
            continue;
          }

          if (message?.text && message?.mid) {
            if (message.reply_to?.story) {
              await processIncomingComment({
                account,
                platform,
                targetType: 'story_reply',
                mediaId: message.reply_to.story.id,
                commentId: `story_${message.mid}`,
                commenterId: senderId,
                commenterUsername: senderId,
                commentText: message.text,
              });
            } else {
              await processIncomingDirectMessage({
                account,
                platform,
                senderId,
                messageId: message.mid,
                text: message.text,
              });
            }
          }
        }

        // 2. Handle Graph API Changes (Instagram comments / live_comments / Facebook Page feed comments)
        for (const change of entry.changes || []) {
          const field = change.field || '';
          const val = change.value || {};

          if (platform === 'instagram' && (field === 'comments' || field === 'live_comments')) {
            const from = (val.from as { id?: string; username?: string }) || {};
            const media = (val.media as { id?: string }) || {};
            const commentId = String(val.id || '');
            const text = String(val.text || '');
            if (!commentId || !text) continue;

            await processIncomingComment({
              account,
              platform: 'instagram',
              targetType: field === 'live_comments' ? 'live_comment' : 'specific_post',
              mediaId: media.id,
              commentId,
              commenterId: String(from.id || ''),
              commenterUsername: String(from.username || from.id || 'instagram_user'),
              commentText: text,
              createdTimestampMs: entry.time ? entry.time * 1000 : Date.now(),
            });
          } else if (platform === 'facebook' && field === 'feed') {
            if (val.item === 'comment' && val.verb === 'add') {
              const from = (val.from as { id?: string; name?: string }) || {};
              const commentId = String(val.comment_id || '');
              const postId = String(val.post_id || '');
              const text = String(val.message || '');
              if (!commentId || !text) continue;

              await processIncomingComment({
                account,
                platform: 'facebook',
                targetType: 'specific_post',
                mediaId: postId,
                commentId,
                commenterId: String(from.id || ''),
                commenterUsername: String(from.name || from.id || 'facebook_user'),
                commenterFirstName: String(from.name || '').split(' ')[0],
                commentText: text,
                createdTimestampMs: typeof val.created_time === 'number' ? val.created_time * 1000 : Date.now(),
              });
            }
          }
        }
      }
    } catch (err) {
      log('error', 'meta_webhook_async_processing_error', { error: String(err) });
    }
  });
});
