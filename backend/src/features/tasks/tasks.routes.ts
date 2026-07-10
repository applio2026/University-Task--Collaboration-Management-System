import { NextFunction, Request, Response, Router } from 'express';
import fs from 'node:fs';
import { z } from 'zod';
import { ClusterRole, TaskPriority, TaskStatus, TaskType } from '@prisma/client';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { getClusterRole, requireClusterRole } from '../../middleware/rbac';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { upload, resolveUploadPath } from '../../lib/upload';
import { writeAudit } from '../../lib/audit';
import { emitToCluster } from '../../realtime/io';
import { notify } from '../notifications/notifications.service';
import * as service from './tasks.service';

const router = Router();
router.use(authenticate);

const clusterRank: Record<ClusterRole, number> = { STUDENT: 1, TEACHING_ASSISTANT: 2, CLUSTER_ADMIN: 3 };

/** Authorize by the cluster that owns :taskId, requiring at least `min` role. */
function requireTaskRole(min: ClusterRole) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const clusterId = await service.getTaskClusterId(req.params.taskId);
    const role = await getClusterRole(req.user!.id, clusterId, req.user!.systemRole);
    if (!role || clusterRank[role] < clusterRank[min]) throw forbidden();
    (req as Request & { clusterId?: string }).clusterId = clusterId;
    next();
  });
}

