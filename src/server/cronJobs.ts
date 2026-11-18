import cron from 'node-cron';
import { FieldValue } from 'firebase-admin/firestore';
import { findMatchingRule, pickRandomVariation, renderTemplate } from '../lib/matcher.ts';
import type { AutomationRule, SocialAccount } from '../types/index.ts';
import { decryptSecret, encryptSecret } from './crypto.ts';
import { getAdminServices } from './firebaseAdmin.ts';
import { log } from './logger.ts';
import { exchangeForLongLivedMetaToken } from './metaApi.ts';
import { claimEventDedupe, getAccountAccessToken } from './processor.ts';
import {
  pollVideoCommentThreads,
  refreshGoogleOAuthToken,
  replyToYoutubeComment,
  YOUTUBE_QUOTA_SAFETY_THRESHOLD,
} from './youtubeApi.ts';

function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function runYoutubePollingCycle(): Promise<void> {
  const { db, configured } = getAdminServices();
  if (!db || !configured) return;

  const today = todayDateKey();

  // Query all active YouTube rules
  const rulesSnap = await db
    .collection('rules')
    .where('platform', '==', 'youtube')
    .where('status', '==', 'active')
    .get();

  if (rulesSnap.empty) return;

  // Group rules by accountId so we only poll videos that have active rules
  const rulesByAccount = new Map<string, AutomationRule[]>();
  for (const doc of rulesSnap.docs) {
    const rule = { id: doc.id, ...(doc.data() as Omit<AutomationRule, 'id'>) };
    const list = rulesByAccount.get(rule.accountId) || [];
    list.push(rule);
    rulesByAccount.set(rule.accountId, list);
  }

  for (const [accountId, rules] of rulesByAccount.entries()) {
    const accSnap = await db.collection('accounts').doc(accountId).get();
    if (!accSnap.exists) continue;
    const account = { id: accSnap.id, ...(accSnap.data() as Omit<SocialAccount, 'id'>) };

    // Kill switch check
    const userSnap = await db.collection('users').doc(account.userId).get();
    if (userSnap.exists && userSnap.data()?.pauseAllAutomations) continue;

    // Quota check
    let quotaUsed =
      account.youtubeQuotaResetDate === today ? account.youtubeQuotaUsedToday || 0 : 0;

    if (quotaUsed >= YOUTUBE_QUOTA_SAFETY_THRESHOLD) {
      log('warn', 'youtube_quota_safety_pause', { accountId, quotaUsed });
      continue;
    }

    let accessToken = await getAccountAccessToken(accountId);
    const secretSnap = await db.collection('accountSecrets').doc(accountId).get();
    const refreshTokenEnc = secretSnap.data()?.refreshTokenEnc as string | undefined;
    const settingsSecretSnap = await db.collection('settingsSecrets').doc(account.userId).get();
    const settingsSnap = await db.collection('settings').doc(account.userId).get();

    const ytClientId =
      (settingsSnap.data()?.youtubeClientId as string) || process.env.YOUTUBE_CLIENT_ID || '';
    const ytClientSecret =
      (settingsSecretSnap.data()?.youtubeClientSecretEnc
        ? decryptSecret(settingsSecretSnap.data()!.youtubeClientSecretEnc)
        : '') ||
      process.env.YOUTUBE_CLIENT_SECRET ||
      '';
    const ytApiKey =
      (settingsSecretSnap.data()?.youtubeApiKeyEnc
        ? decryptSecret(settingsSecretSnap.data()!.youtubeApiKeyEnc)
        : '') ||
      process.env.YOUTUBE_API_KEY ||
      '';

    // Refresh short-lived Google access token if needed
    if (
      refreshTokenEnc &&
      ytClientId &&
      ytClientSecret &&
      account.tokenExpiresAt &&
      new Date(account.tokenExpiresAt).getTime() - Date.now() < 5 * 60 * 1000
    ) {
      try {
        const refreshed = await refreshGoogleOAuthToken({
          refreshToken: decryptSecret(refreshTokenEnc),
          clientId: ytClientId,
          clientSecret: ytClientSecret,
        });
        accessToken = refreshed.accessToken;
        const newExpiry = new Date(Date.now() + refreshed.expiresInSeconds * 1000).toISOString();
        await db.collection('accountSecrets').doc(accountId).set(
          {
            accessTokenEnc: encryptSecret(accessToken),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
        await db.collection('accounts').doc(accountId).update({
          tokenExpiresAt: newExpiry,
          lastRefreshedAt: new Date().toISOString(),
          status: 'connected',
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        log('error', 'youtube_token_refresh_failed', { accountId, error: String(err) });
      }
    }

    // Collect distinct videoIds targeted by active rules
    const videoIds = new Set<string>();
    for (const r of rules) {
      if (r.targetMediaId) videoIds.add(r.targetMediaId);
    }

    for (const videoId of videoIds) {
      if (quotaUsed >= YOUTUBE_QUOTA_SAFETY_THRESHOLD) break;
      try {
        const polled = await pollVideoCommentThreads({
          videoId,
          accessToken: accessToken || undefined,
          apiKey: ytApiKey || undefined,
        });
        quotaUsed += polled.quotaCost;

        for (const c of polled.comments) {
          if (c.authorChannelId === account.platformAccountId) continue;
          const claimed = await claimEventDedupe(account.userId, 'youtube', c.commentId);
          if (!claimed) continue;

          const matched = findMatchingRule(rules, {
            platform: 'youtube',
            targetType: 'specific_post',
            mediaId: videoId,
            commentText: c.textOriginal,
            username: c.authorDisplayName,
          });
          if (!matched.rule || !accessToken) continue;

          const rule = matched.rule;
          const replyTemplate = pickRandomVariation(
            rule.publicReplyVariations.length > 0 ? rule.publicReplyVariations : rule.dmVariations,
            'Thanks for commenting! Here is your link: {link}'
          );
          const replyText = renderTemplate(replyTemplate, {
            firstName: c.authorDisplayName,
            username: c.authorDisplayName,
            commentText: c.textOriginal,
            link: rule.linkUrl,
          });

          try {
            await replyToYoutubeComment({
              parentCommentId: c.commentId,
              text: replyText,
              accessToken,
            });
            quotaUsed += 50;

            await db.collection('logs').add({
              userId: account.userId,
              ruleId: rule.id,
              ruleName: rule.name,
              accountId,
              platform: 'youtube',
              targetMediaId: videoId,
              commentId: c.commentId,
              commenterId: c.authorChannelId,
              commenterUsername: c.authorDisplayName,
              commentText: c.textOriginal.slice(0, 1800),
              keywordMatched: matched.matchedKeyword,
              dmStatus: 'public_only',
              publicReplyStatus: 'sent',
              createdAt: new Date().toISOString(),
            });

            await db.collection('stats').doc(`${account.userId}_${today}`).set(
              {
                userId: account.userId,
                date: today,
                commentsReceived: FieldValue.increment(1),
                youtubeReplies: FieldValue.increment(1),
                youtubeQuotaUsed: FieldValue.increment(51),
                updatedAt: new Date().toISOString(),
              },
              { merge: true }
            );
          } catch (replyErr) {
            await db.collection('logs').add({
              userId: account.userId,
              ruleId: rule.id,
              ruleName: rule.name,
              accountId,
              platform: 'youtube',
              targetMediaId: videoId,
              commentId: c.commentId,
              commenterId: c.authorChannelId,
              commenterUsername: c.authorDisplayName,
              commentText: c.textOriginal.slice(0, 1800),
              keywordMatched: matched.matchedKeyword,
              dmStatus: 'failed',
              publicReplyStatus: 'failed',
              errorMessage: String(replyErr),
              createdAt: new Date().toISOString(),
            });
          }
        }
      } catch (pollErr) {
        log('warn', 'youtube_video_poll_error', { videoId, error: String(pollErr) });
      }
    }

    await db.collection('accounts').doc(accountId).update({
      youtubeQuotaUsedToday: quotaUsed,
      youtubeQuotaResetDate: today,
      updatedAt: new Date().toISOString(),
    });

    if (quotaUsed >= YOUTUBE_QUOTA_SAFETY_THRESHOLD) {
      await db.collection('notifications').add({
        userId: account.userId,
        type: 'quota_warning',
        title: 'YouTube Daily Quota Almost Full',
        message: `YouTube polling paused automatically at ${quotaUsed}/10,000 units to stay within the free daily quota.`,
        read: false,
        createdAt: new Date().toISOString(),
      });
    }
  }
}

export async function runMetaTokenMaintenance(): Promise<void> {
  const { db, configured } = getAdminServices();
  if (!db || !configured) return;

  const snap = await db.collection('accounts').where('platform', 'in', ['instagram', 'facebook']).get();
  const now = Date.now();
  const fiftyDaysMs = 50 * 24 * 60 * 60 * 1000;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  for (const doc of snap.docs) {
    const account = { id: doc.id, ...(doc.data() as Omit<SocialAccount, 'id'>) };
    const lastRefreshedMs = account.lastRefreshedAt
      ? new Date(account.lastRefreshedAt).getTime()
      : new Date(account.createdAt).getTime();

    const expiresMs = account.tokenExpiresAt
      ? new Date(account.tokenExpiresAt).getTime()
      : now + 60 * 24 * 60 * 60 * 1000;

    // Warn if expiring in < 7 days
    if (expiresMs - now < sevenDaysMs && expiresMs > now) {
      await db.collection('notifications').add({
        userId: account.userId,
        type: 'token_expiring',
        title: `${account.platform} token expiring soon`,
        message: `Token for @${account.username} expires on ${account.tokenExpiresAt?.slice(0, 10)}. Refresh it in Accounts.`,
        read: false,
        createdAt: new Date().toISOString(),
      });
    }

    // Auto-refresh every 50 days
    if (now - lastRefreshedMs >= fiftyDaysMs) {
      try {
        const token = await getAccountAccessToken(account.id);
        const settingsSnap = await db.collection('settings').doc(account.userId).get();
        const secretsSnap = await db.collection('settingsSecrets').doc(account.userId).get();
        const appId = (settingsSnap.data()?.metaAppId as string) || process.env.META_APP_ID || '';
        const appSecret =
          (secretsSnap.data()?.metaAppSecretEnc
            ? decryptSecret(secretsSnap.data()!.metaAppSecretEnc)
            : '') ||
          process.env.META_APP_SECRET ||
          '';

        if (token && appId && appSecret) {
          const exchanged = await exchangeForLongLivedMetaToken({
            shortLivedToken: token,
            appId,
            appSecret,
          });
          await db.collection('accountSecrets').doc(account.id).set(
            {
              accessTokenEnc: encryptSecret(exchanged.accessToken),
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
          await db.collection('accounts').doc(account.id).update({
            tokenExpiresAt: new Date(now + exchanged.expiresInSeconds * 1000).toISOString(),
            lastRefreshedAt: new Date().toISOString(),
            status: 'connected',
            updatedAt: new Date().toISOString(),
          });
          log('info', 'meta_50day_auto_refresh_success', { accountId: account.id });
        }
      } catch (err) {
        log('error', 'meta_50day_auto_refresh_failed', { accountId: account.id, error: String(err) });
      }
    }
  }
}

let jobsStarted = false;
let cronPausedDueToPermissions = false;

function isFirestoreConfigOrPermissionError(err: unknown): boolean {
  const anyErr = err as { code?: number | string; message?: string };
  const msg = anyErr?.message || String(err);
  return (
    anyErr?.code === 7 ||
    anyErr?.code === 5 ||
    /PERMISSION_DENIED|NOT_FOUND/i.test(msg)
  );
}

export function startScheduledJobs(): void {
  if (jobsStarted) return;
  jobsStarted = true;

  // Smart YouTube comment polling every 4 minutes
  cron.schedule('*/4 * * * *', () => {
    if (cronPausedDueToPermissions) return;
    void runYoutubePollingCycle().catch((err) => {
      if (isFirestoreConfigOrPermissionError(err)) {
        cronPausedDueToPermissions = true;
        log('warn', 'cron_youtube_poll_paused_firestore_unavailable', {
          error: err instanceof Error ? err.message : String(err),
          hint: 'Ensure FIREBASE_SERVICE_ACCOUNT_JSON matches the active Firebase project and database ID.',
        });
        return;
      }
      log('error', 'cron_youtube_poll_crash', { error: String(err) });
    });
  });

  // Daily Meta long-lived token 50-day refresh & expiry warning check at 03:00 UTC
  cron.schedule('0 3 * * *', () => {
    if (cronPausedDueToPermissions) return;
    void runMetaTokenMaintenance().catch((err) => {
      if (isFirestoreConfigOrPermissionError(err)) {
        cronPausedDueToPermissions = true;
        log('warn', 'cron_meta_maintenance_paused_firestore_unavailable', {
          error: err instanceof Error ? err.message : String(err),
          hint: 'Ensure FIREBASE_SERVICE_ACCOUNT_JSON matches the active Firebase project and database ID.',
        });
        return;
      }
      log('error', 'cron_meta_token_maintenance_crash', { error: String(err) });
    });
  });

  log('info', 'scheduled_cron_jobs_started', {
    youtubePollInterval: '4m',
    tokenRefreshCheck: 'daily 03:00 UTC',
  });
}
