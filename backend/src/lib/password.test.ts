import { describe, it, expect } from 'vitest';
import { strongPassword } from './password';

describe('strongPassword', () => {
  it('accepts a valid password', () => {
    expect(strongPassword.safeParse('Abcdef12').success).toBe(true);
  });
  it('rejects one that is too short', () => {
    expect(strongPassword.safeParse('Ab1').success).toBe(false);
  });
  it('rejects one missing an uppercase letter', () => {
    expect(strongPassword.safeParse('abcdef12').success).toBe(false);
  });
  it('rejects one missing a lowercase letter', () => {
    expect(strongPassword.safeParse('ABCDEF12').success).toBe(false);
  });
  it('rejects one missing a digit', () => {
    expect(strongPassword.safeParse('Abcdefgh').success).toBe(false);
  });
});