// ── Overview (grouped by space/cluster) ───────────────────
/**
 * @openapi
 * /tasks/overview:
 *   get:
 *     tags: [Tasks]
 *     summary: All accessible clusters with their tasks, grouped for the Overview page
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/tasks/overview',
  asyncHandler(async (req, res) => {
    res.json({ groups: await service.overviewForUser(req.user!.id, req.user!.systemRole) });
  }),
);

// ── List / create within a cluster ────────────────────────
/**
 * @openapi
 * /clusters/{clusterId}/tasks:
 *   get:
 *     tags: [Tasks]
 *     summary: List tasks in a cluster
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/clusters/:clusterId/tasks',
  requireClusterRole(ClusterRole.STUDENT),
  validate({
    query: z.object({
      status: z.nativeEnum(TaskStatus).optional(),
      priority: z.nativeEnum(TaskPriority).optional(),
      assigneeId: z.string().optional(),
      search: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    res.json({ tasks: await service.listTasks(req.params.clusterId, req.query) });
  }),
);

/**
 * @openapi
 * /clusters/{clusterId}/tasks:
 *   post:
 *     tags: [Tasks]
 *     summary: Create a task (TA or Cluster Admin)
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/clusters/:clusterId/tasks',
  requireClusterRole(ClusterRole.TEACHING_ASSISTANT),
  validate({
    body: z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      type: z.nativeEnum(TaskType).optional(),
      priority: z.nativeEnum(TaskPriority).optional(),
      status: z.nativeEnum(TaskStatus).optional(),
      startDate: z.string().datetime().optional(),
      dueDate: z.string().datetime().optional(),
      estimatedMins: z.number().int().positive().optional(),
      assigneeIds: z.array(z.string()).optional(),
      subtasks: z.array(z.string()).optional(),
      checklist: z.array(z.string()).optional(),
      recurrenceRule: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const task = await service.createTask({
      clusterId: req.params.clusterId,
      createdById: req.user!.id,
      ...req.body,
    });
    emitToCluster(req.params.clusterId, 'task:created', task);
    writeAudit(req, 'TASK_CREATED', 'Task', task.id, { title: task.title, clusterId: req.params.clusterId });
    if (req.body.assigneeIds?.length) {
      await notify(req.body.assigneeIds, 'TASK_ASSIGNED', `New task: ${task.title}`, {
        link: `/tasks/${task.id}`,
      });
    }
    res.status(201).json({ task });
  }),
);

// ── Bulk operations ───────────────────────────────────────
router.post(
  '/tasks/bulk',
  validate({
    body: z.object({
      taskIds: z.array(z.string()).min(1),
      op: z.enum(['status', 'priority', 'archive']),
      value: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { taskIds, op, value } = req.body as { taskIds: string[]; op: string; value?: string };

    // Build the update payload, validating the value against its enum.
    let data: Record<string, unknown>;
    if (op === 'status') {
      if (!value || !(value in TaskStatus)) throw badRequest('Invalid status value');
      data = { status: value };
    } else if (op === 'priority') {
      if (!value || !(value in TaskPriority)) throw badRequest('Invalid priority value');
      data = { priority: value };
    } else {
      data = { isArchived: true };
    }

    // Resolve permissions per owning cluster; user needs TA+ on that cluster.
    const metas = await service.getTasksMeta(taskIds);
    const clusterIds = [...new Set(metas.map((m) => m.clusterId))];
    const roleByCluster = new Map<string, ClusterRole | null>();
    await Promise.all(
      clusterIds.map(async (cid) =>
        roleByCluster.set(cid, await getClusterRole(req.user!.id, cid, req.user!.systemRole)),
      ),
    );
    const allowed = metas.filter((m) => {
      const role = roleByCluster.get(m.clusterId);
      return role != null && clusterRank[role] >= clusterRank[ClusterRole.TEACHING_ASSISTANT];
    });
    const allowedIds = allowed.map((m) => m.id);

    const updated = await service.bulkUpdateTasks(allowedIds, data);

    // Notify affected cluster rooms so live views refresh.
    [...new Set(allowed.map((m) => m.clusterId))].forEach((cid) =>
      emitToCluster(cid, 'task:updated', { bulk: true }),
    );
    writeAudit(req, 'TASK_BULK_UPDATE', 'Task', undefined, { op, value, count: updated });

    res.json({ updated, skipped: taskIds.length - allowedIds.length });
  }),
);

// ── Single task ───────────────────────────────────────────
router.get(
  '/tasks/:taskId',
  requireTaskRole(ClusterRole.STUDENT),
  asyncHandler(async (req, res) => {
    res.json({ task: await service.getTask(req.params.taskId) });
  }),
);

router.patch(
  '/tasks/:taskId',
  requireTaskRole(ClusterRole.STUDENT), // students may move status of their own work; finer control TODO
  validate({
    body: z.object({
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      status: z.nativeEnum(TaskStatus).optional(),
      priority: z.nativeEnum(TaskPriority).optional(),
      startDate: z.string().datetime().nullable().optional(),
      dueDate: z.string().datetime().nullable().optional(),
      estimatedMins: z.number().int().positive().nullable().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const task = await service.updateTask(req.params.taskId, req.user!.id, req.body);
    emitToCluster((req as Request & { clusterId: string }).clusterId, 'task:updated', task);
    res.json({ task });
  }),
);

router.put(
  '/tasks/:taskId/assignees',
  requireTaskRole(ClusterRole.TEACHING_ASSISTANT),
  validate({ body: z.object({ userIds: z.array(z.string()) }) }),
  asyncHandler(async (req, res) => {
    const task = await service.setAssignees(req.params.taskId, req.user!.id, req.body.userIds);
    emitToCluster((req as Request & { clusterId: string }).clusterId, 'task:updated', task);
    await notify(req.body.userIds, 'TASK_ASSIGNED', `You were assigned to: ${task.title}`, {
      link: `/tasks/${task.id}`,
    });
    res.json({ task });
  }),
);

router.delete(
  '/tasks/:taskId',
  requireTaskRole(ClusterRole.CLUSTER_ADMIN),
  asyncHandler(async (req, res) => {
    await service.archiveTask(req.params.taskId);
    res.status(204).end();
  }),
);

// ── Subtasks ──────────────────────────────────────────────
router.post(
  '/tasks/:taskId/subtasks',
  requireTaskRole(ClusterRole.TEACHING_ASSISTANT),
  validate({ body: z.object({ title: z.string().min(1), assigneeId: z.string().optional(), dueDate: z.string().datetime().optional() }) }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ subtask: await service.addSubtask(req.params.taskId, req.user!.id, req.body) });
  }),
);

router.patch(
  '/tasks/:taskId/subtasks/:subtaskId',
  requireTaskRole(ClusterRole.STUDENT),
  validate({ body: z.object({ title: z.string().optional(), status: z.nativeEnum(TaskStatus).optional() }) }),
  asyncHandler(async (req, res) => {
    res.json({ subtask: await service.updateSubtask(req.params.subtaskId, req.user!.id, req.body) });
  }),
);

router.delete(
  '/tasks/:taskId/subtasks/:subtaskId',
  requireTaskRole(ClusterRole.TEACHING_ASSISTANT),
  asyncHandler(async (req, res) => {
    await service.deleteSubtask(req.params.subtaskId);
    res.status(204).end();
  }),
);

// ── Checklist ─────────────────────────────────────────────
router.post(
  '/tasks/:taskId/checklist',
  requireTaskRole(ClusterRole.STUDENT),
  validate({ body: z.object({ text: z.string().min(1) }) }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ item: await service.addChecklistItem(req.params.taskId, req.body.text) });
  }),
);

router.patch(
  '/tasks/:taskId/checklist/:itemId',
  requireTaskRole(ClusterRole.STUDENT),
  validate({ body: z.object({ isChecked: z.boolean() }) }),
  asyncHandler(async (req, res) => {
    res.json({ item: await service.toggleChecklistItem(req.params.itemId, req.body.isChecked) });
  }),
);

// ── Comments ──────────────────────────────────────────────
router.get(
  '/tasks/:taskId/comments',
  requireTaskRole(ClusterRole.STUDENT),
  asyncHandler(async (req, res) => {
    res.json({ comments: await service.listComments(req.params.taskId) });
  }),
);

router.post(
  '/tasks/:taskId/comments',
  requireTaskRole(ClusterRole.STUDENT),
  validate({
    body: z.object({
      body: z.string().min(1),
      parentCommentId: z.string().optional(),
      mentions: z.array(z.string()).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const comment = await service.addComment(
      req.params.taskId,
      req.user!.id,
      req.body.body,
      req.body.parentCommentId,
      req.body.mentions ?? [],
    );
    const clusterId = (req as Request & { clusterId: string }).clusterId;
    emitToCluster(clusterId, 'comment:new', { taskId: req.params.taskId, comment });
    if (req.body.mentions?.length) {
      await notify(req.body.mentions, 'MENTIONED', `You were mentioned in a comment`, {
        link: `/tasks/${req.params.taskId}`,
      });
    }
    res.status(201).json({ comment });
  }),
);

router.patch(
  '/tasks/:taskId/comments/:commentId',
  requireTaskRole(ClusterRole.STUDENT),
  validate({ body: z.object({ body: z.string().min(1) }) }),
  asyncHandler(async (req, res) => {
    res.json({ comment: await service.editComment(req.params.commentId, req.user!.id, req.body.body) });
  }),
);

router.delete(
  '/tasks/:taskId/comments/:commentId',
  requireTaskRole(ClusterRole.STUDENT),
  asyncHandler(async (req, res) => {
    res.json({ comment: await service.deleteComment(req.params.commentId) });
  }),
);

// ── Activity ──────────────────────────────────────────────
router.get(
  '/tasks/:taskId/activity',
  requireTaskRole(ClusterRole.STUDENT),
  asyncHandler(async (req, res) => {
    res.json({ activity: await service.getActivity(req.params.taskId) });
  }),
);

// ── Attachments ───────────────────────────────────────────
router.get(
  '/tasks/:taskId/attachments',
  requireTaskRole(ClusterRole.STUDENT),
  asyncHandler(async (req, res) => {
    res.json({ attachments: await service.listTaskAttachments(req.params.taskId) });
  }),
);

router.post(
  '/tasks/:taskId/attachments',
  requireTaskRole(ClusterRole.STUDENT),
  upload.array('files'),
  asyncHandler(async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) throw badRequest('No files uploaded');
    const attachments = await service.addTaskAttachments(
      req.params.taskId,
      req.user!.id,
      files.map((f) => ({
        fileName: f.originalname,
        storageKey: f.filename,
        mimeType: f.mimetype,
        sizeBytes: f.size,
      })),
    );
    res.status(201).json({ attachments });
  }),
);

// Download / delete are addressed by attachment id (not nested under a task),
// so access is resolved from the attachment's owning task.
async function resolveAttachmentAccess(attachmentId: string, userId: string, systemRole: string) {
  const att = await service.getAttachment(attachmentId);
  if (!att.taskId) throw forbidden();
  const clusterId = await service.getTaskClusterId(att.taskId);
  const role = await getClusterRole(userId, clusterId, systemRole);
  if (!role) throw forbidden();
  return { att, role };
}

router.get(
  '/attachments/:attachmentId/download',
  asyncHandler(async (req, res) => {
    const { att } = await resolveAttachmentAccess(req.params.attachmentId, req.user!.id, req.user!.systemRole);
    const filePath = resolveUploadPath(att.storageKey);
    if (!fs.existsSync(filePath)) throw notFound('File missing from storage');
    res.download(filePath, att.fileName);
  }),
);

router.delete(
  '/attachments/:attachmentId',
  asyncHandler(async (req, res) => {
    const { att, role } = await resolveAttachmentAccess(
      req.params.attachmentId,
      req.user!.id,
      req.user!.systemRole,
    );
    // Uploader can remove their own file; TA/Cluster admins can remove any.
    const isPrivileged = clusterRank[role] >= clusterRank[ClusterRole.TEACHING_ASSISTANT];
    if (att.uploaderId !== req.user!.id && !isPrivileged) throw forbidden();
    const filePath = resolveUploadPath(att.storageKey);
    fs.rm(filePath, { force: true }, () => undefined);
    await service.deleteAttachment(req.params.attachmentId);
    res.status(204).end();
  }),
);

// ── Dependencies ──────────────────────────────────────────
router.get(
  '/tasks/:taskId/dependencies',
  requireTaskRole(ClusterRole.STUDENT),
  asyncHandler(async (req, res) => {
    res.json(await service.getDependencies(req.params.taskId));
  }),
);

router.post(
  '/tasks/:taskId/dependencies',
  requireTaskRole(ClusterRole.TEACHING_ASSISTANT),
  validate({
    body: z.object({
      relatedTaskId: z.string(),
      direction: z.enum(['blocks', 'blocked_by']),
    }),
  }),
  asyncHandler(async (req, res) => {
    const dep = await service.addDependency(req.params.taskId, req.body.relatedTaskId, req.body.direction);
    res.status(201).json({ dependency: dep });
  }),
);

router.delete(
  '/tasks/:taskId/dependencies/:dependencyId',
  requireTaskRole(ClusterRole.TEACHING_ASSISTANT),
  asyncHandler(async (req, res) => {
    await service.removeDependency(req.params.dependencyId);
    res.status(204).end();
  }),
);

export default router;
