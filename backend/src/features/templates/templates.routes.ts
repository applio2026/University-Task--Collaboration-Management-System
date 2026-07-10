import { Router } from 'express';
import { z } from 'zod';
import { TaskPriority, TaskType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requireSuperAdmin } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { writeAudit } from '../../lib/audit';

const router = Router();
router.use(authenticate);

/**
 * @openapi
 * /templates:
 *   get:
 *     tags: [Templates]
 *     summary: List task templates
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const templates = await prisma.taskTemplate.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ templates });
  }),
);

/**
 * @openapi
 * /templates:
 *   post:
 *     tags: [Templates]
 *     summary: Create a task template (super admin only)
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/',
  requireSuperAdmin,
  validate({
    body: z.object({
      name: z.string().min(2),
      description: z.string().optional(),
      type: z.nativeEnum(TaskType).default(TaskType.GENERIC),
      priority: z.nativeEnum(TaskPriority).default(TaskPriority.MEDIUM),
      subtasks: z.array(z.string()).default([]),
      checklist: z.array(z.string()).default([]),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { name, description, type, priority, subtasks, checklist } = req.body;
    const template = await prisma.taskTemplate.create({
      data: {
        name,
        description,
        type,
        priority,
        payload: {
          subtasks: subtasks.map((s: string) => s.trim()).filter(Boolean),
          checklist: checklist.map((c: string) => c.trim()).filter(Boolean),
        },
      },
    });
    writeAudit(req, 'TEMPLATE_CREATED', 'TaskTemplate', template.id, { name });
    res.status(201).json({ template });
  }),
);

router.delete(
  '/:templateId',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    await prisma.taskTemplate.deleteMany({ where: { id: req.params.templateId } });
    writeAudit(req, 'TEMPLATE_DELETED', 'TaskTemplate', req.params.templateId);
    res.status(204).end();
  }),
);

export default router;
