import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Idempotent: creates the Workspace with id "test-1" if it doesn't exist yet.
 * Space.workspaceId defaults to "test-1" precisely so that adding the
 * workspaceId column to a database that already has Space rows doesn't fail
 * with Prisma's "required column without a default" migration error — but the
 * default is only meaningful if a workspace with that id actually exists.
 * Rename it from the app (Workspace page → ✎ Rename) once you've set up real
 * workspaces.
 */
async function main() {
  const existing = await prisma.workspace.findUnique({ where: { id: 'test-1' } });
  if (existing) {
    console.log('Workspace "test-1" already exists — nothing to do.');
    return;
  }

  const university = await prisma.university.findFirst();
  if (!university) {
    throw new Error('No university exists yet; seed the database first.');
  }

  await prisma.workspace.create({
    data: {
      id: 'test-1',
      universityId: university.id,
      name: 'test-1',
      description: 'Default fallback workspace — rename or replace this.',
    },
  });
  console.log('Created fallback workspace "test-1".');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
