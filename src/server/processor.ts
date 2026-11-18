import { FieldValue } from 'firebase-admin/firestore';
import {
  extractEmailOrPhone,
  findMatchingRule,
  normalizeText,
  pickRandomVariation,
  renderTemplate,
} from '../lib/matcher.ts';
import type {
  AutomationRule,
  Contact,
  Platform,
  SocialAccount,
  TargetType,
  UserSettings,
} from '../types/index.ts';
import { decryptSecret } from './crypto.ts';
import { getAdminServices } from './firebaseAdmin.ts';
import { log } from './logger.ts';
import {
  checkInstagramUserFollow,
  replyToFacebookComment,
  replyToInstagramComment,
  sendMetaMessage,
} from './metaApi.ts';
import { automationQueue, type ClassifiedApiError } from './queue.ts';

function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function incrementDailyStat(
  userId: string,
  deltas: Record<string, number>
): Promise<void> {
  const { db } = getAdminServices();
  if (!db) return;
  const date = todayDateKey();
  const statId = `${userId}_${date}`;
  const updatePayload: Record<string, unknown> = {
    userId,
    date,
    updatedAt: new Date().toISOString(),
  };
  for (const [k, v] of Object.entries(deltas)) {
    updatePayload[k] = FieldValue.increment(v);
  }
  await db.collection('stats').doc(statId).set(updatePayload, { merge: true });
}

async function createWarningNotification(
  userId: string,
  type: 'token_expiring' | 'high_failure_rate' | 'quota_warning',
  title: string,
  message: string
): Promise<void> {
  const { db } = getAdminServices();
  if (!db) return;
  await db.collection('notifications').add({
    userId,
    type,
    title,
    message,
    read: false,
    createdAt: new Date().toISOString(),
  });
}

async function getUserSettings(userId: string): Promise<UserSettings> {
  const { db } = getAdminServices();
  const defaults: UserSettings = {
    userId,
    metaAppId: process.env.META_APP_ID || '',
    hasMetaAppSecret: Boolean(process.env.META_APP_SECRET),
    metaVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || '',
    youtubeClientId: process.env.YOUTUBE_CLIENT_ID || '',
    hasYoutubeClientSecret: Boolean(process.env.YOUTUBE_CLIENT_SECRET),
    hasYoutubeApiKey: Boolean(process.env.YOUTUBE_API_KEY),
    minDelaySeconds: 3,
    maxDelaySeconds: 15,
    hourlyDmLimit: 200,
    timezone: 'Asia/Kolkata',
    language: 'en',
    notificationEmail: '',
    updatedAt: new Date().toISOString(),
  };
  if (!db) return defaults;
  const snap = await db.collection('settings').doc(userId).get();
  if (!snap.exists) return defaults;
  return { ...defaults, ...(snap.data() as Partial<UserSettings>) };
}

async function isKillSwitchActive(userId: string): Promise<boolean> {
  const { db } = getAdminServices();
  if (!db) return false;
  const snap = await db.collection('users').doc(userId).get();
  return Boolean(snap.exists && snap.data()?.pauseAllAutomations);
}

/**
 * Atomic event deduplication using Firestore document create()
 */
