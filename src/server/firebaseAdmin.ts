import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import type { Request, Response, NextFunction } from 'express';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };
import { checkBackendAccess } from '../shared/solarEngine.ts';

if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

export const adminAuth = getAuth();

export interface AuthenticatedRequest extends Request {
  user?: DecodedIdToken;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Missing Bearer token.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    console.error('JWT verification failed:', error);
    res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

export function verifyResourceAccess(
  req: AuthenticatedRequest,
  options: {
    resourceOwnerUid?: string;
    assignedStaffUids?: string[];
    requesterRole?: 'HOMEOWNER' | 'SALES_STAFF' | 'ADMIN';
    requireStaff?: boolean;
  }
): { allowed: boolean; reason?: string } {
  if (!req.user) {
    return { allowed: false, reason: 'Unauthenticated request.' };
  }
  return checkBackendAccess({
    requesterUid: req.user.uid,
    requesterEmail: req.user.email,
    emailVerified: req.user.email_verified,
    requesterRole: options.requesterRole,
    resourceOwnerUid: options.resourceOwnerUid,
    assignedStaffUids: options.assignedStaffUids,
    requireStaff: options.requireStaff,
  });
}
