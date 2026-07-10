import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requireSuperAdmin } from '../../middleware/rbac';
import { writeAudit } from '../../lib/audit';
import * as spaces from '../spaces/spaces.service';
import * as clusters from '../clusters/clusters.service';

const router = Router();
router.use(authenticate, requireSuperAdmin);

/**
 * @openapi
 * /archive:
 *   get:
 *     tags: [Archive]
 *     summary: List archived spaces, clusters and tasks (super admin only)
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [archivedSpaces, archivedClusters, archivedTasks] = await Promise.all([
      prisma.space.findMany({ where: { isArchived: true }, orderBy: { name: 'asc' } }),
      prisma.cluster.findMany({
        where: { isArchived: true },
        orderBy: { name: 'asc' },
        include: { space: { select: { name: true } } },
      }),
      prisma.task.findMany({
        where: { isArchived: true },
        orderBy: { updatedAt: 'desc' },
        take: 200,
        include: { cluster: { select: { name: true } } },
      }),
    ]);
    res.json({ spaces: archivedSpaces, clusters: archivedClusters, tasks: archivedTasks });
  }),
);

router.post(
  '/spaces/:spaceId/restore',
  asyncHandler(async (req, res) => {
    const space = await spaces.restoreSpace(req.params.spaceId);
    writeAudit(req, 'SPACE_RESTORED', 'Space', space.id);
    res.json({ space });
  }),
);

router.post(
  '/clusters/:clusterId/restore',
  asyncHandler(async (req, res) => {
    const cluster = await clusters.restoreCluster(req.params.clusterId);
    writeAudit(req, 'CLUSTER_RESTORED', 'Cluster', cluster.id);
    res.json({ cluster });
  }),
);

router.post(
  '/tasks/:taskId/restore',
  asyncHandler(async (req, res) => {
    const task = await prisma.task.update({ where: { id: req.params.taskId }, data: { isArchived: false } });
    writeAudit(req, 'TASK_RESTORED', 'Task', task.id);
    res.json({ task });
  }),
);

export default router;
