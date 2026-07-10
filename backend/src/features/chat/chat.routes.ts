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

const router = Router();
router.use(authenticate);

const authorSelect = { id: true, fullName: true, avatarColor: true };

/**
 * @openapi
 * /clusters/{clusterId}/chat:
 *   get:
 *     tags: [Chat]
 *     summary: List recent chat messages in a cluster
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/clusters/:clusterId/chat',
  requireClusterRole(ClusterRole.STUDENT),
  asyncHandler(async (req, res) => {
    const messages = await prisma.chatMessage.findMany({
      where: { clusterId: req.params.clusterId, isDeleted: false },
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: { author: { select: authorSelect } },
    });
    res.json({ messages });
  }),
);

/**
 * @openapi
 * /clusters/{clusterId}/chat:
 *   post:
 *     tags: [Chat]
 *     summary: Send a chat message
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/clusters/:clusterId/chat',
  requireClusterRole(ClusterRole.STUDENT),
  validate({ body: z.object({ body: z.string().min(1), parentMessageId: z.string().optional() }) }),
  asyncHandler(async (req, res) => {
    const message = await prisma.chatMessage.create({
      data: {
        clusterId: req.params.clusterId,
        authorId: req.user!.id,
        body: req.body.body,
        parentMessageId: req.body.parentMessageId,
      },
      include: { author: { select: authorSelect } },
    });
    emitToCluster(req.params.clusterId, 'chat:new', message);
    res.status(201).json({ message });
  }),
);

router.delete(
  '/chat/:messageId',
  asyncHandler(async (req, res) => {
    const msg = await prisma.chatMessage.findUnique({ where: { id: req.params.messageId } });
    if (!msg) throw notFound('Message not found');
    const role = await getClusterRole(req.user!.id, msg.clusterId, req.user!.systemRole);
    const isPrivileged = role === ClusterRole.CLUSTER_ADMIN || role === ClusterRole.TEACHING_ASSISTANT;
    if (msg.authorId !== req.user!.id && !isPrivileged) throw forbidden();
    // Soft delete so threads stay intact.
    await prisma.chatMessage.update({ where: { id: msg.id }, data: { isDeleted: true, body: '' } });
    emitToCluster(msg.clusterId, 'chat:deleted', { id: msg.id });
    res.status(204).end();
  }),
);

export default router;
