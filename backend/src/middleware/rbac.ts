import { NextFunction, Request, Response } from 'express';
import { ClusterRole, SpaceRole, WorkspaceRole } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { forbidden, notFound, unauthorized } from '../lib/errors';
import { asyncHandler } from '../lib/asyncHandler';

/**
 * Access resolution rules:
 *  - SUPER_ADMIN     -> full access everywhere.
 *  - WORKSPACE_ADMIN -> full control within their Workspace (and all its Spaces/Clusters).
 *  - SPACE_ADMIN     -> full control within their Space (and all its Clusters).
 *  - CLUSTER_ADMIN (Faculty) / TEACHING_ASSISTANT / STUDENT -> scoped to Cluster.
 * Authority cascades downward: a Workspace Admin acts as Space Admin in every
 * Space in their workspace, which in turn acts as Cluster Admin in every
 * Cluster in that space.
 */

export function isSuperAdmin(req: Request): boolean {
  return req.user?.systemRole === 'SUPER_ADMIN';
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) throw unauthorized();
  if (!isSuperAdmin(req)) throw forbidden('Super admin only');
  next();
}

/** Returns the user's WorkspaceRole for a workspace, or null if none (super admin => WORKSPACE_ADMIN). */
export async function getWorkspaceRole(
  userId: string,
  workspaceId: string,
  systemRole?: string,
): Promise<WorkspaceRole | null> {
  if (systemRole === 'SUPER_ADMIN') return WorkspaceRole.WORKSPACE_ADMIN;
  const m = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  return m?.role ?? null;
}

/**
 * Broader than getWorkspaceRole: true if the user can see the workspace at all,
 * either via an explicit WorkspaceMembership OR via membership somewhere in a
 * Space/Cluster that lives inside it (the same "cascade up" pattern spaces
 * already use for cluster-only members). This is what enforces "a workspace's
 * existence and contents are invisible to users without any access to it."
 */
export async function canAccessWorkspace(userId: string, workspaceId: string, systemRole?: string): Promise<boolean> {
  if (systemRole === 'SUPER_ADMIN') return true;
  const direct = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (direct) return true;
  const viaSpace = await prisma.spaceMembership.findFirst({ where: { userId, space: { workspaceId } } });
  if (viaSpace) return true;
  const viaCluster = await prisma.clusterMembership.findFirst({
    where: { userId, cluster: { space: { workspaceId } } },
  });
  return viaCluster != null;
}

/**
 * Express middleware: require the user to be able to see :workspaceId at all
 * (see canAccessWorkspace). Responds 404 rather than 403 on failure — a bare
 * "forbidden" would confirm the workspace exists to someone with zero access to
 * it, which defeats the point of workspace-level opacity.
 */
export function requireWorkspaceAccess() {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) throw unauthorized();
    const workspaceId = req.params.workspaceId;
    if (!workspaceId) throw forbidden('Workspace context required');
    const ok = await canAccessWorkspace(req.user.id, workspaceId, req.user.systemRole);
    if (!ok) throw notFound('Workspace not found');
    next();
  });
}

/** Returns the user's SpaceRole for a space, or null if none. Cascades from an
 *  effective WORKSPACE_ADMIN of the parent workspace (super admin => SPACE_ADMIN). */
export async function getSpaceRole(userId: string, spaceId: string, systemRole?: string): Promise<SpaceRole | null> {
  if (systemRole === 'SUPER_ADMIN') return SpaceRole.SPACE_ADMIN;

  const space = await prisma.space.findUnique({ where: { id: spaceId }, select: { workspaceId: true } });
  if (!space) return null;

  const workspaceRole = await getWorkspaceRole(userId, space.workspaceId, systemRole);
  if (workspaceRole === WorkspaceRole.WORKSPACE_ADMIN) return SpaceRole.SPACE_ADMIN;

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

const workspaceRank: Record<WorkspaceRole, number> = { MEMBER: 1, WORKSPACE_ADMIN: 2 };
const spaceRank: Record<SpaceRole, number> = { MEMBER: 1, SPACE_ADMIN: 2 };
const clusterRank: Record<ClusterRole, number> = {
  STUDENT: 1,
  TEACHING_ASSISTANT: 2,
  CLUSTER_ADMIN: 3,
};

/** Express middleware factory: require at least `min` role in :workspaceId route param.
 *  Stricter than requireWorkspaceAccess — requires an actual WorkspaceMembership
 *  row (or super admin), used for workspace-admin actions (rename, add members,
 *  create a space in it), not just read visibility. */
export function requireWorkspaceRole(min: WorkspaceRole) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) throw unauthorized();
    const workspaceId = req.params.workspaceId ?? req.body.workspaceId;
    if (!workspaceId) throw forbidden('Workspace context required');
    const role = await getWorkspaceRole(req.user.id, workspaceId, req.user.systemRole);
    if (!role || workspaceRank[role] < workspaceRank[min]) throw forbidden();
    next();
  });
}

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
