import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { authenticate } from './auth';
import { signAccessToken } from '../lib/jwt';
import { AppError } from '../lib/errors';

function mkReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

describe('authenticate', () => {
  it('populates req.user for a valid Bearer token', () => {
    const token = signAccessToken({ sub: 'u1', email: 'a@b.com', systemRole: 'USER' });
    const req = mkReq({ authorization: `Bearer ${token}` });
    const next = vi.fn();
    authenticate(req, {} as Response, next);
    expect(req.user).toEqual({ id: 'u1', email: 'a@b.com', systemRole: 'USER' });
    expect(next).toHaveBeenCalledOnce();
  });

  it('throws 401 when the Authorization header is missing', () => {
    expect(() => authenticate(mkReq({}), {} as Response, vi.fn())).toThrow(AppError);
  });

  it('throws 401 when the token is invalid', () => {
    const req = mkReq({ authorization: 'Bearer garbage' });
    expect(() => authenticate(req, {} as Response, vi.fn())).toThrow(AppError);
  });
});