export async function claimEventDedupe(
  userId: string,
  platform: Platform,
  eventKey: string
): Promise<boolean> {
  const { db } = getAdminServices();
  if (!db) return false;
  const safeId = `${platform}_${eventKey}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  try {
    await db.collection('events').doc(safeId).create({
      userId,
      platform,
      eventKey,
      createdAt: new Date().toISOString(),
    });
    return true;
  } catch {
    return false;
  }
}

export async function getAccountAccessToken(accountId: string): Promise<string> {
  const { db } = getAdminServices();
  if (!db) return '';
  const snap = await db.collection('accountSecrets').doc(accountId).get();
  if (!snap.exists) return '';
  const enc = snap.data()?.accessTokenEnc as string | undefined;
  return enc ? decryptSecret(enc) : '';
}

export interface IncomingCommentInput {
  account: SocialAccount;
  platform: Platform;
  targetType: TargetType;
  mediaId?: string;
  commentId: string;
  commenterId: string;
  commenterUsername: string;
  commenterFirstName?: string;
  commentText: string;
  createdTimestampMs?: number;
}

export async function processIncomingComment(input: IncomingCommentInput): Promise<void> {
  const { db } = getAdminServices();
  if (!db) return;

  const { account, platform } = input;
  const userId = account.userId;

  // 1. Ignore comments from own account to prevent infinite loops
  if (
    input.commenterId === account.platformAccountId ||
    input.commenterId === account.pageId ||
    (input.commenterUsername &&
      account.username &&
      input.commenterUsername.toLowerCase() === account.username.toLowerCase())
  ) {
    return;
  }

  // 2. Check global kill switch
  if (await isKillSwitchActive(userId)) {
    log('info', 'automation_skipped_kill_switch', { userId, commentId: input.commentId });
    return;
  }

  // 3. Enforce Meta 7-day private reply rule
  if (
    (platform === 'instagram' || platform === 'facebook') &&
    input.createdTimestampMs &&
    Date.now() - input.createdTimestampMs > 7 * 24 * 60 * 60 * 1000
  ) {
    log('warn', 'meta_7day_window_expired', { commentId: input.commentId });
    return;
  }

  // 4. Deduplicate webhook delivery
  const claimed = await claimEventDedupe(userId, platform, input.commentId);
  if (!claimed) {
    log('info', 'duplicate_webhook_event_ignored', { commentId: input.commentId });
    return;
  }

  await incrementDailyStat(userId, { commentsReceived: 1 });

  // 5. Contact & STOP Opt-out / Blocklist check
  const contactId = `${userId}_${platform}_${input.commenterId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  const contactRef = db.collection('contacts').doc(contactId);
  const contactSnap = await contactRef.get();
  const existingContact = contactSnap.exists ? (contactSnap.data() as Contact) : null;

  if (existingContact?.blocked || existingContact?.optedOut) {
    log('info', 'contact_blocked_or_opted_out', { contactId });
    return;
  }

  // 6. Load active rules for this account
  const rulesSnap = await db
    .collection('rules')
    .where('accountId', '==', account.id)
    .where('status', '==', 'active')
    .get();

  const rules: AutomationRule[] = rulesSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<AutomationRule, 'id'>),
  }));

  const matchResult = findMatchingRule(rules, {
    platform,
    targetType: input.targetType,
    mediaId: input.mediaId,
    commentText: input.commentText,
    username: input.commenterUsername,
    firstName: input.commenterFirstName,
  });

  if (!matchResult.rule) {
    return;
  }

  const rule = matchResult.rule;

  // 7. Per-rule limits: one DM per user, cooldown hours, daily cap
  const today = todayDateKey();
  const dailySent = rule.dailySentDate === today ? rule.dailySentCount || 0 : 0;
  if (dailySent >= (rule.dailyCap || 500)) {
    log('warn', 'rule_daily_cap_reached', { ruleId: rule.id });
    return;
  }

  if (existingContact) {
    if (rule.oneDmPerUser && existingContact.lastRuleId === rule.id && existingContact.lastDmSentAt) {
      log('info', 'rule_one_dm_per_user_skipped', { ruleId: rule.id, contactId });
      return;
    }
    if (rule.cooldownHours > 0 && existingContact.lastDmSentAt) {
      const hoursSince =
        (Date.now() - new Date(existingContact.lastDmSentAt).getTime()) / (1000 * 60 * 60);
      if (hoursSince < rule.cooldownHours) {
        log('info', 'rule_cooldown_skipped', { ruleId: rule.id, contactId, hoursSince });
        return;
      }
    }
  }

  // Upsert contact
  const nowIso = new Date().toISOString();
  await contactRef.set(
    {
      id: contactId,
      userId,
      platform,
      platformUserId: input.commenterId,
      username: input.commenterUsername,
      firstName: input.commenterFirstName || input.commenterUsername,
      blocked: false,
      optedOut: false,
      totalInteractions: FieldValue.increment(1),
      lastInteractedAt: nowIso,
      lastRuleId: rule.id,
      createdAt: existingContact?.createdAt || nowIso,
      updatedAt: nowIso,
    },
    { merge: true }
  );

  // Create initial log doc
  const logRef = await db.collection('logs').add({
    userId,
    ruleId: rule.id,
    ruleName: rule.name,
    accountId: account.id,
    platform,
    targetMediaId: input.mediaId || '',
    commentId: input.commentId,
    commenterId: input.commenterId,
    commenterUsername: input.commenterUsername,
    commentText: input.commentText.slice(0, 1800),
    keywordMatched: matchResult.matchedKeyword,
    dmStatus: 'queued',
    publicReplyStatus: rule.publicReplyEnabled ? 'pending' : 'disabled',
    attempts: 0,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  const settings = await getUserSettings(userId);
  const accessToken = await getAccountAccessToken(account.id);

  if (!accessToken) {
    await logRef.update({
      dmStatus: 'failed',
      errorMessage: 'Account access token missing. Please reconnect account.',
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  // 8. Enqueue rate-limited execution with random human delay (3-15s)
  automationQueue.enqueue({
    id: logRef.id,
    userId,
    description: `${platform} automation for rule ${rule.name}`,
    minDelaySec: settings.minDelaySeconds,
    maxDelaySec: settings.maxDelaySeconds,
    hourlyLimit: settings.hourlyDmLimit,
    attempts: 0,
    maxAttempts: 3,
    run: async () => {
      const vars = {
        firstName: input.commenterFirstName || input.commenterUsername,
        username: input.commenterUsername,
        commentText: input.commentText,
        link: rule.linkUrl,
      };

      const dmRaw = pickRandomVariation(
        rule.dmVariations,
        'Hey {first_name}! Here is your link: {link}'
      );
      const dmText = renderTemplate(dmRaw, vars);

      const metaTargetId = platform === 'facebook' ? account.pageId || account.platformAccountId : account.platformAccountId;
      const recipient = input.targetType === 'dm_keyword'
        ? { id: input.commenterId }
        : { comment_id: input.commentId };

      if (rule.dmFlow === 'two_step') {
        await sendMetaMessage({
          accountId: metaTargetId,
          accessToken,
          recipient,
          text: renderTemplate(rule.step1Message || 'Tap below and I will send the link right away!', vars),
          postbackTitle: rule.step1ButtonText || 'Send me the link',
          postbackPayload: `TWO_STEP::${rule.id}::${contactId}`,
        });
        await logRef.update({
          dmStatus: 'awaiting_postback',
          attempts: FieldValue.increment(1),
          updatedAt: new Date().toISOString(),
        });
      } else if (rule.dmFlow === 'follow_gate') {
        await sendMetaMessage({
          accountId: metaTargetId,
          accessToken,
          recipient,
          text: renderTemplate(
            rule.followGateMessage || 'Hey {first_name}! Follow our account first, then tap below to unlock your link:',
            vars
          ),
          postbackTitle: rule.followGateButtonText || "I'm following",
          postbackPayload: `FOLLOW_GATE::${rule.id}::${contactId}`,
        });
        await logRef.update({
          dmStatus: 'awaiting_follow',
          attempts: FieldValue.increment(1),
          updatedAt: new Date().toISOString(),
        });
      } else {
        // Simple flow
        await sendMetaMessage({
          accountId: metaTargetId,
          accessToken,
          recipient,
          text: dmText,
          buttonUrl: rule.linkUrl || undefined,
          buttonLabel: rule.buttonLabel || 'Open Link',
          imageUrl: rule.imageUrl || undefined,
        });

        await logRef.update({
          dmStatus: 'sent',
          attempts: FieldValue.increment(1),
          updatedAt: new Date().toISOString(),
        });

        await contactRef.update({
          lastDmSentAt: new Date().toISOString(),
          awaitingLeadForRuleId: rule.leadCaptureEnabled ? rule.id : '',
          updatedAt: new Date().toISOString(),
        });

        if (rule.leadCaptureEnabled && rule.leadCapturePrompt) {
          await sendMetaMessage({
            accountId: metaTargetId,
            accessToken,
            recipient: { id: input.commenterId },
            text: renderTemplate(rule.leadCapturePrompt, vars),
          });
        }
      }

      // Public comment reply
      let publicStatus: 'sent' | 'failed' | 'disabled' = 'disabled';
      if (rule.publicReplyEnabled && input.targetType !== 'dm_keyword' && input.targetType !== 'story_reply') {
        const pubRaw = pickRandomVariation(
          rule.publicReplyVariations,
          'Sent you a DM! Check your inbox ✨'
        );
        const pubText = renderTemplate(pubRaw, vars);
        try {
          if (platform === 'instagram') {
            await replyToInstagramComment({
              commentId: input.commentId,
              accessToken,
              message: pubText,
            });
          } else if (platform === 'facebook') {
            await replyToFacebookComment({
              commentId: input.commentId,
              accessToken,
              message: pubText,
            });
          }
          publicStatus = 'sent';
        } catch (pubErr) {
          log('warn', 'public_reply_failed', { error: String(pubErr), commentId: input.commentId });
          publicStatus = 'failed';
        }
      }

      await logRef.update({ publicReplyStatus: publicStatus });
      await db.collection('rules').doc(rule.id).update({
        triggerCount: FieldValue.increment(1),
        dmSentCount: FieldValue.increment(1),
        dailySentDate: today,
        dailySentCount: rule.dailySentDate === today ? FieldValue.increment(1) : 1,
        updatedAt: new Date().toISOString(),
      });
      await incrementDailyStat(userId, { dmsSent: 1, dmsDelivered: 1 });
    },
    onPermanentFailure: async (classified: ClassifiedApiError) => {
      await logRef.update({
        dmStatus: 'failed',
        errorMessage: classified.message,
        errorCode: classified.code || classified.kind,
        updatedAt: new Date().toISOString(),
      });
      await incrementDailyStat(userId, { dmsFailed: 1 });

      if (classified.kind === 'token_expired') {
        await db.collection('accounts').doc(account.id).update({
          status: 'expired',
          lastError: classified.message,
          updatedAt: new Date().toISOString(),
        });
        await createWarningNotification(
          userId,
          'token_expiring',
          `${account.platform} token expired`,
          `Please reconnect or refresh @${account.username} in Accounts.`
        );
      }

      // Automatic Public Fallback Reply when DM is restricted or window expired
      if (classified.kind === 'dm_restricted' && input.targetType !== 'dm_keyword') {
        const fallbackMsg =
          rule.fallbackPublicReply ||
          `@${input.commenterUsername} Could not DM you (check privacy settings). Please follow and message us directly for the link!`;
        try {
          if (platform === 'instagram') {
            await replyToInstagramComment({
              commentId: input.commentId,
              accessToken,
              message: fallbackMsg,
            });
          } else if (platform === 'facebook') {
            await replyToFacebookComment({
              commentId: input.commentId,
              accessToken,
              message: fallbackMsg,
            });
          }
          await logRef.update({ publicReplyStatus: 'fallback_sent' });
        } catch {
          // Ignore fallback failure
        }
      }
    },
  });
}

/**
 * Handles incoming DM messages (STOP opt-out, Lead Capture email/phone, or DM keyword triggers)
 */
export async function processIncomingDirectMessage(params: {
  account: SocialAccount;
  platform: Platform;
  senderId: string;
  messageId: string;
  text: string;
}): Promise<void> {
  const { db } = getAdminServices();
  if (!db) return;

  const { account, platform, senderId, text } = params;
  const userId = account.userId;

  if (senderId === account.platformAccountId || senderId === account.pageId) return;

  const claimed = await claimEventDedupe(userId, platform, `dm_${params.messageId}`);
  if (!claimed) return;

  const contactId = `${userId}_${platform}_${senderId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  const contactRef = db.collection('contacts').doc(contactId);
  const contactSnap = await contactRef.get();
  const contact = contactSnap.exists ? (contactSnap.data() as Contact) : null;

  const norm = normalizeText(text);

  // 1. Check STOP / Unsubscribe opt-out
  if (norm === 'stop' || norm === 'unsubscribe' || norm === 'band karo' || norm === 'रुकें') {
    await contactRef.set(
      {
        id: contactId,
        userId,
        platform,
        platformUserId: senderId,
        username: contact?.username || senderId,
        blocked: false,
        optedOut: true,
        optedOutAt: new Date().toISOString(),
        totalInteractions: FieldValue.increment(1),
        lastInteractedAt: new Date().toISOString(),
        createdAt: contact?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    return;
  }

  if (contact?.blocked || contact?.optedOut) return;

  // 2. Check if awaiting Lead Capture reply (email/phone)
  if (contact?.awaitingLeadForRuleId) {
    const extracted = extractEmailOrPhone(text);
    if (extracted.email || extracted.phone) {
      const ruleSnap = await db.collection('rules').doc(contact.awaitingLeadForRuleId).get();
      const ruleName = ruleSnap.exists ? (ruleSnap.data()?.name as string) : 'Automation Rule';
      await db.collection('leads').add({
        userId,
        ruleId: contact.awaitingLeadForRuleId,
        ruleName,
        accountId: account.id,
        platform,
        contactId,
        username: contact.username || senderId,
        email: extracted.email || '',
        phone: extracted.phone || '',
        rawReply: text.slice(0, 300),
        createdAt: new Date().toISOString(),
      });
      await contactRef.update({
        awaitingLeadForRuleId: '',
        updatedAt: new Date().toISOString(),
      });
      await incrementDailyStat(userId, { leadsCaptured: 1 });
      return;
    }
  }

  // 3. Otherwise treat as DM keyword trigger
  await processIncomingComment({
    account,
    platform,
    targetType: 'dm_keyword',
    commentId: `dm_${params.messageId}`,
    commenterId: senderId,
    commenterUsername: contact?.username || senderId,
    commenterFirstName: contact?.firstName,
    commentText: text,
  });
}

/**
 * Handles Postback button clicks for Two-Step and Follow-Gate flows
 */
export async function processPostbackEvent(params: {
  account: SocialAccount;
  platform: Platform;
  senderId: string;
  payload: string;
}): Promise<void> {
  const { db } = getAdminServices();
  if (!db) return;

  const parts = params.payload.split('::');
  if (parts.length < 3) return;
  const [flowKind, ruleId, contactId] = parts;

  const userId = params.account.userId;
  if (await isKillSwitchActive(userId)) return;

  const ruleSnap = await db.collection('rules').doc(ruleId).get();
  if (!ruleSnap.exists) return;
  const rule = { id: ruleSnap.id, ...(ruleSnap.data() as Omit<AutomationRule, 'id'>) };

  const contactSnap = await db.collection('contacts').doc(contactId).get();
  const contact = contactSnap.exists ? (contactSnap.data() as Contact) : null;
  if (contact?.blocked || contact?.optedOut) return;

  const accessToken = await getAccountAccessToken(params.account.id);
  if (!accessToken) return;

  const metaTargetId =
    params.platform === 'facebook'
      ? params.account.pageId || params.account.platformAccountId
      : params.account.platformAccountId;

  await incrementDailyStat(userId, { buttonClicks: 1 });

  const vars = {
    firstName: contact?.firstName || contact?.username || 'there',
    username: contact?.username || params.senderId,
    commentText: '',
    link: rule.linkUrl,
  };

  if (flowKind === 'FOLLOW_GATE' && params.platform === 'instagram') {
    let isFollowing = false;
    try {
      const profile = await checkInstagramUserFollow({
        igScopedUserId: params.senderId,
        accessToken,
      });
      isFollowing = profile.isFollowing;
    } catch (err) {
      log('warn', 'follow_gate_check_error', { error: String(err) });
      // Do not fail silently; treat as not verified yet
    }

    const attempts = (contact?.followGateAttempts || 0) + 1;
    if (!isFollowing) {
      if (attempts <= 3) {
        await db.collection('contacts').doc(contactId).set(
          { followGateAttempts: attempts, updatedAt: new Date().toISOString() },
          { merge: true }
        );
        await sendMetaMessage({
          accountId: metaTargetId,
          accessToken,
          recipient: { id: params.senderId },
          text: renderTemplate(
            rule.followGateRetryMessage ||
              'Looks like you have not followed yet! Please hit Follow on our profile and tap below again.',
            vars
          ),
          postbackTitle: rule.followGateButtonText || "I'm following",
          postbackPayload: `FOLLOW_GATE::${rule.id}::${contactId}`,
        });
      }
      return;
    }
    await incrementDailyStat(userId, { followGateConversions: 1 });
  }

  // Send final link DM
  const dmRaw = pickRandomVariation(rule.dmVariations, 'Here is your link: {link}');
  const dmText = renderTemplate(dmRaw, vars);

  await sendMetaMessage({
    accountId: metaTargetId,
    accessToken,
    recipient: { id: params.senderId },
    text: dmText,
    buttonUrl: rule.linkUrl || undefined,
    buttonLabel: rule.buttonLabel || 'Open Link',
    imageUrl: rule.imageUrl || undefined,
  });

  await db.collection('contacts').doc(contactId).set(
    {
      followGateAttempts: 0,
      lastDmSentAt: new Date().toISOString(),
      awaitingLeadForRuleId: rule.leadCaptureEnabled ? rule.id : '',
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  await incrementDailyStat(userId, { dmsSent: 1, dmsDelivered: 1, linkClicks: 1 });

  if (rule.leadCaptureEnabled && rule.leadCapturePrompt) {
    await sendMetaMessage({
      accountId: metaTargetId,
      accessToken,
      recipient: { id: params.senderId },
      text: renderTemplate(rule.leadCapturePrompt, vars),
    });
  }
}
