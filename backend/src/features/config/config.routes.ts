import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requireSuperAdmin } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { badRequest } from '../../lib/errors';
import { writeAudit } from '../../lib/audit';

const router = Router();

/**
 * @openapi
 * /config:
 *   get:
 *     tags: [Config]
 *     summary: Public app configuration (org name) — used by the login page
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const uni = await prisma.university.findFirst();
    res.json({ universityName: uni?.name ?? 'University' });
  }),
);

/**
 * @openapi
 * /config:
 *   patch:
 *     tags: [Config]
 *     summary: Update the organization name (super admin only)
 *     security: [{ bearerAuth: [] }]
 */
router.patch(
  '/',
  authenticate,
  requireSuperAdmin,
  validate({ body: z.object({ name: z.string().min(2) }) }),
  asyncHandler(async (req, res) => {
    const uni = await prisma.university.findFirst();
    if (!uni) throw badRequest('No organization configured');
    const updated = await prisma.university.update({
      where: { id: uni.id },
      data: { name: req.body.name.trim() },
    });
    writeAudit(req, 'CONFIG_UPDATED', 'University', updated.id, { name: updated.name });
    res.json({ universityName: updated.name });
  }),
);

export default router;
