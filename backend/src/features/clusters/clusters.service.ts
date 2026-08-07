import { ClusterKind, ClusterRole, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';

export async function listClustersForSpace(spaceId: string, userId: string, systemRole: string) {
  const isPrivileged =
    (systemRole === 'SUPER_ADMIN' || systemRole === 'ADMIN') ||
    (await prisma.spaceMembership.findFirst({
      where: { spaceId, userId, role: 'SPACE_ADMIN' },
    })) != null;

  const where: Prisma.ClusterWhereInput = { spaceId, isArchived: false };
  if (!isPrivileged) {
    where.memberships = { some: { userId } };
  }

  return prisma.cluster.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    include: {
      _count: { select: { tasks: true, memberships: true, childClusters: true } },
    },
  });
}

export async function getCluster(clusterId: string) {
  const cluster = await prisma.cluster.findUnique({
    where: { id: clusterId },
    include: {
      space: { select: { id: true, name: true, color: true } },
      memberships: {
        include: { user: { select: { id: true, fullName: true, email: true, avatarColor: true } } },
      },
      _count: { select: { tasks: true } },
    },
  });
  if (!cluster) throw notFound('Cluster not found');
  return cluster;
}

export async function createCluster(input: {
  spaceId: string;
  name: string;
  description?: string;
  kind?: ClusterKind;
  color?: string;
  parentClusterId?: string;
  creatorId: string;
}) {
  const cluster = await prisma.cluster.create({
    data: {
      spaceId: input.spaceId,
      name: input.name,
      description: input.description,
      kind: input.kind ?? ClusterKind.GENERIC,
      color: input.color ?? '#2563EB',
      parentClusterId: input.parentClusterId,
      // Creator becomes the Cluster Admin (Faculty).
      memberships: {
        create: { userId: input.creatorId, role: ClusterRole.CLUSTER_ADMIN },
      },
    },
  });
  return cluster;
}

export async function updateCluster(clusterId: string, data: Prisma.ClusterUpdateInput) {
  return prisma.cluster.update({ where: { id: clusterId }, data });
}

/** Cluster ids for `clusterId` and every descendant (clusters self-nest via parentClusterId). */
async function collectClusterAndDescendants(clusterId: string): Promise<string[]> {
  const ids = [clusterId];
  const children = await prisma.cluster.findMany({ where: { parentClusterId: clusterId }, select: { id: true } });
  for (const c of children) {
    ids.push(...(await collectClusterAndDescendants(c.id)));
  }
  return ids;
}

/** Archives a cluster, every nested child cluster, and every task in all of them.
 *  Exported separately from archiveCluster so Space/Workspace archiving can
 *  reuse it without double-fetching the top cluster row. */
export async function archiveClusterTree(clusterId: string): Promise<void> {
  const ids = await collectClusterAndDescendants(clusterId);
  await prisma.task.updateMany({ where: { clusterId: { in: ids } }, data: { isArchived: true } });
  await prisma.cluster.updateMany({ where: { id: { in: ids } }, data: { isArchived: true } });
}

export async function archiveCluster(clusterId: string) {
  await archiveClusterTree(clusterId);
  return prisma.cluster.findUnique({ where: { id: clusterId } });
}

export async function restoreCluster(clusterId: string) {
  return prisma.cluster.update({ where: { id: clusterId }, data: { isArchived: false } });
}

export async function addMember(clusterId: string, userId: string, role: ClusterRole) {
  return prisma.clusterMembership.upsert({
    where: { clusterId_userId: { clusterId, userId } },
    update: { role },
    create: { clusterId, userId, role },
  });
}

export async function removeMember(clusterId: string, userId: string) {
  await prisma.clusterMembership.deleteMany({ where: { clusterId, userId } });
}

export async function listMembers(clusterId: string) {
  return prisma.clusterMembership.findMany({
    where: { clusterId },
    include: { user: { select: { id: true, fullName: true, email: true, avatarColor: true } } },
    orderBy: { role: 'asc' },
  });
}
