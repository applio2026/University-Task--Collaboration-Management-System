import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * One-off migration: introduces the Workspace layer (University -> Workspace ->
 * Space -> Cluster -> Task). Every existing Space predates Workspace and has
 * workspaceId = null; this creates one "General" workspace per university and
 * attaches all of that university's orphaned spaces to it, so nothing existing
 * breaks once Space.workspaceId becomes required.
 *
 * Deliberately does NOT grant anyone WorkspaceMembership — existing users keep
 * exactly the access they had (via Space/Cluster membership, which still
 * cascades visibility up to the Workspace). Only a Super Admin can manage the
 * new "General" workspace unless explicitly given access later.
 */
async function main() {
  const universities = await prisma.university.findMany();
  let totalLinked = 0;

  for (const uni of universities) {
    const orphaned = await prisma.space.findMany({
      where: { universityId: uni.id, workspaceId: null },
      select: { id: true },
    });
    if (orphaned.length === 0) {
      console.log(`- ${uni.name}: no orphaned spaces, skipping.`);
      continue;
    }

    let workspace = await prisma.workspace.findFirst({
      where: { universityId: uni.id, name: 'General' },
    });
    if (!workspace) {
      workspace = await prisma.workspace.create({
        data: { universityId: uni.id, name: 'General', description: 'Auto-created during workspace migration.' },
      });
      console.log(`- ${uni.name}: created "General" workspace (${workspace.id}).`);
    }

    const result = await prisma.space.updateMany({
      where: { id: { in: orphaned.map((s) => s.id) } },
      data: { workspaceId: workspace.id },
    });
    totalLinked += result.count;
    console.log(`- ${uni.name}: linked ${result.count} space(s) to "General".`);
  }

  const stillOrphaned = await prisma.space.count({ where: { workspaceId: null } });
  console.log(`\nTotal spaces linked: ${totalLinked}. Remaining unlinked: ${stillOrphaned}.`);
  if (stillOrphaned > 0) {
    throw new Error(`${stillOrphaned} space(s) still have no workspaceId — investigate before making the column required.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
