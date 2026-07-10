import { Router } from 'express';
import { z } from 'zod';
import { ClusterKind, ClusterRole, SpaceRole } from '@prisma/client';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { getClusterRole, requireClusterRole, requireSpaceRole } from '../../middleware/rbac';
import { forbidden } from '../../lib/errors';
import { writeAudit } from '../../lib/audit';
import * as service from './clusters.service';

const router = Router();
router.use(authenticate);

/**
 * @openapi
 * /spaces/{spaceId}/clusters:
 *   get:
 *     tags: [Clusters]
 *     summary: List clusters in a space the user can access
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/spaces/:spaceId/clusters',
  asyncHandler(async (req, res) => {
    res.json({
      clusters: await service.listClustersForSpace(req.params.spaceId, req.user!.id, req.user!.systemRole),
    });
  }),
);

/**
 * @openapi
 * /spaces/{spaceId}/clusters:
 *   post:
 *     tags: [Clusters]
 *     summary: Create a cluster (space admin+)
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/spaces/:spaceId/clusters',
  requireSpaceRole(SpaceRole.SPACE_ADMIN),
  validate({
    body: z.object({
      name: z.string().min(2),
      description: z.string().optional(),
      kind: z.nativeEnum(ClusterKind).optional(),
      color: z.string().optional(),
      parentClusterId: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const cluster = await service.createCluster({
      spaceId: req.params.spaceId,
      creatorId: req.user!.id,
      ...req.body,
    });
    writeAudit(req, 'CLUSTER_CREATED', 'Cluster', cluster.id, { name: cluster.name, spaceId: req.params.spaceId });
    res.status(201).json({ cluster });
  }),
);

/**
 * @openapi
 * /clusters/{clusterId}:
 *   get:
 *     tags: [Clusters]
 *     summary: Get a cluster
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/clusters/:clusterId',
  asyncHandler(async (req, res) => {
    const role = await getClusterRole(req.user!.id, req.params.clusterId, req.user!.systemRole);
    if (!role) throw forbidden();
    res.json({ cluster: await service.getCluster(req.params.clusterId) });
  }),
);

router.patch(
  '/clusters/:clusterId',
  requireClusterRole(ClusterRole.CLUSTER_ADMIN),
  validate({
    body: z.object({
      name: z.string().min(2).optional(),
      description: z.string().optional(),
      kind: z.nativeEnum(ClusterKind).optional(),
      color: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    res.json({ cluster: await service.updateCluster(req.params.clusterId, req.body) });
  }),
);

router.delete(
  '/clusters/:clusterId',
  requireClusterRole(ClusterRole.CLUSTER_ADMIN),
  asyncHandler(async (req, res) => {
    await service.archiveCluster(req.params.clusterId);
    writeAudit(req, 'CLUSTER_ARCHIVED', 'Cluster', req.params.clusterId);
    res.status(204).end();
  }),
);

router.get(
  '/clusters/:clusterId/members',
  requireClusterRole(ClusterRole.STUDENT),
  asyncHandler(async (req, res) => {
    res.json({ members: await service.listMembers(req.params.clusterId) });
  }),
);

router.post(
  '/clusters/:clusterId/members',
  requireClusterRole(ClusterRole.CLUSTER_ADMIN),
  validate({ body: z.object({ userId: z.string(), role: z.nativeEnum(ClusterRole).default(ClusterRole.STUDENT) }) }),
  asyncHandler(async (req, res) => {
    const membership = await service.addMember(req.params.clusterId, req.body.userId, req.body.role);
    writeAudit(req, 'CLUSTER_MEMBER_ADDED', 'Cluster', req.params.clusterId, { userId: req.body.userId, role: req.body.role });
    res.status(201).json({ membership });
  }),
);

router.delete(
  '/clusters/:clusterId/members/:userId',
  requireClusterRole(ClusterRole.CLUSTER_ADMIN),
  asyncHandler(async (req, res) => {
    await service.removeMember(req.params.clusterId, req.params.userId);
    res.status(204).end();
  }),
);

export default router;
