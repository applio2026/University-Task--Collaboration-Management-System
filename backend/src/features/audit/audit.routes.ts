import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requireSuperAdmin } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';

const router = Router();
router.use(authenticate, requireSuperAdmin);

/**
 * @openapi
 * /audit:
 *   get:
 *     tags: [Audit]
 *     summary: List audit-log entries (super admin only)
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/',
  validate({
    query: z.object({
      entityType: z.string().optional(),
      action: z.string().optional(),
      limit: z.coerce.number().min(1).max(200).default(100),
    }),
  }),
  asyncHandler(async (req, res) => {
    const where: Prisma.AuditLogWhereInput = {};
    if (req.query.entityType) where.entityType = String(req.query.entityType);
    if (req.query.action) where.action = String(req.query.action);

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Number(req.query.limit ?? 100),
      include: { actor: { select: { id: true, fullName: true, avatarColor: true } } },
    });

    // Distinct actions & entity types present, to power the filter dropdowns.
    const [actions, entityTypes] = await Promise.all([
      prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
      prisma.auditLog.findMany({ distinct: ['entityType'], select: { entityType: true }, orderBy: { entityType: 'asc' } }),
    ]);

    res.json({
      logs,
      actions: actions.map((a) => a.action),
      entityTypes: entityTypes.map((e) => e.entityType),
    });
  }),
);

export default router;
