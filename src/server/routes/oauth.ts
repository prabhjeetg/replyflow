import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../authMiddleware.ts';
import { decryptSecret, encryptSecret } from '../crypto.ts';
import { getAdminServices } from '../firebaseAdmin.ts';
import { readLocalStore, writeLocalStore } from '../localStore.ts';
import { log } from '../logger.ts';
import {
  exchangeForLongLivedMetaToken,
  fetchMetaManagedAccounts,
  subscribePageWebhook,
} from '../metaApi.ts';
import { fetchMyYoutubeChannel } from '../youtubeApi.ts';
import type { SocialAccount } from '../../types/index.ts';

export const oauthRouter = Router();

// Short-lived in-memory state map for CSRF protection (state -> { userId, platform, createdAt })
const oauthStateStore = new Map<
  string,
  { userId: string; platform: 'meta' | 'youtube'; createdAt: number }
>();

function getAppBaseUrl(req: Request): string {
  if (process.env.APP_URL && !process.env.APP_URL.includes('MY_APP_URL')) {
    return process.env.APP_URL.replace(/\/+$/, '');
  }
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  return `${proto}://${host}`;
}

async function getUserOAuthCreds(userId: string) {
  const { db } = getAdminServices();
  let metaAppId = process.env.META_APP_ID || '';
  let metaAppSecret = process.env.META_APP_SECRET || '';
  let ytClientId = process.env.YOUTUBE_CLIENT_ID || '';
  let ytClientSecret = process.env.YOUTUBE_CLIENT_SECRET || '';

  if (db) {
    const [settingsSnap, secretsSnap] = await Promise.all([
      db.collection('settings').doc(userId).get(),
      db.collection('settingsSecrets').doc(userId).get(),
    ]);
    if (settingsSnap.exists) {
      const s = settingsSnap.data()!;
      if (s.metaAppId) metaAppId = String(s.metaAppId);
      if (s.youtubeClientId) ytClientId = String(s.youtubeClientId);
    }
    if (secretsSnap.exists) {
      const sec = secretsSnap.data()!;
      if (sec.metaAppSecretEnc) metaAppSecret = decryptSecret(String(sec.metaAppSecretEnc));
      if (sec.youtubeClientSecretEnc) ytClientSecret = decryptSecret(String(sec.youtubeClientSecretEnc));
    }
  } else {
    const local = readLocalStore();
    if (local.settings.metaAppId) metaAppId = local.settings.metaAppId;
    if (local.settings.youtubeClientId) ytClientId = local.settings.youtubeClientId;
    if (local.settingsSecrets.metaAppSecretEnc) {
      metaAppSecret = decryptSecret(local.settingsSecrets.metaAppSecretEnc);
    }
    if (local.settingsSecrets.youtubeClientSecretEnc) {
      ytClientSecret = decryptSecret(local.settingsSecrets.youtubeClientSecretEnc);
    }
  }

  return { metaAppId, metaAppSecret, ytClientId, ytClientSecret };
}

function popupCallbackHtml(success: boolean, message: string, platform: string): string {
  const payload = JSON.stringify({
    type: success ? 'OAUTH_AUTH_SUCCESS' : 'OAUTH_AUTH_ERROR',
    platform,
    message,
  });
  return `<!doctype html>
<html>
  <head><title>ReplyFlow OAuth</title></head>
  <body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; color: #0f172a;">
    <div style="max-width: 420px; padding: 24px; background: white; border: 1px solid #e2e8f0; border-radius: 12px; text-align: center;">
      <h2 style="margin: 0 0 8px 0; font-size: 18px;">${success ? 'Connected Successfully' : 'Connection Failed'}</h2>
      <p style="margin: 0 0 16px 0; font-size: 14px; color: #475569;">${message.replace(/</g, '&lt;')}</p>
      <script>
        if (window.opener) {
          window.opener.postMessage(${payload}, '*');
          setTimeout(() => window.close(), 1200);
        } else {
          setTimeout(() => { window.location.href = '/accounts'; }, 1500);
        }
      </script>
    </div>
  </body>
</html>`;
}

// ---------------------------------------------------------------------------
// 1. META (Instagram + Facebook Pages) OAuth URL & Callback
// ---------------------------------------------------------------------------
oauthRouter.get('/api/oauth/meta/url', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.uid!;
  const creds = await getUserOAuthCreds(userId);
  if (!creds.metaAppId || !creds.metaAppSecret) {
    res.status(400).json({
      error: 'Please configure your Meta App ID and App Secret in Settings first.',
    });
    return;
  }

  const state = crypto.randomBytes(16).toString('hex');
  oauthStateStore.set(state, { userId, platform: 'meta', createdAt: Date.now() });

  const redirectUri = `${getAppBaseUrl(req)}/auth/meta/callback`;
  const scopes = [
    'instagram_basic',
    'instagram_manage_comments',
    'instagram_manage_messages',
    'pages_show_list',
    'pages_manage_metadata',
    'pages_read_engagement',
    'pages_messaging',
  ].join(',');

  const params = new URLSearchParams({
    client_id: creds.metaAppId,
    redirect_uri: redirectUri,
    state,
    scope: scopes,
    response_type: 'code',
  });

  res.json({ url: `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}` });
});

