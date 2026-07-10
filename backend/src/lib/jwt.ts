import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string; // userId
  email: string;
  systemRole: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessTtl as SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwt.accessSecret) as AccessTokenPayload;
}

export function signRefreshToken(userId: string): string {
  // `jti` guarantees each token (and thus its stored hash) is unique, even when
  // the same user logs in twice within the same second.
  return jwt.sign({ sub: userId, jti: crypto.randomUUID() }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshTtl as SignOptions['expiresIn'],
  });
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, env.jwt.refreshSecret) as { sub: string };
}

/** We store only a hash of refresh tokens so DB leaks can't reissue sessions. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
