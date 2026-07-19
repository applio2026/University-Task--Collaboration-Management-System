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
export const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.pdf', '.txt']);
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'application/pdf',
  'text/plain',
]);

const ALLOWED_MESSAGE =
  'Only image files (JPEG, PNG, GIF, WebP, BMP), PDF documents, or plain-text (.txt) files can be uploaded.';
const UNSAFE_TEXT_MESSAGE =
  'This .txt file was rejected: it must be plain text with no executable or script code (e.g. a shebang, batch/PowerShell/PHP/HTML script, or binary content).';

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
 * Inspects a .txt upload's real content. A plain-text note is fine; an executable
 * or script disguised as text is not. Returns an error message if unsafe, else null.
 * Heuristics: reject binaries (NUL bytes / a high ratio of control bytes) and files
 * carrying obvious executable-code markers (Unix shebang, PE/ELF headers, PHP/HTML
 * script tags). Files are downloaded as attachments, so this is defence-in-depth.
 */
function inspectTextFile(filePath: string): string | null {
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const size = Math.min(fs.fstatSync(fd).size, 512 * 1024); // scan up to 512 KB
    const buf = Buffer.alloc(size);
    const read = fs.readSync(fd, buf, 0, size, 0);
    const data = buf.subarray(0, read);

    // 1) Must be genuine text: no NUL bytes, and control characters (other than
    // tab / LF / CR) must be rare — binaries and executables fail this.
    let control = 0;
    for (const b of data) {
      if (b === 0) return UNSAFE_TEXT_MESSAGE;
      if (b === 0x7f || (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d)) control += 1;
    }
    if (data.length > 0 && control / data.length > 0.05) return UNSAFE_TEXT_MESSAGE;

    // 2) Reject obvious executable / script content.
    if (data[0] === 0x23 && data[1] === 0x21) return UNSAFE_TEXT_MESSAGE; // "#!" shebang
    if (data[0] === 0x4d && data[1] === 0x5a) return UNSAFE_TEXT_MESSAGE; // "MZ" PE header
    if (data[0] === 0x7f && data.subarray(1, 4).toString('latin1') === 'ELF') return UNSAFE_TEXT_MESSAGE;
    const lower = data.toString('latin1').toLowerCase();
    if (lower.includes('<?php') || lower.includes('<script')) return UNSAFE_TEXT_MESSAGE;

    return null;
  } catch {
    return UNSAFE_TEXT_MESSAGE;
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}

/**
 * Middleware to run immediately after `upload.array('files')` / `upload.single`.
 * Confirms every stored file's real content matches an allowed type — images/PDF
 * by magic bytes, and .txt as safe plain text (no embedded executable/script code).
 * On any mismatch it deletes ALL files from the request and rejects with 400, so
 * nothing disguised is ever persisted or exposed for download.
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
  const reject = (message: string) => {
    for (const f of files) fs.rm(f.path, { force: true }, () => undefined);
    next(badRequest(message));
  };
  for (const f of files) {
    const ext = path.extname(f.originalname).toLowerCase();
    if (ext === '.txt') {
      const problem = inspectTextFile(f.path);
      if (problem) {
        reject(problem);
        return;
      }
    } else if (sniffFileType(f.path) === null) {
      reject(ALLOWED_MESSAGE);
      return;
    }
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
