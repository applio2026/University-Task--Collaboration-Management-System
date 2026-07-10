import { NextFunction, Request, Response } from 'express';
import { ClusterRole, SpaceRole } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { forbidden, unauthorized } from '../lib/errors';
import { asyncHandler } from '../lib/asyncHandler';

/**
 * Access resolution rules:
 *  - SUPER_ADMIN  -> full access everywhere.
 *  - SPACE_ADMIN  -> full control within their Space (and all its Clusters).
 *  - CLUSTER_ADMIN (Faculty) / TEACHING_ASSISTANT / STUDENT -> scoped to Cluster.
 * A user's cluster access can also be inherited from being SPACE_ADMIN of the
 * parent space.
 */

export function isSuperAdmin(req: Request): boolean {
  return req.user?.systemRole === 'SUPER_ADMIN';
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) throw unauthorized();
  if (!isSuperAdmin(req)) throw forbidden('Super admin only');
  next();
}

/** Returns the user's SpaceRole for a space, or null if none (super admin => SPACE_ADMIN). */
export async function getSpaceRole(userId: string, spaceId: string, systemRole?: string): Promise<SpaceRole | null> {
  if (systemRole === 'SUPER_ADMIN') return SpaceRole.SPACE_ADMIN;
  const m = await prisma.spaceMembership.findUnique({
    where: { spaceId_userId: { spaceId, userId } },
  });
  return m?.role ?? null;
}

/** Returns the user's effective ClusterRole. Space admins act as CLUSTER_ADMIN. */
export async function getClusterRole(
  userId: string,
  clusterId: string,
  systemRole?: string,
): Promise<ClusterRole | null> {
  if (systemRole === 'SUPER_ADMIN') return ClusterRole.CLUSTER_ADMIN;

  const cluster = await prisma.cluster.findUnique({
    where: { id: clusterId },
    select: { spaceId: true },
  });
  if (!cluster) return null;

  const spaceRole = await getSpaceRole(userId, cluster.spaceId, systemRole);
  if (spaceRole === SpaceRole.SPACE_ADMIN) return ClusterRole.CLUSTER_ADMIN;

  const m = await prisma.clusterMembership.findUnique({
    where: { clusterId_userId: { clusterId, userId } },
  });
  return m?.role ?? null;
}

const spaceRank: Record<SpaceRole, number> = { MEMBER: 1, SPACE_ADMIN: 2 };
const clusterRank: Record<ClusterRole, number> = {
  STUDENT: 1,
  TEACHING_ASSISTANT: 2,
  CLUSTER_ADMIN: 3,
};

/** Express middleware factory: require at least `min` role in :spaceId route param. */
export function requireSpaceRole(min: SpaceRole) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) throw unauthorized();
    const spaceId = req.params.spaceId ?? req.body.spaceId;
    if (!spaceId) throw forbidden('Space context required');
    const role = await getSpaceRole(req.user.id, spaceId, req.user.systemRole);
    if (!role || spaceRank[role] < spaceRank[min]) throw forbidden();
    next();
  });
}

/** Express middleware factory: require at least `min` role in :clusterId route param. */
export function requireClusterRole(min: ClusterRole) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) throw unauthorized();
    const clusterId = req.params.clusterId ?? req.body.clusterId;
    if (!clusterId) throw forbidden('Cluster context required');
    const role = await getClusterRole(req.user.id, clusterId, req.user.systemRole);
    if (!role || clusterRank[role] < clusterRank[min]) throw forbidden();
    next();
  });
}
