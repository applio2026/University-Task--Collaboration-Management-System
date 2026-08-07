import { Prisma, WorkspaceRole } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';
import { archiveSpace } from '../spaces/spaces.service';

/** Workspaces the user can see: super admin => all; else workspaces where they
 *  have an explicit WorkspaceMembership, or a membership somewhere in a Space
 *  or Cluster that lives inside it (cascade-up, mirroring how Space visibility
 *  already cascades from Cluster membership). Anything else stays invisible. */
export async function listAccessibleWorkspaces(userId: string, systemRole: string) {
  if ((systemRole === 'SUPER_ADMIN' || systemRole === 'ADMIN')) {
    return prisma.workspace.findMany({
      where: { isArchived: false },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { spaces: true, memberships: true } } },
    });
  }

  const workspaceIds = new Set<string>();

  const direct = await prisma.workspaceMembership.findMany({
    where: { userId },
    select: { workspaceId: true },
  });
  direct.forEach((m) => workspaceIds.add(m.workspaceId));

  const viaSpace = await prisma.spaceMembership.findMany({
    where: { userId },
    select: { space: { select: { workspaceId: true } } },
  });
  viaSpace.forEach((m) => workspaceIds.add(m.space.workspaceId));

  const viaCluster = await prisma.clusterMembership.findMany({
    where: { userId },
    select: { cluster: { select: { space: { select: { workspaceId: true } } } } },
  });
  viaCluster.forEach((m) => workspaceIds.add(m.cluster.space.workspaceId));

  return prisma.workspace.findMany({
    where: { id: { in: [...workspaceIds] }, isArchived: false },
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { spaces: true, memberships: true } } },
  });
}

export async function getWorkspace(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      memberships: { include: { user: { select: { id: true, fullName: true, email: true, avatarColor: true } } } },
      _count: { select: { spaces: true } },
    },
  });
  if (!workspace) throw notFound('Workspace not found');
  return workspace;
}

export async function createWorkspace(input: { name: string; description?: string; color?: string; universityId?: string }) {
  const university = input.universityId
    ? await prisma.university.findUnique({ where: { id: input.universityId } })
    : await prisma.university.findFirst();
  if (!university) throw notFound('University not found');

  return prisma.workspace.create({
    data: {
      name: input.name,
      description: input.description,
      color: input.color ?? '#334155',
      universityId: university.id,
    },
  });
}

export async function updateWorkspace(workspaceId: string, data: Prisma.WorkspaceUpdateInput) {
  return prisma.workspace.update({ where: { id: workspaceId }, data });
}

/** Archives a workspace along with every space (and their clusters/tasks) inside it. */
export async function archiveWorkspace(workspaceId: string) {
  const spaceRows = await prisma.space.findMany({ where: { workspaceId }, select: { id: true } });
  for (const s of spaceRows) {
    await archiveSpace(s.id);
  }
  return prisma.workspace.update({ where: { id: workspaceId }, data: { isArchived: true } });
}

export async function restoreWorkspace(workspaceId: string) {
  return prisma.workspace.update({ where: { id: workspaceId }, data: { isArchived: false } });
}

export async function addMember(workspaceId: string, userId: string, role: WorkspaceRole) {
  return prisma.workspaceMembership.upsert({
    where: { workspaceId_userId: { workspaceId, userId } },
    update: { role },
    create: { workspaceId, userId, role },
  });
}

export async function removeMember(workspaceId: string, userId: string) {
  await prisma.workspaceMembership.deleteMany({ where: { workspaceId, userId } });
}

export async function listMembers(workspaceId: string) {
  return prisma.workspaceMembership.findMany({
    where: { workspaceId },
    include: { user: { select: { id: true, fullName: true, email: true, avatarColor: true } } },
    orderBy: { role: 'asc' },
  });
}
