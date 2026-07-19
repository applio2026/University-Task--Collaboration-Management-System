import { Router } from 'express';
import { z } from 'zod';
import { WorkspaceRole } from '@prisma/client';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { requireWorkspaceRole, requireWorkspaceAccess, requireSuperAdmin } from '../../middleware/rbac';
import { writeAudit } from '../../lib/audit';
import * as service from './workspaces.service';
import * as spaceService from '../spaces/spaces.service';

const router = Router();
router.use(authenticate);

/**
 * @openapi
 * /workspaces:
 *   get:
 *     tags: [Workspaces]
 *     summary: List workspaces the current user can access
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/workspaces',
  asyncHandler(async (req, res) => {
    res.json({ workspaces: await service.listAccessibleWorkspaces(req.user!.id, req.user!.systemRole) });
  }),
);

/**
 * @openapi
 * /workspaces:
 *   post:
 *     tags: [Workspaces]
 *     summary: Create a workspace (super admin only)
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/workspaces',
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
    const workspace = await service.createWorkspace(req.body);
    writeAudit(req, 'WORKSPACE_CREATED', 'Workspace', workspace.id, { name: workspace.name });
    res.status(201).json({ workspace });
  }),
);

/**
 * @openapi
 * /workspaces/{workspaceId}:
 *   get:
 *     tags: [Workspaces]
 *     summary: Get a workspace (404 if the user has no access — existence isn't revealed)
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/workspaces/:workspaceId',
  requireWorkspaceAccess(),
  asyncHandler(async (req, res) => {
    res.json({ workspace: await service.getWorkspace(req.params.workspaceId) });
  }),
);

router.patch(
  '/workspaces/:workspaceId',
  requireWorkspaceRole(WorkspaceRole.WORKSPACE_ADMIN),
  validate({
    body: z.object({
      name: z.string().min(2).optional(),
      description: z.string().optional(),
      color: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    res.json({ workspace: await service.updateWorkspace(req.params.workspaceId, req.body) });
  }),
);

router.delete(
  '/workspaces/:workspaceId',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    await service.archiveWorkspace(req.params.workspaceId);
    writeAudit(req, 'WORKSPACE_ARCHIVED', 'Workspace', req.params.workspaceId);
    res.status(204).end();
  }),
);

router.get(
  '/workspaces/:workspaceId/members',
  requireWorkspaceRole(WorkspaceRole.MEMBER),
  asyncHandler(async (req, res) => {
    res.json({ members: await service.listMembers(req.params.workspaceId) });
  }),
);

router.post(
  '/workspaces/:workspaceId/members',
  requireWorkspaceRole(WorkspaceRole.WORKSPACE_ADMIN),
  validate({
    body: z.object({ userId: z.string(), role: z.nativeEnum(WorkspaceRole).default(WorkspaceRole.MEMBER) }),
  }),
  asyncHandler(async (req, res) => {
    const membership = await service.addMember(req.params.workspaceId, req.body.userId, req.body.role);
    writeAudit(req, 'WORKSPACE_MEMBER_ADDED', 'Workspace', req.params.workspaceId, {
      userId: req.body.userId,
      role: req.body.role,
    });
    res.status(201).json({ membership });
  }),
);

router.delete(
  '/workspaces/:workspaceId/members/:userId',
  requireWorkspaceRole(WorkspaceRole.WORKSPACE_ADMIN),
  asyncHandler(async (req, res) => {
    await service.removeMember(req.params.workspaceId, req.params.userId);
    res.status(204).end();
  }),
);

// ── Spaces within a workspace ──────────────────────────────
/**
 * @openapi
 * /workspaces/{workspaceId}/spaces:
 *   get:
 *     tags: [Workspaces]
 *     summary: List spaces in a workspace the user can access
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/workspaces/:workspaceId/spaces',
  requireWorkspaceAccess(),
  asyncHandler(async (req, res) => {
    res.json({
      spaces: await spaceService.listSpacesForWorkspace(req.params.workspaceId, req.user!.id, req.user!.systemRole),
    });
  }),
);

/**
 * @openapi
 * /workspaces/{workspaceId}/spaces:
 *   post:
 *     tags: [Workspaces]
 *     summary: Create a space in a workspace (workspace admin+)
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/workspaces/:workspaceId/spaces',
  requireWorkspaceRole(WorkspaceRole.WORKSPACE_ADMIN),
  validate({
    body: z.object({
      name: z.string().min(2),
      description: z.string().optional(),
      color: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const space = await spaceService.createSpace({ workspaceId: req.params.workspaceId, ...req.body });
    writeAudit(req, 'SPACE_CREATED', 'Space', space.id, { name: space.name, workspaceId: req.params.workspaceId });
    res.status(201).json({ space });
  }),
);

export default router;
