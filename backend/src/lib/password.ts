import { z } from 'zod';

/**
 * Password-complexity policy: at least 8 chars, with a lowercase letter, an
 * uppercase letter, and a digit. Shared by registration and admin user creation.
 */
export const strongPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[0-9]/, 'Password must include a number');
