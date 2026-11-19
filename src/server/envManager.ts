import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { readFirebaseClientConfig, saveRuntimeFirebaseConfig, type FirebaseClientConfig } from './firebaseAdmin.ts';

export type EnvProfileId = 'development' | 'production' | 'local';

export interface EnvVarItem {
  key: string;
  value: string;
  isSecret: boolean;
  configured: boolean;
  description: string;
}

export interface EnvProfileSummary {
  id: EnvProfileId;
  label: string;
  fileName: string;
  active: boolean;
  appUrl: string;
  webhookUrl: string;
  metaRedirectUri: string;
  youtubeRedirectUri: string;
  vars: EnvVarItem[];
}

const DEFAULT_PUBLIC_APP_URL = 'https://replyflow-c672.onrender.com';

const DEV_APP_URL =
  process.env.APP_URL && !process.env.APP_URL.includes('MY_APP_URL')
    ? process.env.APP_URL.replace(/\/+$/, '')
    : DEFAULT_PUBLIC_APP_URL;

const PROD_APP_URL = DEFAULT_PUBLIC_APP_URL;

const LOCAL_APP_URL = 'http://localhost:3000';

const SECRET_KEYS = new Set([
  'ENCRYPTION_KEY',
  'FIREBASE_SERVICE_ACCOUNT_JSON',
  'META_APP_SECRET',
  'META_WEBHOOK_VERIFY_TOKEN',
  'YOUTUBE_CLIENT_SECRET',
  'YOUTUBE_API_KEY',
]);

const ENV_VAR_DESCRIPTIONS: Record<string, string> = {
  NODE_ENV: 'Runtime mode (development or production)',
  PORT: 'HTTP server port (default 3000)',
  APP_URL: 'Public base URL used for OAuth callbacks and webhooks',
  ENCRYPTION_KEY: '64-char AES-256 key used to encrypt stored OAuth tokens',
  META_WEBHOOK_VERIFY_TOKEN: 'Verify token entered in Meta Developer Webhook setup',
  VITE_FIREBASE_PROJECT_ID: 'Firebase Project ID (from Firebase Console)',
  VITE_FIREBASE_AUTH_DOMAIN: 'Firebase Auth Domain (<project-id>.firebaseapp.com)',
  VITE_FIREBASE_STORAGE_BUCKET: 'Firebase Storage Bucket',
  VITE_FIREBASE_DATABASE_ID: 'Firestore Database ID (usually (default))',
  VITE_FIREBASE_API_KEY: 'Firebase Web App API Key',
  VITE_FIREBASE_MESSAGING_SENDER_ID: 'Firebase Messaging Sender ID',
  VITE_FIREBASE_APP_ID: 'Firebase Web App ID',
  FIREBASE_SERVICE_ACCOUNT_JSON: 'Firebase Admin Service Account JSON (single-line)',
  META_APP_ID: 'Meta (Instagram / Facebook) App ID',
  META_APP_SECRET: 'Meta App Secret for HMAC webhook verification & OAuth',
  YOUTUBE_CLIENT_ID: 'Google OAuth Client ID for YouTube Data API v3',
  YOUTUBE_CLIENT_SECRET: 'Google OAuth Client Secret for YouTube',
  YOUTUBE_API_KEY: 'Optional YouTube Data API Key fallback',
};

const ORDERED_KEYS = Object.keys(ENV_VAR_DESCRIPTIONS);

function getProfileFilePath(id: EnvProfileId): string {
  const map: Record<EnvProfileId, string> = {
    development: '.env.development',
    production: '.env.production',
    local: '.env.local',
  };
  return path.resolve(process.cwd(), map[id]);
}

function getActiveEnvPath(): string {
  return path.resolve(process.cwd(), '.env');
}

function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

function generateVerifyToken(): string {
  return `replyflow_wh_${crypto.randomBytes(12).toString('hex')}`;
}

