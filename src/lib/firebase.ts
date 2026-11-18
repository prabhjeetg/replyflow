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

function loadLocalOverrideConfig(): FirebaseConfigShape | null {
  try {
    const raw = localStorage.getItem('replyflow_firebase_config');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FirebaseConfigShape;
    if (parsed?.apiKey && parsed?.projectId) return parsed;
  } catch {
    // ignore malformed local config
  }
  return null;
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

  let config: FirebaseConfigShape | null = null;

  try {
    const res = await fetch('/api/public-config');
    if (res.ok) {
      const data = (await res.json()) as {
        firebaseConfig: FirebaseConfigShape | null;
        appUrl?: string;
      };
      if (data.appUrl) resolvedAppUrl = data.appUrl;
      if (data.firebaseConfig?.apiKey) {
        config = data.firebaseConfig;
      }
    }
  } catch {
    // Fallback to Vite env / localStorage
  }

  if (!config && import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_PROJECT_ID) {
    config = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain:
        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
        `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
      firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || '(default)',
    };
  }

  if (!config) {
    config = loadLocalOverrideConfig();
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
