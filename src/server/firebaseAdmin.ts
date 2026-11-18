import fs from 'node:fs';
import path from 'node:path';
import {
  applicationDefault,
  cert,
  deleteApp,
  getApps,
  initializeApp,
} from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { log } from './logger.ts';

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  firestoreDatabaseId?: string;
}

export interface FirebaseProjectMismatch {
  serviceAccountProjectId: string;
  clientProjectId: string;
}

let cachedDb: Firestore | null = null;
let cachedAuth: Auth | null = null;
let cachedProjectMismatch: FirebaseProjectMismatch | null = null;
let initAttempted = false;

const RUNTIME_WEB_CONFIG_PATH = path.resolve(process.cwd(), '.runtime-firebase-web.json');
const RUNTIME_SA_PATH = path.resolve(process.cwd(), '.runtime-firebase-sa.json');

export function readFirebaseClientConfig(): FirebaseClientConfig | null {
  const appletConfigPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(appletConfigPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(appletConfigPath, 'utf8'));
      if (raw?.apiKey && raw?.projectId && raw.projectId !== 'remixed-project-id') {
        return raw as FirebaseClientConfig;
      }
    } catch (err) {
      log('warn', 'firebase_applet_config_parse_error', { error: String(err) });
    }
  }

  if (fs.existsSync(RUNTIME_WEB_CONFIG_PATH)) {
    try {
      const raw = JSON.parse(fs.readFileSync(RUNTIME_WEB_CONFIG_PATH, 'utf8'));
      if (raw?.apiKey && raw?.projectId) {
        return raw as FirebaseClientConfig;
      }
    } catch {
      // ignore malformed runtime web config
    }
  }

  if (process.env.VITE_FIREBASE_API_KEY && process.env.VITE_FIREBASE_PROJECT_ID) {
    return {
      apiKey: process.env.VITE_FIREBASE_API_KEY,
      authDomain:
        process.env.VITE_FIREBASE_AUTH_DOMAIN ||
        `${process.env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
      projectId: process.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.VITE_FIREBASE_APP_ID || '',
      firestoreDatabaseId: process.env.VITE_FIREBASE_DATABASE_ID || '(default)',
    };
  }

  return null;
}

function parseServiceAccountJson(raw: string | undefined): Record<string, string> | null {
  if (!raw) return null;
  let trimmed = raw.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    try {
      const unwrapped = JSON.parse(trimmed);
      if (typeof unwrapped === 'string') trimmed = unwrapped.trim();
    } catch {
      trimmed = trimmed.slice(1, -1).trim();
    }
  }
  if (!trimmed.startsWith('{')) {
    try {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim();
      if (decoded.startsWith('{')) trimmed = decoded;
    } catch {
      return null;
    }
  }
  try {
    const parsed = JSON.parse(trimmed) as Record<string, string>;
    if (parsed && parsed.project_id && parsed.private_key && parsed.client_email) {
      return parsed;
    }
  } catch (err) {
    log('warn', 'firebase_service_account_parse_error', { error: String(err) });
  }
  return null;
}

export async function saveRuntimeFirebaseConfig(params: {
  webConfig?: FirebaseClientConfig;
  serviceAccountJson?: string;
}): Promise<void> {
  if (params.webConfig && params.webConfig.apiKey && params.webConfig.projectId) {
    // Keep AI Studio's firebase-applet-config.json intact if it already exists; write runtime override otherwise.
    fs.writeFileSync(RUNTIME_WEB_CONFIG_PATH, JSON.stringify(params.webConfig, null, 2), {
      mode: 0o600,
    });
    process.env.VITE_FIREBASE_API_KEY = params.webConfig.apiKey;
    process.env.VITE_FIREBASE_AUTH_DOMAIN = params.webConfig.authDomain;
    process.env.VITE_FIREBASE_PROJECT_ID = params.webConfig.projectId;
    if (params.webConfig.storageBucket) {
      process.env.VITE_FIREBASE_STORAGE_BUCKET = params.webConfig.storageBucket;
    }
    if (params.webConfig.messagingSenderId) {
      process.env.VITE_FIREBASE_MESSAGING_SENDER_ID = params.webConfig.messagingSenderId;
    }
    process.env.VITE_FIREBASE_APP_ID = params.webConfig.appId || '';
    process.env.VITE_FIREBASE_DATABASE_ID = params.webConfig.firestoreDatabaseId || '(default)';
  }

  if (params.serviceAccountJson && params.serviceAccountJson.trim()) {
    const parsed = parseServiceAccountJson(params.serviceAccountJson);
    if (parsed) {
      fs.writeFileSync(RUNTIME_SA_PATH, JSON.stringify(parsed), { mode: 0o600 });
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify(parsed);
    }
  }

  // Reset cached Admin SDK instances so they reinitialize on next request
  cachedDb = null;
  cachedAuth = null;
  cachedProjectMismatch = null;
  initAttempted = false;
  for (const app of getApps()) {
    await deleteApp(app).catch(() => {});
  }
}

export function getAdminServices(): {
  db: Firestore | null;
  auth: Auth | null;
  configured: boolean;
  authVerifyReady: boolean;
  projectMismatch: FirebaseProjectMismatch | null;
} {
  if (initAttempted) {
    return {
      db: cachedDb,
      auth: cachedAuth,
      configured: Boolean(cachedDb),
      authVerifyReady: Boolean(cachedAuth),
      projectMismatch: cachedProjectMismatch,
    };
  }
  initAttempted = true;

  try {
    const clientConfig = readFirebaseClientConfig();
    const databaseId =
      process.env.FIREBASE_DATABASE_ID ||
      clientConfig?.firestoreDatabaseId ||
      '(default)';

    const runtimeSa = fs.existsSync(RUNTIME_SA_PATH)
      ? parseServiceAccountJson(fs.readFileSync(RUNTIME_SA_PATH, 'utf8'))
      : null;
    const envSa = parseServiceAccountJson(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    const candidates = [runtimeSa, envSa].filter(
      (item): item is Record<string, string> => Boolean(item)
    );

    let serviceAccount: Record<string, string> | null = null;
    if (clientConfig?.projectId) {
      serviceAccount =
        candidates.find((sa) => sa.project_id === clientConfig.projectId) || null;
      if (!serviceAccount && candidates.length > 0) {
        const mismatched = candidates[0];
        cachedProjectMismatch = {
          serviceAccountProjectId: mismatched.project_id,
          clientProjectId: clientConfig.projectId,
        };
        log('warn', 'firebase_service_account_project_mismatch_ignored', {
          serviceAccountProjectId: mismatched.project_id,
          clientProjectId: clientConfig.projectId,
          hint: 'Ignoring mismatched FIREBASE_SERVICE_ACCOUNT_JSON so Firebase Auth verifies tokens for the active client project.',
        });
      }
    } else {
      serviceAccount = candidates[0] || null;
    }

    const hasGoogleCredsFile = Boolean(
      process.env.GOOGLE_APPLICATION_CREDENTIALS &&
        fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    );
    const allowAdc = hasGoogleCredsFile || process.env.USE_ADC_FIREBASE === 'true';
    const projectId =
      clientConfig?.projectId || serviceAccount?.project_id || process.env.FIREBASE_PROJECT_ID;

    if (getApps().length === 0) {
      if (serviceAccount) {
        initializeApp({
          credential: cert(serviceAccount),
          projectId,
        });
      } else if (allowAdc && projectId) {
        initializeApp({
          credential: applicationDefault(),
          projectId,
        });
      } else if (projectId) {
        // Initialize app with projectId only so Auth verifyIdToken() works without ADC metadata errors.
        // Firestore Admin db stays null until a matching FIREBASE_SERVICE_ACCOUNT_JSON is provided.
        initializeApp({ projectId });
        cachedAuth = getAuth();
        cachedDb = null;
        log('warn', 'firebase_admin_db_disabled_no_matching_service_account', {
          projectId,
          projectMismatch: cachedProjectMismatch,
          hint: 'Provide FIREBASE_SERVICE_ACCOUNT_JSON matching this projectId to enable server-side webhooks and YouTube cron polling.',
        });
        return {
          db: null,
          auth: cachedAuth,
          configured: false,
          authVerifyReady: Boolean(cachedAuth),
          projectMismatch: cachedProjectMismatch,
        };
      } else {
        log('warn', 'firebase_admin_not_configured', {
          hint: 'Set FIREBASE_SERVICE_ACCOUNT_JSON or VITE_FIREBASE_PROJECT_ID',
        });
        return {
          db: null,
          auth: null,
          configured: false,
          authVerifyReady: false,
          projectMismatch: null,
        };
      }
    }

    cachedAuth = getAuth();
    cachedDb =
      databaseId && databaseId !== '(default)'
        ? getFirestore(getApps()[0], databaseId)
        : getFirestore(getApps()[0]);

    log('info', 'firebase_admin_initialized', { databaseId, projectId });
    return {
      db: cachedDb,
      auth: cachedAuth,
      configured: true,
      authVerifyReady: Boolean(cachedAuth),
      projectMismatch: cachedProjectMismatch,
    };
  } catch (err) {
    log('error', 'firebase_admin_init_failed', { error: String(err) });
    return {
      db: null,
      auth: null,
      configured: false,
      authVerifyReady: false,
      projectMismatch: cachedProjectMismatch,
    };
  }
}