function defaultEnvMap(id: EnvProfileId): Record<string, string> {
  const existingClient = readFirebaseClientConfig();
  const projectId = existingClient?.projectId || 'autodm-f6ee3';

  return {
    NODE_ENV: id === 'production' ? 'production' : 'development',
    PORT: '3000',
    APP_URL: id === 'production' ? PROD_APP_URL : id === 'local' ? LOCAL_APP_URL : DEV_APP_URL,
    ENCRYPTION_KEY: generateEncryptionKey(),
    META_WEBHOOK_VERIFY_TOKEN: generateVerifyToken(),
    VITE_FIREBASE_PROJECT_ID: projectId,
    VITE_FIREBASE_AUTH_DOMAIN: existingClient?.authDomain || `${projectId}.firebaseapp.com`,
    VITE_FIREBASE_STORAGE_BUCKET:
      existingClient?.storageBucket || `${projectId}.firebasestorage.app`,
    VITE_FIREBASE_DATABASE_ID: existingClient?.firestoreDatabaseId || '(default)',
    VITE_FIREBASE_API_KEY: existingClient?.apiKey || '',
    VITE_FIREBASE_MESSAGING_SENDER_ID: existingClient?.messagingSenderId || '',
    VITE_FIREBASE_APP_ID: existingClient?.appId || '',
    FIREBASE_SERVICE_ACCOUNT_JSON: '',
    META_APP_ID: '',
    META_APP_SECRET: '',
    YOUTUBE_CLIENT_ID: '',
    YOUTUBE_CLIENT_SECRET: '',
    YOUTUBE_API_KEY: '',
  };
}

function serializeEnvMap(id: EnvProfileId, map: Record<string, string>): string {
  const header = `# ReplyFlow Environment Profile: ${id.toUpperCase()}\n# Generated automatically — safe to customize in Settings -> Environments\n`;
  const lines: string[] = [header];
  const allKeys = [...ORDERED_KEYS, ...Object.keys(map).filter((k) => !ORDERED_KEYS.includes(k))];

  for (const key of allKeys) {
    const val = map[key] ?? '';
    const escaped = val.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
    lines.push(`${key}="${escaped}"`);
  }
  return `${lines.join('\n')}\n`;
}

function readEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return dotenv.parse(raw);
  } catch {
    return {};
  }
}

export function bootstrapEnvironmentFiles(): void {
  const ids: EnvProfileId[] = ['development', 'production', 'local'];
  for (const id of ids) {
    const filePath = getProfileFilePath(id);
    if (!fs.existsSync(filePath)) {
      const map = defaultEnvMap(id);
      fs.writeFileSync(filePath, serializeEnvMap(id, map), { mode: 0o600 });
    }
  }

  const activePath = getActiveEnvPath();
  if (!fs.existsSync(activePath)) {
    const initialProfile: EnvProfileId =
      process.env.NODE_ENV === 'production' ? 'production' : 'development';
    const initialMap = readEnvFile(getProfileFilePath(initialProfile));
    fs.writeFileSync(activePath, serializeEnvMap(initialProfile, initialMap), { mode: 0o600 });
  }

  // Load .env into process.env without clobbering already-injected runtime values
  const activeVars = readEnvFile(activePath);
  for (const [k, v] of Object.entries(activeVars)) {
    if (v && (!process.env[k] || process.env[k] === 'MY_APP_URL' || process.env[k] === 'MY_GEMINI_API_KEY')) {
      process.env[k] = v;
    }
  }
}

function maskValue(key: string, value: string): string {
  if (!value) return '';
  if (!SECRET_KEYS.has(key)) return value;
  if (value.length <= 8) return '••••••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export function listEnvironmentProfiles(): {
  activeProfile: EnvProfileId;
  profiles: EnvProfileSummary[];
} {
  bootstrapEnvironmentFiles();
  const activeVars = readEnvFile(getActiveEnvPath());
  const activeAppUrl = (activeVars.APP_URL || process.env.APP_URL || DEV_APP_URL).replace(/\/+$/, '');
  const activeProfile: EnvProfileId =
    activeVars.NODE_ENV === 'production' || activeAppUrl === PROD_APP_URL
      ? 'production'
      : activeAppUrl.includes('localhost')
      ? 'local'
      : 'development';

  const labels: Record<EnvProfileId, { label: string; fileName: string }> = {
    development: { label: 'Development (AI Studio Dev)', fileName: '.env.development' },
    production: { label: 'Production (Live / Render / Cloud Run)', fileName: '.env.production' },
    local: { label: 'Localhost (http://localhost:3000)', fileName: '.env.local' },
  };

  const profiles: EnvProfileSummary[] = (['development', 'production', 'local'] as EnvProfileId[]).map((id) => {
    const fileMap = { ...defaultEnvMap(id), ...readEnvFile(getProfileFilePath(id)) };
    const baseUrl = (fileMap.APP_URL || DEV_APP_URL).replace(/\/+$/, '');

    const vars: EnvVarItem[] = ORDERED_KEYS.map((key) => {
      const rawVal = fileMap[key] ?? '';
      return {
        key,
        value: maskValue(key, rawVal),
        isSecret: SECRET_KEYS.has(key),
        configured: Boolean(rawVal && rawVal.trim().length > 0),
        description: ENV_VAR_DESCRIPTIONS[key] || '',
      };
    });

    return {
      id,
      label: labels[id].label,
      fileName: labels[id].fileName,
      active: id === activeProfile,
      appUrl: baseUrl,
      webhookUrl: `${baseUrl}/webhooks/meta`,
      metaRedirectUri: `${baseUrl}/auth/meta/callback`,
      youtubeRedirectUri: `${baseUrl}/auth/youtube/callback`,
      vars,
    };
  });

  return { activeProfile, profiles };
}

