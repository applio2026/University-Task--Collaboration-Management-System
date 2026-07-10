import { Prisma, SpaceRole } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';

/** Spaces the user can see: super admin => all; else spaces where they are a
 *  member, or where they belong to any cluster. */
export async function listAccessibleSpaces(userId: string, systemRole: string) {
  if (systemRole === 'SUPER_ADMIN') {
    return prisma.space.findMany({
      where: { isArchived: false },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { clusters: true, memberships: true } } },
    });
  }

  const clusterSpaceIds = await prisma.clusterMembership.findMany({
    where: { userId },
    select: { cluster: { select: { spaceId: true } } },
  });
  const spaceIds = new Set(clusterSpaceIds.map((c) => c.cluster.spaceId));

  const memberSpaces = await prisma.spaceMembership.findMany({
    where: { userId },
    select: { spaceId: true },
  });
  memberSpaces.forEach((m) => spaceIds.add(m.spaceId));

  return prisma.space.findMany({
    where: { id: { in: [...spaceIds] }, isArchived: false },
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { clusters: true, memberships: true } } },
  });
}

export async function getSpace(spaceId: string) {
  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    include: {
      memberships: { include: { user: { select: { id: true, fullName: true, email: true, avatarColor: true } } } },
      _count: { select: { clusters: true } },
    },
  });
  if (!space) throw notFound('Space not found');
  return space;
}

export async function createSpace(input: {
  name: string;
  description?: string;
  color?: string;
  universityId?: string;
}) {
  const university = input.universityId
    ? await prisma.university.findUnique({ where: { id: input.universityId } })
    : await prisma.university.findFirst();
  if (!university) throw notFound('University not found');

  return prisma.space.create({
    data: {
      name: input.name,
      description: input.description,
      color: input.color ?? '#0F766E',
      universityId: university.id,
    },
  });
}

export async function updateSpace(spaceId: string, data: Prisma.SpaceUpdateInput) {
  return prisma.space.update({ where: { id: spaceId }, data });
}

export async function archiveSpace(spaceId: string) {
  return prisma.space.update({ where: { id: spaceId }, data: { isArchived: true } });
}

export async function restoreSpace(spaceId: string) {
  return prisma.space.update({ where: { id: spaceId }, data: { isArchived: false } });
}

export async function addMember(spaceId: string, userId: string, role: SpaceRole) {
  return prisma.spaceMembership.upsert({
    where: { spaceId_userId: { spaceId, userId } },
    update: { role },
    create: { spaceId, userId, role },
  });
}

export async function removeMember(spaceId: string, userId: string) {
  await prisma.spaceMembership.deleteMany({ where: { spaceId, userId } });
}
