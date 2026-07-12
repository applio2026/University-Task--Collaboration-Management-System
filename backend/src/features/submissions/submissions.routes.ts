import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ClusterRole } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { getClusterRole } from '../../middleware/rbac';
import { upload, verifyUploadedFiles } from '../../lib/upload';
import { forbidden, notFound } from '../../lib/errors';
import { getTaskClusterId } from '../tasks/tasks.service';
import { notify } from '../notifications/notifications.service';
import { writeAudit } from '../../lib/audit';

const router = Router();
router.use(authenticate);

const clusterRank: Record<ClusterRole, number> = { STUDENT: 1, TEACHING_ASSISTANT: 2, CLUSTER_ADMIN: 3 };
const studentSelect = { id: true, fullName: true, avatarColor: true };

/** Resolve the caller's role on the task's cluster; require at least `min`. */
function requireTaskRole(min: ClusterRole) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const clusterId = await getTaskClusterId(req.params.taskId);
    const role = await getClusterRole(req.user!.id, clusterId, req.user!.systemRole);
    if (!role || clusterRank[role] < clusterRank[min]) throw forbidden();
    (req as Request & { clusterRole?: ClusterRole }).clusterRole = role;
    next();
  });
}

const submissionInclude = {
  student: { select: studentSelect },
  attachments: true,
  grade: { include: { grader: { select: studentSelect } } },
};

/**
 * @openapi
 * /tasks/{taskId}/submissions:
 *   get:
 *     tags: [Submissions]
 *     summary: List submissions (students see their own; TA/faculty see all)
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/tasks/:taskId/submissions',
  requireTaskRole(ClusterRole.STUDENT),
  asyncHandler(async (req, res) => {
    const role = (req as Request & { clusterRole?: ClusterRole }).clusterRole;
    const isStaff = role === ClusterRole.TEACHING_ASSISTANT || role === ClusterRole.CLUSTER_ADMIN;
    const submissions = await prisma.submission.findMany({
      where: {
        taskId: req.params.taskId,
        ...(isStaff ? {} : { studentId: req.user!.id }),
      },
      orderBy: [{ studentId: 'asc' }, { version: 'desc' }],
      include: submissionInclude,
    });
    res.json({ submissions, canGrade: isStaff });
  }),
);

/**
 * @openapi
 * /tasks/{taskId}/submissions:
 *   post:
 *     tags: [Submissions]
 *     summary: Submit work for a task (with optional files)
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/tasks/:taskId/submissions',
  requireTaskRole(ClusterRole.STUDENT),
  upload.array('files'),
  verifyUploadedFiles,
  validate({
    body: z.object({
      note: z.string().optional(),
      // Newline- or comma-separated URLs, sent as a single field with multipart.
      links: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const links = (req.body.links ?? '')
      .split(/[\n,]/)
      .map((s: string) => s.trim())
      .filter(Boolean);

    const priorCount = await prisma.submission.count({
      where: { taskId: req.params.taskId, studentId: req.user!.id },
    });

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const submission = await prisma.submission.create({
      data: {
        taskId: req.params.taskId,
        studentId: req.user!.id,
        version: priorCount + 1,
        note: req.body.note || null,
        links,
        attachments: {
          create: files.map((f) => ({
            uploaderId: req.user!.id,
            fileName: f.originalname,
            storageKey: f.filename,
            mimeType: f.mimetype,
            sizeBytes: f.size,
          })),
        },
      },
      include: submissionInclude,
    });

    // Notify the cluster's faculty & TAs that work was submitted.
    const clusterId = await getTaskClusterId(req.params.taskId);
    const staff = await prisma.clusterMembership.findMany({
      where: { clusterId, role: { in: [ClusterRole.TEACHING_ASSISTANT, ClusterRole.CLUSTER_ADMIN] } },
      select: { userId: true },
    });
    await notify(
      staff.map((s) => s.userId),
      'TASK_UPDATED',
      'New submission to review',
      { link: `/tasks/${req.params.taskId}` },
    );

    res.status(201).json({ submission });
  }),
);

/**
 * @openapi
 * /submissions/{submissionId}/grade:
 *   post:
 *     tags: [Submissions]
 *     summary: Grade a submission (TA or Faculty)
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/submissions/:submissionId/grade',
  validate({
    body: z.object({
      score: z.number().min(0),
      maxScore: z.number().positive().default(100),
      feedback: z.string().optional(),
      status: z.enum(['ACCEPTED', 'REJECTED', 'RESUBMIT']).default('ACCEPTED'),
    }),
  }),
  asyncHandler(async (req, res) => {
    const submission = await prisma.submission.findUnique({ where: { id: req.params.submissionId } });
    if (!submission) throw notFound('Submission not found');

    const role = await getClusterRole(
      req.user!.id,
      await getTaskClusterId(submission.taskId),
      req.user!.systemRole,
    );
    const isStaff = role === ClusterRole.TEACHING_ASSISTANT || role === ClusterRole.CLUSTER_ADMIN;
    if (!isStaff) throw forbidden();

    const { score, maxScore, feedback, status } = req.body;
    const grade = await prisma.grade.upsert({
      where: { submissionId: submission.id },
      update: { score, maxScore, feedback, graderId: req.user!.id },
      create: {
        submissionId: submission.id,
        taskId: submission.taskId,
        graderId: req.user!.id,
        score,
        maxScore,
        feedback,
      },
      include: { grader: { select: studentSelect } },
    });
    await prisma.submission.update({ where: { id: submission.id }, data: { status } });
    writeAudit(req, 'SUBMISSION_GRADED', 'Submission', submission.id, { score, maxScore, taskId: submission.taskId });

    await notify([submission.studentId], 'SUBMISSION_GRADED', `Your submission was graded: ${score}/${maxScore}`, {
      link: `/tasks/${submission.taskId}`,
    });

    res.json({ grade });
  }),
);

export default router;
