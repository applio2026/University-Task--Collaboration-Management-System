import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PASSWORD = 'Password123!';

/**
 * Minimal seed: only the organization and the Super Admin are auto-generated.
 * Everything else — users, spaces, clusters, tasks — is created by the Super
 * Admin from within the app.
 */
async function main() {
  console.log('🌱 Seeding (Super Admin only)…');

  // Wipe core tables in dependency order so re-seeding is idempotent.
  await prisma.$transaction([
    prisma.fileAsset.deleteMany(),
    prisma.attachment.deleteMany(),
    prisma.grade.deleteMany(),
    prisma.submission.deleteMany(),
    prisma.comment.deleteMany(),
    prisma.subtask.deleteMany(),
    prisma.checklistItem.deleteMany(),
    prisma.taskAssignee.deleteMany(),
    prisma.taskDependency.deleteMany(),
    prisma.task.deleteMany(),
    prisma.announcement.deleteMany(),
    prisma.chatMessage.deleteMany(),
    prisma.clusterMembership.deleteMany(),
    prisma.cluster.deleteMany(),
    prisma.spaceMembership.deleteMany(),
    prisma.space.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.taskTemplate.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.user.deleteMany(),
    prisma.university.deleteMany(),
  ]);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const university = await prisma.university.create({
    data: { name: 'Eimple University', slug: 'eimple-university' },
  });

  await prisma.user.create({
    data: {
      universityId: university.id,
      email: 'superadmin@eimple.com',
      passwordHash,
      fullName: 'Super Admin',
      systemRole: 'SUPER_ADMIN',
      avatarColor: '#DC2626',
    },
  });

  console.log('✅ Seed complete.');
  console.log('\nLog in as the Super Admin and create everything else from there:');
  console.table([{ role: 'Super Admin', email: 'superadmin@eimple.com', password: PASSWORD }]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
