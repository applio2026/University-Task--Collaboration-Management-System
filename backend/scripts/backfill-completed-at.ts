import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * One-off migration: `completedAt` is new and drives the 15-day auto-archive
 * sweep. Tasks that were already COMPLETED before this field existed have no
 * way to know exactly when that happened, so this backfills completedAt from
 * updatedAt as the best available proxy (a completed task sitting untouched
 * has its updatedAt roughly at completion time). Without this, pre-existing
 * completed tasks would never become eligible for auto-archiving.
 */
async function main() {
  // updateMany can't copy one column's value into another per-row, so this
  // goes row-by-row (the table is small enough that this is fine as a one-off).
  const stale = await prisma.task.findMany({
    where: { status: 'COMPLETED', completedAt: null },
    select: { id: true, updatedAt: true },
  });
  for (const t of stale) {
    await prisma.task.update({ where: { id: t.id }, data: { completedAt: t.updatedAt } });
  }
  console.log(`Backfilled completedAt for ${stale.length} already-completed task(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
