import { describe, it, expect } from 'vitest';
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} from './jwt';

describe('jwt', () => {
  it('signs and verifies an access token round-trip', () => {
    const token = signAccessToken({ sub: 'u1', email: 'a@b.com', systemRole: 'ADMIN' });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('u1');
    expect(payload.email).toBe('a@b.com');
    expect(payload.systemRole).toBe('ADMIN');
  });

  it('signs unique refresh tokens (jti) and verifies them', () => {
    const t1 = signRefreshToken('u1');
    const t2 = signRefreshToken('u1');
    expect(t1).not.toBe(t2);
    expect(verifyRefreshToken(t1).sub).toBe('u1');
  });

  it('throws on invalid tokens', () => {
    expect(() => verifyAccessToken('nonsense')).toThrow();
    expect(() => verifyRefreshToken('nonsense')).toThrow();
  });

  it('hashes tokens deterministically as sha256 hex', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe(hashToken('xyz'));
    expect(hashToken('abc')).toMatch(/^[a-f0-9]{64}$/);
  });
});
