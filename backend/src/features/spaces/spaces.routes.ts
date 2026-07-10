import { Router } from 'express';
import { z } from 'zod';
import { SpaceRole } from '@prisma/client';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { requireSpaceRole, requireSuperAdmin, getSpaceRole } from '../../middleware/rbac';
import { forbidden } from '../../lib/errors';
import { writeAudit } from '../../lib/audit';
import * as service from './spaces.service';

const router = Router();
router.use(authenticate);

/**
 * @openapi
 * /spaces:
 *   get:
 *     tags: [Spaces]
 *     summary: List spaces the current user can access
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ spaces: await service.listAccessibleSpaces(req.user!.id, req.user!.systemRole) });
  }),
);

/**
 * @openapi
 * /spaces:
 *   post:
 *     tags: [Spaces]
 *     summary: Create a space (super admin only)
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/',
  requireSuperAdmin,
  validate({
    body: z.object({
      name: z.string().min(2),
      description: z.string().optional(),
      color: z.string().optional(),
      universityId: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const space = await service.createSpace(req.body);
    writeAudit(req, 'SPACE_CREATED', 'Space', space.id, { name: space.name });
    res.status(201).json({ space });
  }),
);

/**
 * @openapi
 * /spaces/{spaceId}:
 *   get:
 *     tags: [Spaces]
 *     summary: Get a space
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/:spaceId',
  asyncHandler(async (req, res) => {
    const role = await getSpaceRole(req.user!.id, req.params.spaceId, req.user!.systemRole);
    if (!role) throw forbidden();
    res.json({ space: await service.getSpace(req.params.spaceId) });
  }),
);

router.patch(
  '/:spaceId',
  requireSpaceRole(SpaceRole.SPACE_ADMIN),
  validate({
    body: z.object({
      name: z.string().min(2).optional(),
      description: z.string().optional(),
      color: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    res.json({ space: await service.updateSpace(req.params.spaceId, req.body) });
  }),
);

router.delete(
  '/:spaceId',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    await service.archiveSpace(req.params.spaceId);
    writeAudit(req, 'SPACE_ARCHIVED', 'Space', req.params.spaceId);
    res.status(204).end();
  }),
);

router.post(
  '/:spaceId/members',
  requireSpaceRole(SpaceRole.SPACE_ADMIN),
  validate({ body: z.object({ userId: z.string(), role: z.nativeEnum(SpaceRole).default(SpaceRole.MEMBER) }) }),
  asyncHandler(async (req, res) => {
    const membership = await service.addMember(req.params.spaceId, req.body.userId, req.body.role);
    writeAudit(req, 'SPACE_MEMBER_ADDED', 'Space', req.params.spaceId, { userId: req.body.userId, role: req.body.role });
    res.status(201).json({ membership });
  }),
);

router.delete(
  '/:spaceId/members/:userId',
  requireSpaceRole(SpaceRole.SPACE_ADMIN),
  asyncHandler(async (req, res) => {
    await service.removeMember(req.params.spaceId, req.params.userId);
    res.status(204).end();
  }),
);

export default router;
