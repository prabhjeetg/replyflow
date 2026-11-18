import { getFirebaseAuth } from './firebase';

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const auth = getFirebaseAuth();
  const user = auth?.currentUser;
  const token = user ? await user.getIdToken() : '';

  const headers = new Headers(init.headers || {});
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(path, {
    ...init,
    headers,
  });

  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data;
}
