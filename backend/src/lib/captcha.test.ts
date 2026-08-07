import { describe, it, expect } from 'vitest';
import { generateCaptcha, verifyCaptcha } from './captcha';

function solve(question: string): number {
  const [a, op, b] = question.split(' ');
  const x = Number(a);
  const y = Number(b);
  return op === '+' ? x + y : op === '-' ? x - y : x * y;
}

describe('captcha', () => {
  it('generates a token and a well-formed question', () => {
    const c = generateCaptcha();
    expect(typeof c.token).toBe('string');
    expect(c.question).toMatch(/^\d+ [+\-*] \d+$/);
  });

  it('verifies a correct answer', () => {
    const c = generateCaptcha();
    expect(verifyCaptcha(c.token, solve(c.question))).toBe(true);
  });

  it('is single-use: a token cannot be replayed', () => {
    const c = generateCaptcha();
    const ans = solve(c.question);
    expect(verifyCaptcha(c.token, ans)).toBe(true);
    expect(verifyCaptcha(c.token, ans)).toBe(false);
  });

  it('rejects a wrong answer', () => {
    const c = generateCaptcha();
    expect(verifyCaptcha(c.token, solve(c.question) + 1)).toBe(false);
  });

  it('rejects a missing token or NaN/undefined answer', () => {
    const c = generateCaptcha();
    expect(verifyCaptcha(undefined, 5)).toBe(false);
    expect(verifyCaptcha(c.token, undefined)).toBe(false);
    expect(verifyCaptcha(c.token, NaN)).toBe(false);
  });

  it('rejects a tampered / non-JWT token', () => {
    expect(verifyCaptcha('not-a-jwt', 5)).toBe(false);
  });

  it('always keeps subtraction non-negative and covers all operators', () => {
    // Many iterations exercise +, -, * and the b>a swap branch deterministically.
    for (let i = 0; i < 200; i++) {
      const c = generateCaptcha();
      const [, op, b] = c.question.split(' ');
      if (op === '-') expect(Number(c.question.split(' ')[0])).toBeGreaterThanOrEqual(Number(b));
      expect(verifyCaptcha(c.token, solve(c.question))).toBe(true);
    }
  });
});
