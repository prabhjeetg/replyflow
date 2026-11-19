import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type Auth,
} from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  type Firestore,
} from 'firebase/firestore';

export interface FirebaseConfigShape {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  firestoreDatabaseId?: string;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let resolvedAppUrl = typeof window !== 'undefined' ? window.location.origin : '';

export function getResolvedAppUrl(): string {
  return resolvedAppUrl;
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: authInstance?.currentUser?.uid,
      email: authInstance?.currentUser?.email,
      emailVerified: authInstance?.currentUser?.emailVerified,
      isAnonymous: authInstance?.currentUser?.isAnonymous,
      tenantId: authInstance?.currentUser?.tenantId,
      providerInfo:
        authInstance?.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function readBuildTimeFirebaseEnv(): FirebaseConfigShape | null {
  const apiKey = (import.meta.env.VITE_FIREBASE_API_KEY || '').trim();
  const authDomain = (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim();
  const projectId = (import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim();
  const appId = (import.meta.env.VITE_FIREBASE_APP_ID || '').trim();
  const storageBucket = (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim();
  const messagingSenderId = (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim();
  const firestoreDatabaseId = (import.meta.env.VITE_FIREBASE_DATABASE_ID || '(default)').trim() || '(default)';

  if (!apiKey || !projectId) {
    return null;
  }

  return {
    apiKey,
    authDomain: authDomain || `${projectId}.firebaseapp.com`,
    projectId,
    appId,
    storageBucket: storageBucket || undefined,
    messagingSenderId: messagingSenderId || undefined,
    firestoreDatabaseId,
  };
}

export async function initFirebaseClient(): Promise<{
  configured: boolean;
  app: FirebaseApp | null;
  auth: Auth | null;
  db: Firestore | null;
}> {
  if (appInstance && authInstance && dbInstance) {
    return { configured: true, app: appInstance, auth: authInstance, db: dbInstance };
  }

  // Clear any legacy localStorage override so only VITE_FIREBASE_* env vars are used
  try {
    localStorage.removeItem('replyflow_firebase_config');
  } catch {
    // ignore storage errors
  }

  let config: FirebaseConfigShape | null = readBuildTimeFirebaseEnv();

  try {
    const res = await fetch('/api/public-config');
    if (res.ok) {
      const data = (await res.json()) as {
        firebaseConfig: FirebaseConfigShape | null;
        appUrl?: string;
      };
      if (data.appUrl) resolvedAppUrl = data.appUrl;
      // Fallback to runtime server env vars (same VITE_FIREBASE_* keys) when Docker builds without build args
      if (!config && data.firebaseConfig?.apiKey && data.firebaseConfig?.projectId) {
        config = {
          apiKey: data.firebaseConfig.apiKey,
          authDomain:
            data.firebaseConfig.authDomain ||
            `${data.firebaseConfig.projectId}.firebaseapp.com`,
          projectId: data.firebaseConfig.projectId,
          appId: data.firebaseConfig.appId || '',
          storageBucket: data.firebaseConfig.storageBucket || undefined,
          messagingSenderId: data.firebaseConfig.messagingSenderId || undefined,
          firestoreDatabaseId: data.firebaseConfig.firestoreDatabaseId || '(default)',
        };
      }
    }
  } catch {
    // ignore network error; rely on build-time VITE_FIREBASE_* env vars
  }

  if (!config || !config.apiKey || !config.projectId) {
    return { configured: false, app: null, auth: null, db: null };
  }

  appInstance = getApps().length > 0 ? getApps()[0] : initializeApp(config);
  authInstance = getAuth(appInstance);
  dbInstance =
    config.firestoreDatabaseId && config.firestoreDatabaseId !== '(default)'
      ? getFirestore(appInstance, config.firestoreDatabaseId)
      : getFirestore(appInstance);

  // Validate Firestore connection on initial boot
  try {
    await getDocFromServer(doc(dbInstance, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }

  return { configured: true, app: appInstance, auth: authInstance, db: dbInstance };
}

export function getFirebaseAuth(): Auth | null {
  return authInstance;
}

export function getFirebaseDb(): Firestore | null {
  return dbInstance;
}

export async function loginWithGoogle() {
  if (!authInstance) throw new Error('Firebase Auth is not configured');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(authInstance, provider);
}

export async function logoutUser() {
  if (!authInstance) return;
  await signOut(authInstance);
}
