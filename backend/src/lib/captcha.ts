import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env';

// Isolated key so a captcha token can never be used as an access token
// (verifyAccessToken uses env.jwt.accessSecret; this derives a distinct secret).
const CAPTCHA_SECRET = `${env.jwt.accessSecret}::captcha`;
const OPS = ['+', '-', '*'] as const;
const TTL_MS = 5 * 60 * 1000;

interface CaptchaPayload {
  a: number;
  b: number;
  op: (typeof OPS)[number];
  jti: string;
}

// Single-use guard: a consumed challenge id can't be replayed. Entries expire
// with the token itself. (In-memory — sufficient for a single server; use Redis
// when running multiple instances.)
const usedJtis = new Map<string, number>();
function sweepUsed() {
  const now = Date.now();
  for (const [jti, exp] of usedJtis) if (exp < now) usedJtis.delete(jti);
}

function solve(p: CaptchaPayload): number {
  return p.op === '+' ? p.a + p.b : p.op === '-' ? p.a - p.b : p.a * p.b;
}

/** Returns a display question and a signed token that encodes the challenge. */
export function generateCaptcha(): { token: string; question: string } {
  const op = OPS[Math.floor(Math.random() * OPS.length)];
  let a = Math.floor(Math.random() * 10) + 1;
  let b = Math.floor(Math.random() * 10) + 1;
  if (op === '-' && b > a) [a, b] = [b, a]; // keep the answer non-negative
  const jti = crypto.randomUUID();
  const token = jwt.sign({ a, b, op, jti } satisfies CaptchaPayload, CAPTCHA_SECRET, { expiresIn: '5m' });
  return { token, question: `${a} ${op} ${b}` };
}

/** Verifies the signed challenge (untampered, unexpired, unused) and the answer.
 *  Consumes the token: a correct answer can only be used once. */
export function verifyCaptcha(token: string | undefined, answer: number | undefined): boolean {
  if (!token || answer === undefined || Number.isNaN(answer)) return false;
  try {
    const payload = jwt.verify(token, CAPTCHA_SECRET) as CaptchaPayload;
    if (usedJtis.has(payload.jti)) return false;
    if (solve(payload) !== answer) return false;
    sweepUsed();
    usedJtis.set(payload.jti, Date.now() + TTL_MS);
    return true;
  } catch {
    return false;
  }
}
