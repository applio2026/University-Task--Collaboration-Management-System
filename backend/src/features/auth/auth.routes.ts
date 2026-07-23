import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { badRequest, forbidden } from '../../lib/errors';
import { env } from '../../config/env';
import { generateCaptcha, verifyCaptcha } from '../../lib/captcha';
import { strongPassword } from '../../lib/password';
import * as service from './auth.service';

const router = Router();

// Defense-in-depth: a tight per-IP limiter on login on top of the global auth
// limiter, to blunt credential-stuffing / brute-force.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' } },
});

const REFRESH_COOKIE = 'refreshToken';
// `secure`/`sameSite` come from config so an http-only deployment still gets the
// refresh cookie stored — a Secure cookie on a plain-http origin is dropped by
// the browser, which logs the user out on every page refresh.
const cookieBase = {
  httpOnly: true,
  sameSite: env.cookie.sameSite,
  secure: env.cookie.secure,
  path: '/api/auth',
};
const cookieOpts = { ...cookieBase, maxAge: 7 * 24 * 60 * 60 * 1000 };

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     responses:
 *       201: { description: Created }
 */
router.post(
  '/register',
  validate({
    body: z.object({
      email: z.string().email(),
      password: strongPassword,
      fullName: z.string().min(2),
      universityId: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    // Accounts are provisioned by the Super Admin; self-signup is opt-in via env.
    if (!env.allowPublicRegistration) {
      throw forbidden('Self-registration is disabled. Ask an administrator for an account.');
    }
    const result = await service.register(req.body);
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOpts);
    res.status(201).json({ user: result.user, accessToken: result.accessToken });
  }),
);

/**
 * @openapi
 * /auth/captcha:
 *   get:
 *     tags: [Auth]
 *     summary: Get a math verification challenge for the login form
 */
router.get(
  '/captcha',
  asyncHandler(async (_req, res) => {
    res.json(generateCaptcha());
  }),
);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in and receive an access token
 *     responses:
 *       200: { description: OK }
 */
router.post(
  '/login',
  loginLimiter,
  validate({
    body: z.object({
      email: z.string().email(),
      password: z.string(),
      captchaToken: z.string(),
      captchaAnswer: z.coerce.number(),
    }),
  }),
  asyncHandler(async (req, res) => {
    if (!verifyCaptcha(req.body.captchaToken, req.body.captchaAnswer)) {
      throw badRequest('Verification failed. Please solve the challenge again.');
    }
    const result = await service.login(req.body.email, req.body.password);
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOpts);
    res.json({ user: result.user, accessToken: result.accessToken });
  }),
);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Rotate the refresh token and get a new access token
 */
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE] ?? req.body?.refreshToken;
    const result = await service.refresh(token);
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOpts);
    res.json({ user: result.user, accessToken: result.accessToken });
  }),
);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Revoke the current refresh token
 */
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await service.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, cookieBase);
    res.status(204).end();
  }),
);

/**
 * @openapi
 * /auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Change the current user's password (revokes all sessions)
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/change-password',
  authenticate,
  validate({
    body: z.object({ currentPassword: z.string(), newPassword: strongPassword }),
  }),
  asyncHandler(async (req, res) => {
    await service.changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword);
    // The refresh cookie is now revoked server-side; clear it client-side too.
    res.clearCookie(REFRESH_COOKIE, cookieBase);
    res.status(204).end();
  }),
);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get the current authenticated user
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ user: await service.me(req.user!.id) });
  }),
);

export default router;
