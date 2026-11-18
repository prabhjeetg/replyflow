import fs from 'node:fs';
import path from 'node:path';
import type {
  AppNotification,
  AutomationLog,
  AutomationRule,
  Contact,
  DailyStat,
  Lead,
  SocialAccount,
  UserProfile,
  UserSettings,
} from '../types/index.ts';

export interface LocalStoreData {
  profile: UserProfile;
  accounts: SocialAccount[];
  accountSecrets: Record<string, { accessTokenEnc: string; refreshTokenEnc?: string; updatedAt: string }>;
  rules: AutomationRule[];
  logs: AutomationLog[];
  contacts: Contact[];
  leads: Lead[];
  stats: DailyStat[];
  notifications: AppNotification[];
  events: Record<string, string>;
  settings: UserSettings;
  settingsSecrets: {
    metaAppSecretEnc?: string;
    youtubeClientSecretEnc?: string;
    youtubeApiKeyEnc?: string;
    updatedAt?: string;
  };
}

const STORE_PATH = path.resolve(process.cwd(), '.replyflow-store.json');

function defaultStore(): LocalStoreData {
  const now = new Date().toISOString();
  return {
    profile: {
      uid: 'local_creator',
      email: 'creator@local.app',
      displayName: 'Creator Workspace',
      language: 'en',
      theme: 'light',
      pauseAllAutomations: false,
      createdAt: now,
      updatedAt: now,
    },
    accounts: [],
    accountSecrets: {},
    rules: [],
    logs: [],
    contacts: [],
    leads: [],
    stats: [],
    notifications: [],
    events: {},
    settings: {
      userId: 'local_creator',
      metaAppId: process.env.META_APP_ID || '',
      hasMetaAppSecret: Boolean(process.env.META_APP_SECRET),
      metaVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || 'replyflow_verify_token',
      youtubeClientId: process.env.YOUTUBE_CLIENT_ID || '',
      hasYoutubeClientSecret: Boolean(process.env.YOUTUBE_CLIENT_SECRET),
      hasYoutubeApiKey: Boolean(process.env.YOUTUBE_API_KEY),
      minDelaySeconds: 3,
      maxDelaySeconds: 15,
      hourlyDmLimit: 200,
      timezone: 'Asia/Kolkata',
      language: 'en',
      notificationEmail: '',
      updatedAt: now,
    },
    settingsSecrets: {},
  };
}

export function readLocalStore(): LocalStoreData {
  if (!fs.existsSync(STORE_PATH)) {
    const initial = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), { mode: 0o600 });
    return initial;
  }
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    return { ...defaultStore(), ...JSON.parse(raw) } as LocalStoreData;
  } catch {
    return defaultStore();
  }
}

export function writeLocalStore(updater: (data: LocalStoreData) => void): LocalStoreData {
  const data = readLocalStore();
  updater(data);
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });
  return data;
}
