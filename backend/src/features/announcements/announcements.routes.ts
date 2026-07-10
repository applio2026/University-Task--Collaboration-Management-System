import { Router } from 'express';
import { z } from 'zod';
import { ClusterRole } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { getClusterRole, requireClusterRole } from '../../middleware/rbac';
import { forbidden, notFound } from '../../lib/errors';
import { emitToCluster } from '../../realtime/io';
import { notify } from '../notifications/notifications.service';

const router = Router();
router.use(authenticate);

const authorSelect = { id: true, fullName: true, avatarColor: true };

/**
 * @openapi
 * /clusters/{clusterId}/announcements:
 *   get:
 *     tags: [Announcements]
 *     summary: List announcements in a cluster
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/clusters/:clusterId/announcements',
  requireClusterRole(ClusterRole.STUDENT),
  asyncHandler(async (req, res) => {
    const announcements = await prisma.announcement.findMany({
      where: { clusterId: req.params.clusterId },
      orderBy: { createdAt: 'desc' },
      include: { author: { select: authorSelect } },
    });
    res.json({ announcements });
  }),
);

/**
 * @openapi
 * /clusters/{clusterId}/announcements:
 *   post:
 *     tags: [Announcements]
 *     summary: Post an announcement (TA or Cluster Admin)
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/clusters/:clusterId/announcements',
  requireClusterRole(ClusterRole.TEACHING_ASSISTANT),
  validate({ body: z.object({ title: z.string().min(1), body: z.string().min(1) }) }),
  asyncHandler(async (req, res) => {
    const announcement = await prisma.announcement.create({
      data: {
        clusterId: req.params.clusterId,
        authorId: req.user!.id,
        title: req.body.title,
        body: req.body.body,
      },
      include: { author: { select: authorSelect } },
    });
    emitToCluster(req.params.clusterId, 'announcement:new', announcement);

    // Notify every other member of the cluster.
    const members = await prisma.clusterMembership.findMany({
      where: { clusterId: req.params.clusterId, NOT: { userId: req.user!.id } },
      select: { userId: true },
    });
    await notify(
      members.map((m) => m.userId),
      'ANNOUNCEMENT_POSTED',
      announcement.title,
      { body: announcement.body.slice(0, 140), link: `/clusters/${req.params.clusterId}` },
    );

    res.status(201).json({ announcement });
  }),
);

router.delete(
  '/announcements/:announcementId',
  asyncHandler(async (req, res) => {
    const ann = await prisma.announcement.findUnique({ where: { id: req.params.announcementId } });
    if (!ann) throw notFound('Announcement not found');
    const role = await getClusterRole(req.user!.id, ann.clusterId, req.user!.systemRole);
    const isPrivileged = role === ClusterRole.CLUSTER_ADMIN || role === ClusterRole.TEACHING_ASSISTANT;
    if (ann.authorId !== req.user!.id && !isPrivileged) throw forbidden();
    await prisma.announcement.delete({ where: { id: ann.id } });
    emitToCluster(ann.clusterId, 'announcement:deleted', { id: ann.id });
    res.status(204).end();
  }),
);

export default router;
