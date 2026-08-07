import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { Prisma, SystemRole } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requireSuperAdmin } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { conflict, badRequest } from '../../lib/errors';
import { writeAudit } from '../../lib/audit';

const router = Router();
router.use(authenticate);

const PALETTE = ['#DC2626', '#2563EB', '#7C3AED', '#0F766E', '#16A34A', '#EA580C', '#DB2777', '#0891B2'];

/**
 * @openapi
 * /users:
 *   get:
 *     tags: [Users]
 *     summary: List all users (super admin only)
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/',
  requireSuperAdmin,
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        fullName: true,
        email: true,
        systemRole: true,
        avatarColor: true,
        isActive: true,
        createdAt: true,
        _count: { select: { spaceMemberships: true, clusterMemberships: true } },
      },
    });
    res.json({ users });
  }),
);

/**
 * @openapi
 * /users/{userId}/memberships:
 *   get:
 *     tags: [Users]
 *     summary: A user's current workspace, space & cluster memberships (super admin only)
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/:userId/memberships',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const [workspaceMemberships, spaceMemberships, clusterMemberships] = await Promise.all([
      prisma.workspaceMembership.findMany({
        where: { userId: req.params.userId },
        include: { workspace: { select: { id: true, name: true, color: true } } },
      }),
      prisma.spaceMembership.findMany({
        where: { userId: req.params.userId },
        include: { space: { select: { id: true, name: true, color: true } } },
      }),
      prisma.clusterMembership.findMany({
        where: { userId: req.params.userId },
        include: { cluster: { select: { id: true, name: true, color: true, space: { select: { name: true } } } } },
      }),
    ]);
    res.json({
      workspaces: workspaceMemberships.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        color: m.workspace.color,
        role: m.role,
      })),
      spaces: spaceMemberships.map((m) => ({
        id: m.space.id,
        name: m.space.name,
        color: m.space.color,
        role: m.role,
      })),
      clusters: clusterMemberships.map((m) => ({
        id: m.cluster.id,
        name: m.cluster.name,
        color: m.cluster.color,
        spaceName: m.cluster.space.name,
        role: m.role,
      })),
    });
  }),
);

/**
 * @openapi
 * /users:
 *   post:
 *     tags: [Users]
 *     summary: Create a user (super admin only)
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/',
  requireSuperAdmin,
  validate({
    body: z.object({
      email: z.string().email(),
      // Admin-set initial password is temporary (mustChangePassword forces a
      // rotation on first login), so a min-length temp password is enough — this
      // allows defaulting it to the user's email.
      password: z.string().min(6, 'Temporary password must be at least 6 characters'),
      fullName: z.string().min(2),
      systemRole: z.nativeEnum(SystemRole).default(SystemRole.USER),
      avatarColor: z.string().optional(),
      universityId: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { email, password, fullName, systemRole, avatarColor, universityId } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw conflict('Email already registered');

    const university =
      (universityId && (await prisma.university.findUnique({ where: { id: universityId } }))) ||
      (await prisma.university.findFirst());
    if (!university) throw badRequest('No university exists; seed the database first');

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        universityId: university.id,
        email,
        passwordHash,
        fullName,
        systemRole,
        avatarColor: avatarColor ?? PALETTE[Math.floor(Math.random() * PALETTE.length)],
        // Admin sets a temporary password; the user must rotate it on first login.
        mustChangePassword: true,
      },
      select: { id: true, fullName: true, email: true, systemRole: true, avatarColor: true, isActive: true },
    });
    writeAudit(req, 'USER_CREATED', 'User', user.id, { email: user.email, systemRole });
    res.status(201).json({ user });
  }),
);

/**
 * @openapi
 * /users/{userId}/reset-password:
 *   post:
 *     tags: [Users]
 *     summary: Reset any user's password (super admin only)
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/:userId/reset-password',
  requireSuperAdmin,
  // Admin-set reset passwords are temporary (mustChangePassword forces a rotation
  // on next login), so the full strong-password policy isn't required here — this
  // lets an admin reset to a simple default such as the user's email.
  validate({ body: z.object({ newPassword: z.string().min(6, 'Temporary password must be at least 6 characters') }) }),
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw badRequest('User not found');

    const passwordHash = await bcrypt.hash(req.body.newPassword, 10);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        // Admin-set password is temporary: force the user to rotate it on next
        // login, and clear any lockout from failed attempts.
        data: { passwordHash, mustChangePassword: true, failedLoginAttempts: 0, lockedUntil: null },
      }),
      // Revoke every active session so the old password's tokens stop working.
      prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    writeAudit(req, 'USER_PASSWORD_RESET', 'User', userId, { email: target.email });
    res.status(204).end();
  }),
);

/**
 * @openapi
 * /users/{userId}/active:
 *   patch:
 *     tags: [Users]
 *     summary: Activate or deactivate a user (super admin only)
 *     security: [{ bearerAuth: [] }]
 */
router.patch(
  '/:userId/active',
  requireSuperAdmin,
  validate({ body: z.object({ isActive: z.boolean() }) }),
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    // Guard against locking yourself out.
    if (userId === req.user!.id) throw badRequest('You cannot change your own active status.');
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw badRequest('User not found');

    const { isActive } = req.body as { isActive: boolean };
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { isActive } }),
      // Deactivating: revoke sessions so they're signed out immediately (login
      // already rejects inactive accounts, but this kills existing tokens too).
      ...(isActive
        ? []
        : [prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })]),
    ]);
    writeAudit(req, isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', 'User', userId, { email: target.email });
    res.json({ user: { id: target.id, isActive } });
  }),
);

/**
 * @openapi
 * /users/{userId}:
 *   delete:
 *     tags: [Users]
 *     summary: Permanently delete a user (super admin only)
 *     security: [{ bearerAuth: [] }]
 */
router.delete(
  '/:userId',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    if (userId === req.user!.id) throw badRequest('You cannot delete your own account.');
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw badRequest('User not found');

    try {
      // Cascade relations (memberships, assignments, watchers, comments, chat,
      // notifications, tokens) delete with the user. Content they authored
      // (created tasks, announcements, uploaded files, grades) is FK-restricted,
      // so this throws P2003 rather than orphaning records.
      await prisma.user.delete({ where: { id: userId } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        throw conflict(
          'This user has created content (tasks, announcements, files, or grades) and cannot be deleted. Deactivate them instead.',
        );
      }
      throw e;
    }
    writeAudit(req, 'USER_DELETED', 'User', userId, { email: target.email });
    res.status(204).end();
  }),
);

/**
 * @openapi
 * /users/search:
 *   get:
 *     tags: [Users]
 *     summary: Search users by name/email (for assignees & mentions)
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/search',
  validate({ query: z.object({ q: z.string().default(''), limit: z.coerce.number().max(25).default(10) }) }),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '');
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { fullName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, fullName: true, email: true, avatarColor: true },
      take: Number(req.query.limit ?? 10),
    });
    res.json({ users });
  }),
);

export default router;
