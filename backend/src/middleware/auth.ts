import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../lib/jwt';
import { unauthorized } from '../lib/errors';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        systemRole: string;
      };
    }
  }
}

/** Populates req.user from a Bearer access token. Throws 401 if missing/invalid. */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw unauthorized('Missing bearer token');
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email, systemRole: payload.systemRole };
    next();
  } catch {
    throw unauthorized('Invalid or expired token');
  }
}