async function handleMetaCallback(req: Request, res: Response): Promise<void> {
  const code = String(req.query.code || '');
  const state = String(req.query.state || '');
  const errorDesc = String(req.query.error_description || req.query.error || '');

  if (errorDesc) {
    res.status(400).send(popupCallbackHtml(false, errorDesc, 'meta'));
    return;
  }

  const saved = oauthStateStore.get(state);
  oauthStateStore.delete(state);
  if (!saved || saved.platform !== 'meta' || Date.now() - saved.createdAt > 15 * 60 * 1000) {
    res.status(400).send(popupCallbackHtml(false, 'Invalid or expired OAuth state.', 'meta'));
    return;
  }

  const { db } = getAdminServices();

  try {
    const creds = await getUserOAuthCreds(saved.userId);
    const redirectUri = `${getAppBaseUrl(req)}/auth/meta/callback`;
    const tokenQs = new URLSearchParams({
      client_id: creds.metaAppId,
      redirect_uri: redirectUri,
      client_secret: creds.metaAppSecret,
      code,
    });
    const tokenRes = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?${tokenQs.toString()}`);
    const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: { message?: string } };

    if (!tokenRes.ok || !tokenJson.access_token) {
      throw new Error(tokenJson.error?.message || 'Meta OAuth token exchange failed');
    }

    const longLived = await exchangeForLongLivedMetaToken({
      shortLivedToken: tokenJson.access_token,
      appId: creds.metaAppId,
      appSecret: creds.metaAppSecret,
    });

    const { pages } = await fetchMetaManagedAccounts(longLived.accessToken);
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + longLived.expiresInSeconds * 1000).toISOString();

    let count = 0;
    for (const p of pages) {
      const fbAccountId = `${saved.userId}_fb_${p.pageId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      const fbAccount: SocialAccount = {
        id: fbAccountId,
        userId: saved.userId,
        platform: 'facebook',
        platformAccountId: p.pageId,
        pageId: p.pageId,
        username: p.pageName,
        displayName: p.pageName,
        profilePictureUrl: p.pagePicture || '',
        status: 'connected',
        tokenExpiresAt: expiresAt,
        lastRefreshedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      if (db) {
        await db.collection('accounts').doc(fbAccountId).set(fbAccount);
        await db.collection('accountSecrets').doc(fbAccountId).set({
          userId: saved.userId,
          platform: 'facebook',
          accessTokenEnc: encryptSecret(p.pageAccessToken),
          updatedAt: nowIso,
        });
      } else {
        writeLocalStore((d) => {
          d.accounts = [fbAccount, ...d.accounts.filter((a) => a.id !== fbAccountId)];
          d.accountSecrets[fbAccountId] = {
            accessTokenEnc: encryptSecret(p.pageAccessToken),
            updatedAt: nowIso,
          };
        });
      }
      count++;

      try {
        await subscribePageWebhook({ pageId: p.pageId, pageAccessToken: p.pageAccessToken });
      } catch (subErr) {
        log('warn', 'meta_page_webhook_subscribe_warn', { pageId: p.pageId, error: String(subErr) });
      }

      if (p.igBusinessAccount) {
        const ig = p.igBusinessAccount;
        const igAccountId = `${saved.userId}_ig_${ig.igId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
        const igAccount: SocialAccount = {
          id: igAccountId,
          userId: saved.userId,
          platform: 'instagram',
          platformAccountId: ig.igId,
          pageId: p.pageId,
          username: ig.username,
          displayName: ig.name || ig.username,
          profilePictureUrl: ig.profilePictureUrl || '',
          status: 'connected',
          tokenExpiresAt: expiresAt,
          lastRefreshedAt: nowIso,
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        if (db) {
          await db.collection('accounts').doc(igAccountId).set(igAccount);
          await db.collection('accountSecrets').doc(igAccountId).set({
            userId: saved.userId,
            platform: 'instagram',
            accessTokenEnc: encryptSecret(p.pageAccessToken),
            updatedAt: nowIso,
          });
        } else {
          writeLocalStore((d) => {
            d.accounts = [igAccount, ...d.accounts.filter((a) => a.id !== igAccountId)];
            d.accountSecrets[igAccountId] = {
              accessTokenEnc: encryptSecret(p.pageAccessToken),
              updatedAt: nowIso,
            };
          });
        }
        count++;
      }
    }

    res.send(
      popupCallbackHtml(
        true,
        `Connected ${count} Facebook/Instagram account(s). You can close this window.`,
        'meta'
      )
    );
  } catch (err) {
    log('error', 'meta_oauth_callback_error', { error: String(err) });
    res.status(500).send(popupCallbackHtml(false, String(err), 'meta'));
  }
}

oauthRouter.get(['/auth/meta/callback', '/auth/meta/callback/'], handleMetaCallback);

// ---------------------------------------------------------------------------
// 2. YOUTUBE (Google OAuth) URL & Callback
// ---------------------------------------------------------------------------
oauthRouter.get('/api/oauth/youtube/url', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.uid!;
  const creds = await getUserOAuthCreds(userId);
  if (!creds.ytClientId || !creds.ytClientSecret) {
    res.status(400).json({
      error: 'Please configure your YouTube Client ID and Client Secret in Settings first.',
    });
    return;
  }

  const state = crypto.randomBytes(16).toString('hex');
  oauthStateStore.set(state, { userId, platform: 'youtube', createdAt: Date.now() });

  const redirectUri = `${getAppBaseUrl(req)}/auth/youtube/callback`;
  const params = new URLSearchParams({
    client_id: creds.ytClientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    state,
    scope: [
      'https://www.googleapis.com/auth/youtube.force-ssl',
      'https://www.googleapis.com/auth/youtube.readonly',
    ].join(' '),
  });

  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
});

async function handleYoutubeCallback(req: Request, res: Response): Promise<void> {
  const code = String(req.query.code || '');
  const state = String(req.query.state || '');
  const errorDesc = String(req.query.error || '');

  if (errorDesc) {
    res.status(400).send(popupCallbackHtml(false, errorDesc, 'youtube'));
    return;
  }

  const saved = oauthStateStore.get(state);
  oauthStateStore.delete(state);
  if (!saved || saved.platform !== 'youtube' || Date.now() - saved.createdAt > 15 * 60 * 1000) {
    res.status(400).send(popupCallbackHtml(false, 'Invalid or expired OAuth state.', 'youtube'));
    return;
  }

  const { db } = getAdminServices();

  try {
    const creds = await getUserOAuthCreds(saved.userId);
    const redirectUri = `${getAppBaseUrl(req)}/auth/youtube/callback`;

    const body = new URLSearchParams({
      code,
      client_id: creds.ytClientId,
      client_secret: creds.ytClientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const tokenJson = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error_description?: string;
    };

    if (!tokenRes.ok || !tokenJson.access_token) {
      throw new Error(tokenJson.error_description || 'Google OAuth exchange failed');
    }

    const ch = await fetchMyYoutubeChannel(tokenJson.access_token);
    const nowIso = new Date().toISOString();
    const docId = `${saved.userId}_yt_${ch.channelId}`.replace(/[^a-zA-Z0-9_-]/g, '_');

    const ytAccount: SocialAccount = {
      id: docId,
      userId: saved.userId,
      platform: 'youtube',
      platformAccountId: ch.channelId,
      username: ch.customUrl || ch.title,
      displayName: ch.title,
      profilePictureUrl: ch.thumbnailUrl || '',
      status: 'connected',
      tokenExpiresAt: new Date(Date.now() + (tokenJson.expires_in || 3600) * 1000).toISOString(),
      lastRefreshedAt: nowIso,
      youtubeQuotaUsedToday: 0,
      youtubeQuotaResetDate: nowIso.slice(0, 10),
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    if (db) {
      await db.collection('accounts').doc(docId).set(ytAccount);
      await db.collection('accountSecrets').doc(docId).set({
        userId: saved.userId,
        platform: 'youtube',
        accessTokenEnc: encryptSecret(tokenJson.access_token),
        refreshTokenEnc: tokenJson.refresh_token ? encryptSecret(tokenJson.refresh_token) : '',
        updatedAt: nowIso,
      });
    } else {
      writeLocalStore((d) => {
        d.accounts = [ytAccount, ...d.accounts.filter((a) => a.id !== docId)];
        d.accountSecrets[docId] = {
          accessTokenEnc: encryptSecret(tokenJson.access_token!),
          refreshTokenEnc: tokenJson.refresh_token ? encryptSecret(tokenJson.refresh_token) : '',
          updatedAt: nowIso,
        };
      });
    }

    res.send(popupCallbackHtml(true, `Connected YouTube channel: ${ch.title}`, 'youtube'));
  } catch (err) {
    log('error', 'youtube_oauth_callback_error', { error: String(err) });
    res.status(500).send(popupCallbackHtml(false, String(err), 'youtube'));
  }
}

oauthRouter.get(['/auth/youtube/callback', '/auth/youtube/callback/'], handleYoutubeCallback);
