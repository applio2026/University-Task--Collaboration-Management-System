import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const router = Router();
router.use(authenticate);

/** Cluster access filter: super admins see all; others see clusters they belong
 *  to or are space-admin of. Mirrors the Overview access rules. */
function accessibleClusterWhere(userId: string, systemRole: string): Prisma.ClusterWhereInput {
  if ((systemRole === 'SUPER_ADMIN' || systemRole === 'ADMIN')) return { isArchived: false };
  return {
    isArchived: false,
    OR: [
      { memberships: { some: { userId } } },
      { space: { memberships: { some: { userId, role: 'SPACE_ADMIN' } } } },
    ],
  };
}

/**
 * @openapi
 * /search:
 *   get:
 *     tags: [Search]
 *     summary: Global search across tasks, clusters and users (access-scoped)
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/',
  validate({ query: z.object({ q: z.string().default('') }) }),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) {
      return res.json({ tasks: [], clusters: [], users: [] });
    }

    const clusterScope = accessibleClusterWhere(req.user!.id, req.user!.systemRole);
    const contains = { contains: q, mode: 'insensitive' as const };

    const [tasks, clusters, users] = await Promise.all([
      prisma.task.findMany({
        where: { isArchived: false, title: contains, cluster: clusterScope },
        take: 8,
        orderBy: { updatedAt: 'desc' },
        select: { id: true, title: true, status: true, cluster: { select: { id: true, name: true } } },
      }),
      prisma.cluster.findMany({
        where: { ...clusterScope, name: contains },
        take: 6,
        orderBy: { name: 'asc' },
        select: { id: true, name: true, color: true, space: { select: { name: true } } },
      }),
      prisma.user.findMany({
        where: { isActive: true, OR: [{ fullName: contains }, { email: contains }] },
        take: 6,
        select: { id: true, fullName: true, email: true, avatarColor: true },
      }),
    ]);

    res.json({
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        clusterId: t.cluster.id,
        clusterName: t.cluster.name,
      })),
      clusters: clusters.map((c) => ({ id: c.id, name: c.name, color: c.color, spaceName: c.space.name })),
      users,
    });
  }),
);

export default router;
