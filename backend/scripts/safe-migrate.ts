import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

/**
 * Replaces a bare `prisma db push` for this project. A plain db push cannot
 * safely add `Space.workspaceId` (required, FK to Workspace, defaulting to the
 * "test-1" row) to a database that:
 *   - already has Space rows and has never seen the Workspace table before
 *     (the FK is added in the same pass as the column, before any Workspace
 *     row exists — including "test-1" — so Postgres rejects it), or
 *   - simply doesn't have a "test-1" workspace for any other reason.
 *
 * This script makes the same change in three safe passes instead:
 *   1. Push a patched schema where Space.workspaceId is nullable and
 *      default-free — always safe, existing rows just get NULL.
 *   2. Backfill: ensure at least one University + Workspace exists, then set
 *      workspaceId on every Space row that's still NULL (raw SQL, so it works
 *      regardless of what the currently-generated Prisma Client's types say).
 *   3. Push the real schema.prisma (workspaceId required + FK) — safe now,
 *      every row already has a valid value.
 *
 * Idempotent: re-running this against an already-migrated database is a no-op
 * at every step.
 */

const prismaDir = path.resolve(__dirname, '..', 'prisma');
const schemaPath = path.join(prismaDir, 'schema.prisma');
const tempSchemaPath = path.join(prismaDir, 'schema.safe-migrate-temp.prisma');

function run(cmd: string, args: string[]) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} exited with code ${result.status}`);
  }
}

async function main() {
  const original = fs.readFileSync(schemaPath, 'utf8');

  // Only Space.workspaceId has this exact shape (required + a literal default
  // pointing at a specific row); WorkspaceMembership.workspaceId is required
  // with no default, which is fine because that table is new. Prisma also
  // requires the relation field itself (the very next line) to be optional
  // whenever its scalar FK field is optional, so both lines are patched
  // together — scoped to ONLY the `model Space { ... }` block, since
  // WorkspaceMembership has an identically-shaped `workspace Workspace
  // @relation(fields: [workspaceId] ...)` line that must NOT be touched.
  const fieldPattern = /workspaceId(\s+)String(\s*)@default\("test-1"\)/;
  const relationPattern = /workspace(\s+)Workspace(\s+)@relation\(fields: \[workspaceId\]/;
  const spaceBlockPattern = /model Space \{[\s\S]*?\n\}/;

  const spaceBlockMatch = original.match(spaceBlockPattern);
  if (!spaceBlockMatch || !fieldPattern.test(spaceBlockMatch[0])) {
    // Schema no longer has the risky default (or was already migrated past
    // this point) — a plain db push is safe on its own.
    console.log('[safe-migrate] No risky default found in schema; running a plain db push.');
    run('npx', ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss']);
    return;
  }

  const patchedSpaceBlock = spaceBlockMatch[0]
    .replace(fieldPattern, 'workspaceId$1String?')
    .replace(relationPattern, 'workspace$1Workspace?$2@relation(fields: [workspaceId]');
  const patched = original.replace(spaceBlockPattern, patchedSpaceBlock);
  fs.writeFileSync(tempSchemaPath, patched);

  try {
    console.log('[safe-migrate] Step 1/3: pushing nullable workspaceId (always safe)…');
    run('npx', ['prisma', 'db', 'push', '--schema', tempSchemaPath, '--skip-generate', '--accept-data-loss']);

    console.log('[safe-migrate] Step 2/3: backfilling default workspace(s)…');
    const prisma = new PrismaClient();
    try {
      const universities = await prisma.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM "University"`);
      for (const uni of universities) {
        const existing = await prisma.$queryRawUnsafe<{ id: string }[]>(
          `SELECT id FROM "Workspace" WHERE "universityId" = $1 LIMIT 1`,
          uni.id,
        );
        let workspaceId = existing[0]?.id;
        if (!workspaceId) {
          const created = await prisma.$queryRawUnsafe<{ id: string }[]>(
            `INSERT INTO "Workspace" (id, "universityId", name, description, color, "isArchived", "createdAt", "updatedAt")
             VALUES (gen_random_uuid()::text, $1, 'General', 'Auto-created during migration.', '#334155', false, now(), now())
             RETURNING id`,
            uni.id,
          );
          workspaceId = created[0].id;
          console.log(`[safe-migrate]   created fallback workspace ${workspaceId} for university ${uni.id}`);
        }
        const updated = await prisma.$executeRawUnsafe(
          `UPDATE "Space" SET "workspaceId" = $1 WHERE "universityId" = $2 AND "workspaceId" IS NULL`,
          workspaceId,
          uni.id,
        );
        if (updated > 0) console.log(`[safe-migrate]   linked ${updated} space(s) in university ${uni.id}`);
      }

      const stillNull = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT count(*)::bigint AS count FROM "Space" WHERE "workspaceId" IS NULL`,
      );
      if (Number(stillNull[0].count) > 0) {
        throw new Error(`${stillNull[0].count} Space row(s) still have no workspaceId after backfill.`);
      }
    } finally {
      await prisma.$disconnect();
    }

    console.log('[safe-migrate] Step 3/3: pushing the real schema (workspaceId required + FK)…');
    run('npx', ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss']);

    console.log('[safe-migrate] Done.');
  } finally {
    fs.rmSync(tempSchemaPath, { force: true });
  }
}

main().catch((err) => {
  console.error('[safe-migrate] Failed:', err);
  process.exit(1);
});
