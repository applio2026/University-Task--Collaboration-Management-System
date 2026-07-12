import { Router } from 'express';
import fs from 'node:fs';
import { ClusterRole } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { getClusterRole, requireClusterRole } from '../../middleware/rbac';
import { upload, verifyUploadedFiles, resolveUploadPath } from '../../lib/upload';
import { badRequest, forbidden, notFound } from '../../lib/errors';

const router = Router();
router.use(authenticate);

const clusterRank: Record<ClusterRole, number> = { STUDENT: 1, TEACHING_ASSISTANT: 2, CLUSTER_ADMIN: 3 };

/**
 * @openapi
 * /clusters/{clusterId}/files:
 *   get:
 *     tags: [Files]
 *     summary: List the cluster's shared file library
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  '/clusters/:clusterId/files',
  requireClusterRole(ClusterRole.STUDENT),
  asyncHandler(async (req, res) => {
    const files = await prisma.fileAsset.findMany({
      where: { clusterId: req.params.clusterId },
      orderBy: { createdAt: 'desc' },
    });
    // FileAsset.uploadedBy is a plain id — resolve the names in one query.
    const uploaderIds = [...new Set(files.map((f) => f.uploadedBy))];
    const users = await prisma.user.findMany({
      where: { id: { in: uploaderIds } },
      select: { id: true, fullName: true, avatarColor: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    res.json({ files: files.map((f) => ({ ...f, uploader: byId.get(f.uploadedBy) ?? null })) });
  }),
);

/**
 * @openapi
 * /clusters/{clusterId}/files:
 *   post:
 *     tags: [Files]
 *     summary: Upload files to the cluster library
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  '/clusters/:clusterId/files',
  requireClusterRole(ClusterRole.STUDENT),
  upload.array('files'),
  verifyUploadedFiles,
  asyncHandler(async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) throw badRequest('No files uploaded');
    await prisma.fileAsset.createMany({
      data: files.map((f) => ({
        clusterId: req.params.clusterId,
        fileName: f.originalname,
        storageKey: f.filename,
        mimeType: f.mimetype,
        sizeBytes: f.size,
        uploadedBy: req.user!.id,
      })),
    });
    const created = await prisma.fileAsset.findMany({
      where: { clusterId: req.params.clusterId },
      orderBy: { createdAt: 'desc' },
    });
    res.status(201).json({ files: created });
  }),
);

router.get(
  '/clusters/:clusterId/files/:fileId/download',
  requireClusterRole(ClusterRole.STUDENT),
  asyncHandler(async (req, res) => {
    const file = await prisma.fileAsset.findUnique({ where: { id: req.params.fileId } });
    if (!file || file.clusterId !== req.params.clusterId) throw notFound('File not found');
    const filePath = resolveUploadPath(file.storageKey);
    if (!fs.existsSync(filePath)) throw notFound('File missing from storage');
    res.download(filePath, file.fileName);
  }),
);

router.delete(
  '/clusters/:clusterId/files/:fileId',
  requireClusterRole(ClusterRole.STUDENT),
  asyncHandler(async (req, res) => {
    const file = await prisma.fileAsset.findUnique({ where: { id: req.params.fileId } });
    if (!file || file.clusterId !== req.params.clusterId) throw notFound('File not found');
    // Uploader can delete their own file; TA/Faculty can delete any.
    const role = await getClusterRole(req.user!.id, file.clusterId, req.user!.systemRole);
    const isPrivileged = role != null && clusterRank[role] >= clusterRank[ClusterRole.TEACHING_ASSISTANT];
    if (file.uploadedBy !== req.user!.id && !isPrivileged) throw forbidden();
    fs.rm(resolveUploadPath(file.storageKey), { force: true }, () => undefined);
    await prisma.fileAsset.delete({ where: { id: file.id } });
    res.status(204).end();
  }),
);

export default router;
