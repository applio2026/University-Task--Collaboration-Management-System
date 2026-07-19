import { Prisma, SpaceRole, WorkspaceRole } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';

const workspaceContext = { select: { id: true, name: true, color: true } } as const;

/** Spaces the user can see: super admin => all; else spaces where they are a
 *  member, or where they belong to any cluster. Every space the user can see
 *  here is, by construction, one whose parent workspace they already have
 *  access to (direct or cascaded) — so this can't leak a space from a
 *  workspace the user has no access to. */
export async function listAccessibleSpaces(userId: string, systemRole: string) {
  if (systemRole === 'SUPER_ADMIN') {
    return prisma.space.findMany({
      where: { isArchived: false },
      orderBy: { createdAt: 'asc' },
      include: { workspace: workspaceContext, _count: { select: { clusters: true, memberships: true } } },
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
    include: { workspace: workspaceContext, _count: { select: { clusters: true, memberships: true } } },
  });
}

/** Spaces within a specific workspace the user can see: an effective
 *  WORKSPACE_ADMIN (or super admin) sees every space in it; everyone else sees
 *  only spaces where they have direct or cluster-cascaded membership — mirrors
 *  listAccessibleSpaces, scoped to one workspace. */
export async function listSpacesForWorkspace(workspaceId: string, userId: string, systemRole: string) {
  const isPrivileged =
    systemRole === 'SUPER_ADMIN' ||
    (await prisma.workspaceMembership.findFirst({
      where: { workspaceId, userId, role: WorkspaceRole.WORKSPACE_ADMIN },
    })) != null;

  if (isPrivileged) {
    return prisma.space.findMany({
      where: { workspaceId, isArchived: false },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { clusters: true, memberships: true } } },
    });
  }

  const clusterSpaceIds = await prisma.clusterMembership.findMany({
    where: { userId, cluster: { space: { workspaceId } } },
    select: { cluster: { select: { spaceId: true } } },
  });
  const spaceIds = new Set(clusterSpaceIds.map((c) => c.cluster.spaceId));

  const memberSpaces = await prisma.spaceMembership.findMany({
    where: { userId, space: { workspaceId } },
    select: { spaceId: true },
  });
  memberSpaces.forEach((m) => spaceIds.add(m.spaceId));

  return prisma.space.findMany({
    where: { id: { in: [...spaceIds] }, workspaceId, isArchived: false },
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { clusters: true, memberships: true } } },
  });
}

export async function getSpace(spaceId: string) {
  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    include: {
      workspace: workspaceContext,
      memberships: { include: { user: { select: { id: true, fullName: true, email: true, avatarColor: true } } } },
      _count: { select: { clusters: true } },
    },
  });
  if (!space) throw notFound('Space not found');
  return space;
}

export async function createSpace(input: {
  workspaceId: string;
  name: string;
  description?: string;
  color?: string;
}) {
  const workspace = await prisma.workspace.findUnique({ where: { id: input.workspaceId } });
  if (!workspace) throw notFound('Workspace not found');

  return prisma.space.create({
    data: {
      workspaceId: workspace.id,
      universityId: workspace.universityId,
      name: input.name,
      description: input.description,
      color: input.color ?? '#0F766E',
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
