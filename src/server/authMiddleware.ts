import type { NextFunction, Request, Response } from 'express';
import { getAdminServices } from './firebaseAdmin.ts';
import { log } from './logger.ts';

export interface AuthenticatedRequest extends Request {
  uid?: string;
  userEmail?: string;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { auth, authVerifyReady } = getAdminServices();

  // If Firebase is not configured yet, allow Local Workspace mode so users can
  // configure everything inside the app without external env var blockers.
  if (!authVerifyReady || !auth) {
    req.uid = 'local_creator';
    req.userEmail = 'creator@local.app';
    next();
    return;
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Authorization Bearer token' });
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  try {
    const decoded = await auth.verifyIdToken(token);
    req.uid = decoded.uid;
    req.userEmail = decoded.email;
    next();
  } catch (err) {
    log('warn', 'auth_token_verification_failed', { error: String(err) });
    res.status(401).json({ error: 'Invalid or expired Firebase ID token' });
  }
}
