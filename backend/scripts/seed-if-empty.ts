import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

/**
 * Guards prisma/seed.ts, which unconditionally WIPES every core table before
 * reseeding. That's correct for a one-off "reset my dev database" command, but
 * docker-compose's backend `command` used to run `npm run seed` on every
 * container start — meaning every restart (deploy, crash, `restart:
 * unless-stopped` recovering from a host reboot, etc.) silently erased all
 * real production data back to just the Super Admin account.
 *
 * This only seeds when the database is genuinely empty (no University row
 * yet), which is true exactly once: the very first boot against a fresh
 * database. Every subsequent restart leaves existing data untouched.
 */
async function main() {
  const prisma = new PrismaClient();
  let count: number;
  try {
    count = await prisma.university.count();
  } finally {
    await prisma.$disconnect();
  }

  if (count > 0) {
    console.log('[seed-if-empty] Database already has data — skipping seed.');
    return;
  }

  console.log('[seed-if-empty] Database is empty — running initial seed.');
  const result = spawnSync('npx', ['tsx', 'prisma/seed.ts'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(`seed failed with exit code ${result.status}`);
  }
}

main().catch((err) => {
  console.error('[seed-if-empty] Failed:', err);
  process.exit(1);
});
