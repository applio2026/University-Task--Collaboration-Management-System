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

// Executable / script types that must never be stored, regardless of who
// uploads them. Files are always served as attachments, but hosting malware
// for other members to download is still a real risk.
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.msi', '.bat', '.cmd', '.com', '.scr', '.pif', '.cpl',
  '.ps1', '.psm1', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh',
  '.jar', '.dll', '.sys', '.hta', '.reg', '.lnk', '.apk', '.app', '.sh',
]);

/** Shared Multer instance: disk storage, 20 MB per file, up to 10 files. */
export const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXTENSIONS.has(ext)) {
      cb(badRequest(`Files of type "${ext}" are not allowed`));
      return;
    }
    cb(null, true);
  },
});

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
