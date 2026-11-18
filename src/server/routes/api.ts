import { Router, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../authMiddleware.ts';
import { runYoutubePollingCycle } from '../cronJobs.ts';
import { decryptSecret, encryptSecret } from '../crypto.ts';
import { getAdminServices, readFirebaseClientConfig } from '../firebaseAdmin.ts';
import { readLocalStore, writeLocalStore } from '../localStore.ts';
import {
  exchangeForLongLivedMetaToken,
  fetchFacebookPagePosts,
  fetchInstagramMedia,
  fetchMetaManagedAccounts,
  subscribePageWebhook,
} from '../metaApi.ts';
import { getAccountAccessToken, processIncomingComment } from '../processor.ts';
import { fetchMyYoutubeVideos, refreshGoogleOAuthToken } from '../youtubeApi.ts';
import type { SocialAccount } from '../../types/index.ts';

export const apiRouter = Router();

// Public config for frontend initialization & Webhook URL display
apiRouter.get('/public-config', (req, res) => {
  const firebaseConfig = readFirebaseClientConfig();
  const { configured: adminFirestoreConfigured, projectMismatch } = getAdminServices();
  const appUrl =
    process.env.APP_URL && !process.env.APP_URL.includes('MY_APP_URL')
      ? process.env.APP_URL.replace(/\/+$/, '')
      : `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.headers.host}`;

  res.json({
    firebaseConfig,
    appUrl,
    adminFirestoreConfigured,
    projectMismatch,
  });
});

// Connect Meta Instagram/Facebook manually via Long-Lived Token (Developer Mode friendly)
const manualMetaSchema = z.object({
  accessToken: z.string().min(20).max(2048),
});

apiRouter.post('/accounts/manual-meta', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const parsed = manualMetaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid access token format' });
    return;
  }

  const { db } = getAdminServices();
  if (!db) {
    res.status(503).json({ error: 'Database unavailable' });
    return;
  }

  const userId = req.uid!;
  try {
    const { pages } = await fetchMetaManagedAccounts(parsed.data.accessToken);
    if (pages.length === 0) {
      res.status(400).json({
        error: 'No Facebook Pages found for this token. Ensure pages_show_list and instagram_basic permissions are granted.',
      });
      return;
    }

    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    const connected: string[] = [];

    for (const p of pages) {
      const fbId = `${userId}_fb_${p.pageId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      await db.collection('accounts').doc(fbId).set({
        userId,
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
      });
      await db.collection('accountSecrets').doc(fbId).set({
        userId,
        platform: 'facebook',
        accessTokenEnc: encryptSecret(p.pageAccessToken),
        updatedAt: nowIso,
      });
      connected.push(`Facebook: ${p.pageName}`);

      try {
        await subscribePageWebhook({ pageId: p.pageId, pageAccessToken: p.pageAccessToken });
      } catch {
        // Non-fatal in manual connect
      }

      if (p.igBusinessAccount) {
        const ig = p.igBusinessAccount;
        const igId = `${userId}_ig_${ig.igId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
        await db.collection('accounts').doc(igId).set({
          userId,
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
        });
        await db.collection('accountSecrets').doc(igId).set({
          userId,
          platform: 'instagram',
          accessTokenEnc: encryptSecret(p.pageAccessToken),
          updatedAt: nowIso,
        });
        connected.push(`Instagram: @${ig.username}`);
      }
    }

    res.json({ connected });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Refresh Account Token manually
apiRouter.post('/accounts/:accountId/refresh', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { db } = getAdminServices();
  if (!db) {
    res.status(503).json({ error: 'Database unavailable' });
    return;
  }

  const accountId = String(req.params.accountId || '');
  const accSnap = await db.collection('accounts').doc(accountId).get();
  if (!accSnap.exists) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  const account = { id: accSnap.id, ...(accSnap.data() as Omit<SocialAccount, 'id'>) };
  if (account.userId !== req.uid) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  try {
    const token = await getAccountAccessToken(accountId);
    const settingsSnap = await db.collection('settings').doc(req.uid!).get();
    const secretsSnap = await db.collection('settingsSecrets').doc(req.uid!).get();

    if (account.platform === 'youtube') {
      const refreshEnc = (await db.collection('accountSecrets').doc(accountId).get()).data()?.refreshTokenEnc as string | undefined;
      const clientId = (settingsSnap.data()?.youtubeClientId as string) || process.env.YOUTUBE_CLIENT_ID || '';
      const clientSecret =
        (secretsSnap.data()?.youtubeClientSecretEnc
          ? decryptSecret(String(secretsSnap.data()!.youtubeClientSecretEnc))
          : '') ||
        process.env.YOUTUBE_CLIENT_SECRET ||
        '';
      if (!refreshEnc || !clientId || !clientSecret) {
        res.status(400).json({ error: 'Missing YouTube refresh token or OAuth credentials' });
        return;
      }
      const refreshed = await refreshGoogleOAuthToken({
        refreshToken: decryptSecret(refreshEnc),
        clientId,
        clientSecret,
      });
      const newExpiry = new Date(Date.now() + refreshed.expiresInSeconds * 1000).toISOString();
      await db.collection('accountSecrets').doc(accountId).set(
        { accessTokenEnc: encryptSecret(refreshed.accessToken), updatedAt: new Date().toISOString() },
        { merge: true }
      );
      await db.collection('accounts').doc(accountId).update({
        status: 'connected',
        lastError: '',
        tokenExpiresAt: newExpiry,
        lastRefreshedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      res.json({ tokenExpiresAt: newExpiry });
      return;
    }

    const appId = (settingsSnap.data()?.metaAppId as string) || process.env.META_APP_ID || '';
    const appSecret =
      (secretsSnap.data()?.metaAppSecretEnc
        ? decryptSecret(String(secretsSnap.data()!.metaAppSecretEnc))
        : '') ||
      process.env.META_APP_SECRET ||
      '';
    if (!token || !appId || !appSecret) {
      res.status(400).json({ error: 'Meta App ID and App Secret must be configured in Settings to refresh tokens.' });
      return;
    }

    const exchanged = await exchangeForLongLivedMetaToken({
      shortLivedToken: token,
      appId,
      appSecret,
    });
    const newExpiry = new Date(Date.now() + exchanged.expiresInSeconds * 1000).toISOString();
    await db.collection('accountSecrets').doc(accountId).set(
      { accessTokenEnc: encryptSecret(exchanged.accessToken), updatedAt: new Date().toISOString() },
      { merge: true }
    );
    await db.collection('accounts').doc(accountId).update({
      status: 'connected',
      lastError: '',
      tokenExpiresAt: newExpiry,
      lastRefreshedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    res.json({ tokenExpiresAt: newExpiry });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Fetch recent media/posts/videos for a connected account
apiRouter.get('/accounts/:accountId/media', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { db } = getAdminServices();
  if (!db) {
    res.status(503).json({ error: 'Database unavailable' });
    return;
  }

  const accountId = String(req.params.accountId || '');
  const accSnap = await db.collection('accounts').doc(accountId).get();
  if (!accSnap.exists) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  const account = { id: accSnap.id, ...(accSnap.data() as Omit<SocialAccount, 'id'>) };
  if (account.userId !== req.uid) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const accessToken = await getAccountAccessToken(accountId);
  if (!accessToken) {
    res.status(400).json({ error: 'Missing account access token' });
    return;
  }

  try {
    if (account.platform === 'instagram') {
      const items = await fetchInstagramMedia({ igUserId: account.platformAccountId, accessToken });
      res.json({ items });
    } else if (account.platform === 'facebook') {
      const items = await fetchFacebookPagePosts({ pageId: account.platformAccountId, accessToken });
      res.json({ items });
    } else {
      const result = await fetchMyYoutubeVideos({ accessToken, channelId: account.platformAccountId });
      res.json({ items: result.videos });
    }
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Retry a failed log item
apiRouter.post('/logs/:logId/retry', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { db } = getAdminServices();
  if (!db) {
    res.status(503).json({ error: 'Database unavailable' });
    return;
  }

  const logId = String(req.params.logId || '');
  const logSnap = await db.collection('logs').doc(logId).get();
  if (!logSnap.exists) {
    res.status(404).json({ error: 'Log not found' });
    return;
  }
  const logData = logSnap.data()!;
  if (logData.userId !== req.uid) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const accSnap = await db.collection('accounts').doc(String(logData.accountId)).get();
  if (!accSnap.exists) {
    res.status(404).json({ error: 'Connected account no longer exists' });
    return;
  }
  const account = { id: accSnap.id, ...(accSnap.data() as Omit<SocialAccount, 'id'>) };

  // Remove old dedupe lock so retry can re-execute cleanly
  const safeId = `${logData.platform}_${logData.commentId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  await db.collection('events').doc(safeId).delete().catch(() => {});

  await processIncomingComment({
    account,
    platform: logData.platform,
    targetType: logData.targetMediaId ? 'specific_post' : 'all_posts',
    mediaId: logData.targetMediaId || undefined,
    commentId: String(logData.commentId),
    commenterId: String(logData.commenterId),
    commenterUsername: String(logData.commenterUsername),
    commentText: String(logData.commentText),
  });

  res.json({ queued: true });
});

// Settings (server-side encrypted secret management)
const settingsSchema = z.object({
  metaAppId: z.string().max(128).optional().default(''),
  metaAppSecret: z.string().max(256).optional(),
  metaVerifyToken: z.string().max(128).optional().default(''),
  youtubeClientId: z.string().max(256).optional().default(''),
  youtubeClientSecret: z.string().max(256).optional(),
  youtubeApiKey: z.string().max(256).optional(),
  minDelaySeconds: z.number().min(1).max(60),
  maxDelaySeconds: z.number().min(1).max(120),
  hourlyDmLimit: z.number().min(1).max(500),
  timezone: z.string().min(1).max(64),
  language: z.enum(['en', 'hi']),
  notificationEmail: z.string().max(256).optional().default(''),
});

apiRouter.get('/settings', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { db, projectMismatch } = getAdminServices();
  const local = readLocalStore();
  const fallbackDefaults = {
    ...local.settings,
    userId: req.uid,
    hasMetaAppSecret: Boolean(local.settings.hasMetaAppSecret || process.env.META_APP_SECRET),
    metaVerifyToken: local.settings.metaVerifyToken || process.env.META_WEBHOOK_VERIFY_TOKEN || '',
    hasYoutubeClientSecret: Boolean(
      local.settings.hasYoutubeClientSecret || process.env.YOUTUBE_CLIENT_SECRET
    ),
    hasYoutubeApiKey: Boolean(local.settings.hasYoutubeApiKey || process.env.YOUTUBE_API_KEY),
    notificationEmail: local.settings.notificationEmail || req.userEmail || '',
    serverAdminMissing: !db,
    projectMismatch,
  };

  if (!db) {
    res.json(fallbackDefaults);
    return;
  }

  try {
    const snap = await db.collection('settings').doc(req.uid!).get();
    if (!snap.exists) {
      res.json({ ...fallbackDefaults, serverAdminMissing: false });
      return;
    }
    res.json({ ...snap.data(), serverAdminMissing: false, projectMismatch });
  } catch (err) {
    res.json({
      ...fallbackDefaults,
      serverAdminMissing: true,
      projectMismatch,
      serverError: err instanceof Error ? err.message : String(err),
    });
  }
});

apiRouter.put('/settings', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid settings payload', details: parsed.error.flatten() });
    return;
  }

  const { db, projectMismatch } = getAdminServices();
  const userId = req.uid!;
  const d = parsed.data;
  const nowIso = new Date().toISOString();

  if (!db) {
    const current = readLocalStore();
    const publicSettings = {
      userId,
      metaAppId: d.metaAppId,
      hasMetaAppSecret: Boolean(
        (d.metaAppSecret && d.metaAppSecret.trim()) || current.settingsSecrets.metaAppSecretEnc
      ),
      metaVerifyToken: d.metaVerifyToken,
      youtubeClientId: d.youtubeClientId,
      hasYoutubeClientSecret: Boolean(
        (d.youtubeClientSecret && d.youtubeClientSecret.trim()) ||
          current.settingsSecrets.youtubeClientSecretEnc
      ),
      hasYoutubeApiKey: Boolean(
        (d.youtubeApiKey && d.youtubeApiKey.trim()) || current.settingsSecrets.youtubeApiKeyEnc
      ),
      minDelaySeconds: Math.min(d.minDelaySeconds, d.maxDelaySeconds),
      maxDelaySeconds: Math.max(d.minDelaySeconds, d.maxDelaySeconds),
      hourlyDmLimit: d.hourlyDmLimit,
      timezone: d.timezone,
      language: d.language,
      notificationEmail: d.notificationEmail,
      updatedAt: nowIso,
    };

    writeLocalStore((store) => {
      store.settings = publicSettings;
      if (d.metaAppSecret && d.metaAppSecret.trim()) {
        store.settingsSecrets.metaAppSecretEnc = encryptSecret(d.metaAppSecret.trim());
      }
      if (d.youtubeClientSecret && d.youtubeClientSecret.trim()) {
        store.settingsSecrets.youtubeClientSecretEnc = encryptSecret(d.youtubeClientSecret.trim());
      }
      if (d.youtubeApiKey && d.youtubeApiKey.trim()) {
        store.settingsSecrets.youtubeApiKeyEnc = encryptSecret(d.youtubeApiKey.trim());
      }
      store.settingsSecrets.updatedAt = nowIso;
    });

    res.json({ ...publicSettings, serverAdminMissing: true, projectMismatch });
    return;
  }

  const existingSecretsSnap = await db.collection('settingsSecrets').doc(userId).get();
  const existingSecrets = existingSecretsSnap.exists ? existingSecretsSnap.data()! : {};

  const nextSecrets: Record<string, unknown> = {
    userId,
    updatedAt: nowIso,
  };
  if (d.metaAppSecret && d.metaAppSecret.trim()) {
    nextSecrets.metaAppSecretEnc = encryptSecret(d.metaAppSecret.trim());
  }
  if (d.youtubeClientSecret && d.youtubeClientSecret.trim()) {
    nextSecrets.youtubeClientSecretEnc = encryptSecret(d.youtubeClientSecret.trim());
  }
  if (d.youtubeApiKey && d.youtubeApiKey.trim()) {
    nextSecrets.youtubeApiKeyEnc = encryptSecret(d.youtubeApiKey.trim());
  }

  await db.collection('settingsSecrets').doc(userId).set(nextSecrets, { merge: true });

  const publicSettings = {
    userId,
    metaAppId: d.metaAppId,
    hasMetaAppSecret: Boolean(
      (d.metaAppSecret && d.metaAppSecret.trim()) || existingSecrets.metaAppSecretEnc
    ),
    metaVerifyToken: d.metaVerifyToken,
    youtubeClientId: d.youtubeClientId,
    hasYoutubeClientSecret: Boolean(
      (d.youtubeClientSecret && d.youtubeClientSecret.trim()) || existingSecrets.youtubeClientSecretEnc
    ),
    hasYoutubeApiKey: Boolean(
      (d.youtubeApiKey && d.youtubeApiKey.trim()) || existingSecrets.youtubeApiKeyEnc
    ),
    minDelaySeconds: Math.min(d.minDelaySeconds, d.maxDelaySeconds),
    maxDelaySeconds: Math.max(d.minDelaySeconds, d.maxDelaySeconds),
    hourlyDmLimit: d.hourlyDmLimit,
    timezone: d.timezone,
    language: d.language,
    notificationEmail: d.notificationEmail,
    updatedAt: nowIso,
  };

  await db.collection('settings').doc(userId).set(publicSettings, { merge: true });
  res.json({ ...publicSettings, serverAdminMissing: false, projectMismatch });
});

// Trigger YouTube poll immediately
apiRouter.post('/youtube/poll-now', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    await runYoutubePollingCycle();
    res.json({ polled: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