export function getRawEnvFileContent(id: EnvProfileId): string {
  bootstrapEnvironmentFiles();
  const filePath = getProfileFilePath(id);
  const merged = { ...defaultEnvMap(id), ...readEnvFile(filePath) };
  return serializeEnvMap(id, merged);
}

export async function updateEnvironmentProfile(params: {
  id: EnvProfileId;
  updates?: Record<string, string>;
  rawDotEnv?: string;
  activate?: boolean;
  regenerateSecrets?: boolean;
}): Promise<{ activeProfile: EnvProfileId; profiles: EnvProfileSummary[]; appliedKeys: string[] }> {
  bootstrapEnvironmentFiles();
  const filePath = getProfileFilePath(params.id);
  const current = { ...defaultEnvMap(params.id), ...readEnvFile(filePath) };
  const appliedKeys: string[] = [];

  if (params.rawDotEnv && params.rawDotEnv.trim()) {
    const parsed = dotenv.parse(params.rawDotEnv);
    for (const [k, v] of Object.entries(parsed)) {
      if (ORDERED_KEYS.includes(k) || k.startsWith('VITE_') || k.startsWith('FIREBASE_') || k.startsWith('META_') || k.startsWith('YOUTUBE_')) {
        current[k] = v;
        appliedKeys.push(k);
      }
    }
  }

  if (params.updates) {
    for (const [k, v] of Object.entries(params.updates)) {
      if (typeof v === 'string') {
        // Ignore masked placeholder strings sent back unchanged from UI
        if (v.includes('••••')) continue;
        current[k] = v.trim();
        appliedKeys.push(k);
      }
    }
  }

  if (params.regenerateSecrets) {
    current.ENCRYPTION_KEY = generateEncryptionKey();
    current.META_WEBHOOK_VERIFY_TOKEN = generateVerifyToken();
    appliedKeys.push('ENCRYPTION_KEY', 'META_WEBHOOK_VERIFY_TOKEN');
  }

  fs.writeFileSync(filePath, serializeEnvMap(params.id, current), { mode: 0o600 });

  if (params.activate !== false) {
    fs.writeFileSync(getActiveEnvPath(), serializeEnvMap(params.id, current), { mode: 0o600 });
    for (const [k, v] of Object.entries(current)) {
      if (v) {
        process.env[k] = v;
      }
    }

    // If Firebase web config or service account was provided, sync runtime bootstrap too
    let webConfig: FirebaseClientConfig | undefined;
    if (current.VITE_FIREBASE_API_KEY && current.VITE_FIREBASE_PROJECT_ID) {
      webConfig = {
        apiKey: current.VITE_FIREBASE_API_KEY,
        authDomain:
          current.VITE_FIREBASE_AUTH_DOMAIN || `${current.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
        projectId: current.VITE_FIREBASE_PROJECT_ID,
        storageBucket: current.VITE_FIREBASE_STORAGE_BUCKET || undefined,
        messagingSenderId: current.VITE_FIREBASE_MESSAGING_SENDER_ID || undefined,
        appId: current.VITE_FIREBASE_APP_ID || '',
        firestoreDatabaseId: current.VITE_FIREBASE_DATABASE_ID || '(default)',
      };
    }
    const saJson =
      current.FIREBASE_SERVICE_ACCOUNT_JSON && current.FIREBASE_SERVICE_ACCOUNT_JSON.trim().startsWith('{')
        ? current.FIREBASE_SERVICE_ACCOUNT_JSON.trim()
        : undefined;

    if (webConfig || saJson) {
      await saveRuntimeFirebaseConfig({ webConfig, serviceAccountJson: saJson });
    }
  }

  return {
    ...listEnvironmentProfiles(),
    appliedKeys: Array.from(new Set(appliedKeys)),
  };
}
