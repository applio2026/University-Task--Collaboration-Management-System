import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as service from './notifications.service';

const router = Router();
router.use(authenticate);

/**
 * @openapi
 * /notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: List current user's notifications
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/',
  validate({ query: z.object({ unread: z.enum(['true', 'false']).optional() }) }),
  asyncHandler(async (req, res) => {
    res.json({ notifications: await service.listForUser(req.user!.id, req.query.unread === 'true') });
  }),
);

router.post(
  '/read',
  validate({ body: z.object({ ids: z.array(z.string()) }) }),
  asyncHandler(async (req, res) => {
    await service.markRead(req.user!.id, req.body.ids);
    res.status(204).end();
  }),
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await service.markAllRead(req.user!.id);
    res.status(204).end();
  }),
);

export default router;
