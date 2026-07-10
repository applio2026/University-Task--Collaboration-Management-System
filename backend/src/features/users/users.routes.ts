import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { SystemRole } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requireSuperAdmin } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { conflict, badRequest } from '../../lib/errors';
import { strongPassword } from '../../lib/password';
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
 *     summary: A user's current space & cluster memberships (super admin only)
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/:userId/memberships',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const [spaceMemberships, clusterMemberships] = await Promise.all([
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
      password: strongPassword,
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
