import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { env } from '../config/env';
import { badRequest } from './errors';

export const uploadsDir = path.resolve(process.cwd(), env.uploadsDir);
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    // Random storage key; the original name is preserved in the DB record.
    cb(null, `${crypto.randomUUID()}${path.extname(file.originalname)}`);
  },
});

// Uploads are restricted to raster images and PDFs — the only formats the app
// needs — using an ALLOW-list (an executable/script deny-list is unsafe: any type
// not on it slips through). Notably absent: SVG, which is XML that can carry
// <script>, so it is treated as executable content and rejected.
export const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.pdf']);
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'application/pdf',
]);

const ALLOWED_MESSAGE = 'Only image files (JPEG, PNG, GIF, WebP, BMP) or PDF documents can be uploaded.';

/** Shared Multer instance: disk storage, 20 MB per file, up to 10 files. */
export const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    // First gate: both the extension AND the declared MIME type must be allowed.
    // (Client-declared values can be spoofed — the content is verified after the
    // file lands on disk by `verifyUploadedFiles`.)
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(badRequest(ALLOWED_MESSAGE));
      return;
    }
    cb(null, true);
  },
});

/**
 * Reads the leading bytes ("magic number") of a file and returns the format it
 * genuinely is, or null. This defeats a renamed executable (e.g. malware.exe
 * saved as report.pdf): the extension/MIME can lie, the file signature cannot.
 */
function sniffFileType(filePath: string): 'jpeg' | 'png' | 'gif' | 'webp' | 'bmp' | 'pdf' | null {
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(16);
    const read = fs.readSync(fd, buf, 0, 16, 0);
    if (read < 4) return null;
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
    if (
      buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
      buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
    )
      return 'png';
    const ascii4 = buf.toString('ascii', 0, 4);
    if (ascii4 === 'GIF8') return 'gif';
    if (ascii4 === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
    if (buf[0] === 0x42 && buf[1] === 0x4d) return 'bmp';
    if (ascii4 === '%PDF') return 'pdf';
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}

/**
 * Middleware to run immediately after `upload.array('files')` / `upload.single`.
 * Confirms every stored file's real content is an allowed image/PDF; on any
 * mismatch it deletes ALL files from the request and rejects with 400, so no
 * disguised executable is ever persisted or exposed for download.
 */
export function verifyUploadedFiles(req: Request, _res: Response, next: NextFunction): void {
  const files = [
    ...((req.files as Express.Multer.File[] | undefined) ?? []),
    ...(req.file ? [req.file] : []),
  ];
  if (files.length === 0) {
    next();
    return;
  }
  const bad = files.find((f) => sniffFileType(f.path) === null);
  if (bad) {
    for (const f of files) fs.rm(f.path, { force: true }, () => undefined);
    next(badRequest(ALLOWED_MESSAGE));
    return;
  }
  next();
}

/**
 * Resolves a stored file path, guaranteeing it stays inside the uploads
 * directory. Storage keys are server-generated, but this guards against any
 * tampered value reaching the filesystem (path traversal).
 */
export function resolveUploadPath(storageKey: string): string {
  const resolved = path.resolve(uploadsDir, storageKey);
  if (resolved !== uploadsDir && !resolved.startsWith(uploadsDir + path.sep)) {
    throw new Error('Invalid storage key');
  }
  return resolved;
}
