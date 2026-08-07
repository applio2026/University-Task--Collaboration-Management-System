import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Prisma client the rbac module depends on.
vi.mock('../lib/prisma', () => ({
  prisma: {
    workspaceMembership: { findUnique: vi.fn(), findFirst: vi.fn() },
    spaceMembership: { findUnique: vi.fn(), findFirst: vi.fn() },
    clusterMembership: { findUnique: vi.fn(), findFirst: vi.fn() },
    space: { findUnique: vi.fn() },
    cluster: { findUnique: vi.fn() },
  },
}));

import { prisma } from '../lib/prisma';
import {
  isSuperAdmin,
  hasGlobalContentAccess,
  requireSuperAdmin,
  requireContentAdmin,
  getWorkspaceRole,
  canAccessWorkspace,
  getSpaceRole,
  getClusterRole,
  requireWorkspaceAccess,
  requireWorkspaceRole,
  requireSpaceRole,
  requireClusterRole,
} from './rbac';
import { AppError } from '../lib/errors';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p = prisma as any;

beforeEach(() => vi.clearAllMocks());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function req(user?: any, params: any = {}, body: any = {}): any {
  return { user, params, body };
}

/** Run an asyncHandler-wrapped middleware and return whether next() got an error. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runAsyncMw(mw: any, r: any): Promise<{ ok: boolean; err?: unknown }> {
  const next = vi.fn();
  mw(r, {}, next);
  await new Promise((res) => setTimeout(res, 0)); // flush the promise chain
  const err = next.mock.calls[0]?.[0];
  return { ok: next.mock.calls.length > 0 && err === undefined, err };
}

describe('role helpers', () => {
  it('isSuperAdmin only for SUPER_ADMIN', () => {
    expect(isSuperAdmin(req({ systemRole: 'SUPER_ADMIN' }))).toBe(true);
    expect(isSuperAdmin(req({ systemRole: 'ADMIN' }))).toBe(false);
    expect(isSuperAdmin(req())).toBe(false);
  });

  it('hasGlobalContentAccess for SUPER_ADMIN and ADMIN only', () => {
    expect(hasGlobalContentAccess('SUPER_ADMIN')).toBe(true);
    expect(hasGlobalContentAccess('ADMIN')).toBe(true);
    expect(hasGlobalContentAccess('USER')).toBe(false);
    expect(hasGlobalContentAccess(undefined)).toBe(false);
  });

  it('requireSuperAdmin allows super admin, blocks admin/user/none', () => {
    const next = vi.fn();
    requireSuperAdmin(req({ systemRole: 'SUPER_ADMIN' }), {} as never, next);
    expect(next).toHaveBeenCalledOnce();
    expect(() => requireSuperAdmin(req({ systemRole: 'ADMIN' }), {} as never, vi.fn())).toThrow(AppError);
    expect(() => requireSuperAdmin(req({ systemRole: 'USER' }), {} as never, vi.fn())).toThrow(AppError);
    expect(() => requireSuperAdmin(req(), {} as never, vi.fn())).toThrow(AppError);
  });

  it('requireContentAdmin allows super admin and admin, blocks user/none', () => {
    const n1 = vi.fn();
    requireContentAdmin(req({ systemRole: 'SUPER_ADMIN' }), {} as never, n1);
    expect(n1).toHaveBeenCalledOnce();
    const n2 = vi.fn();
    requireContentAdmin(req({ systemRole: 'ADMIN' }), {} as never, n2);
    expect(n2).toHaveBeenCalledOnce();
    expect(() => requireContentAdmin(req({ systemRole: 'USER' }), {} as never, vi.fn())).toThrow(AppError);
    expect(() => requireContentAdmin(req(), {} as never, vi.fn())).toThrow(AppError);
  });
});

describe('getWorkspaceRole', () => {
  it('short-circuits to WORKSPACE_ADMIN for super admin and admin', async () => {
    expect(await getWorkspaceRole('u', 'w', 'SUPER_ADMIN')).toBe('WORKSPACE_ADMIN');
    expect(await getWorkspaceRole('u', 'w', 'ADMIN')).toBe('WORKSPACE_ADMIN');
    expect(p.workspaceMembership.findUnique).not.toHaveBeenCalled();
  });
  it('returns the membership role for a normal user', async () => {
    p.workspaceMembership.findUnique.mockResolvedValue({ role: 'MEMBER' });
    expect(await getWorkspaceRole('u', 'w', 'USER')).toBe('MEMBER');
  });
  it('returns null when there is no membership', async () => {
    p.workspaceMembership.findUnique.mockResolvedValue(null);
    expect(await getWorkspaceRole('u', 'w', 'USER')).toBeNull();
  });
});

describe('canAccessWorkspace', () => {
  it('admin/super => true', async () => {
    expect(await canAccessWorkspace('u', 'w', 'ADMIN')).toBe(true);
  });
  it('true via direct workspace membership', async () => {
    p.workspaceMembership.findUnique.mockResolvedValue({ role: 'MEMBER' });
    expect(await canAccessWorkspace('u', 'w', 'USER')).toBe(true);
  });
  it('true via a space membership', async () => {
    p.workspaceMembership.findUnique.mockResolvedValue(null);
    p.spaceMembership.findFirst.mockResolvedValue({ id: 's' });
    expect(await canAccessWorkspace('u', 'w', 'USER')).toBe(true);
  });
  it('true via a cluster membership', async () => {
    p.workspaceMembership.findUnique.mockResolvedValue(null);
    p.spaceMembership.findFirst.mockResolvedValue(null);
    p.clusterMembership.findFirst.mockResolvedValue({ id: 'c' });
    expect(await canAccessWorkspace('u', 'w', 'USER')).toBe(true);
  });
  it('false with no access anywhere', async () => {
    p.workspaceMembership.findUnique.mockResolvedValue(null);
    p.spaceMembership.findFirst.mockResolvedValue(null);
    p.clusterMembership.findFirst.mockResolvedValue(null);
    expect(await canAccessWorkspace('u', 'w', 'USER')).toBe(false);
  });
});

describe('getSpaceRole', () => {
  it('admin/super => SPACE_ADMIN', async () => {
    expect(await getSpaceRole('u', 's', 'ADMIN')).toBe('SPACE_ADMIN');
  });
  it('null when the space does not exist', async () => {
    p.space.findUnique.mockResolvedValue(null);
    expect(await getSpaceRole('u', 's', 'USER')).toBeNull();
  });
  it('SPACE_ADMIN cascading from a workspace admin', async () => {
    p.space.findUnique.mockResolvedValue({ workspaceId: 'w' });
    p.workspaceMembership.findUnique.mockResolvedValue({ role: 'WORKSPACE_ADMIN' });
    expect(await getSpaceRole('u', 's', 'USER')).toBe('SPACE_ADMIN');
  });
  it('returns the direct space membership role otherwise', async () => {
    p.space.findUnique.mockResolvedValue({ workspaceId: 'w' });
    p.workspaceMembership.findUnique.mockResolvedValue(null);
    p.spaceMembership.findUnique.mockResolvedValue({ role: 'MEMBER' });
    expect(await getSpaceRole('u', 's', 'USER')).toBe('MEMBER');
  });
  it('null when there is no space membership', async () => {
    p.space.findUnique.mockResolvedValue({ workspaceId: 'w' });
    p.workspaceMembership.findUnique.mockResolvedValue(null);
    p.spaceMembership.findUnique.mockResolvedValue(null);
    expect(await getSpaceRole('u', 's', 'USER')).toBeNull();
  });
});

describe('getClusterRole', () => {
  it('admin/super => CLUSTER_ADMIN', async () => {
    expect(await getClusterRole('u', 'c', 'SUPER_ADMIN')).toBe('CLUSTER_ADMIN');
  });
  it('null when the cluster does not exist', async () => {
    p.cluster.findUnique.mockResolvedValue(null);
    expect(await getClusterRole('u', 'c', 'USER')).toBeNull();
  });
  it('CLUSTER_ADMIN cascading from a space admin', async () => {
    p.cluster.findUnique.mockResolvedValue({ spaceId: 's' });
    p.space.findUnique.mockResolvedValue({ workspaceId: 'w' });
    p.workspaceMembership.findUnique.mockResolvedValue({ role: 'WORKSPACE_ADMIN' });
    expect(await getClusterRole('u', 'c', 'USER')).toBe('CLUSTER_ADMIN');
  });
  it('returns the direct cluster membership role otherwise', async () => {
    p.cluster.findUnique.mockResolvedValue({ spaceId: 's' });
    p.space.findUnique.mockResolvedValue({ workspaceId: 'w' });
    p.workspaceMembership.findUnique.mockResolvedValue(null);
    p.spaceMembership.findUnique.mockResolvedValue(null);
    p.clusterMembership.findUnique.mockResolvedValue({ role: 'STUDENT' });
    expect(await getClusterRole('u', 'c', 'USER')).toBe('STUDENT');
  });
  it('null when there is no cluster membership', async () => {
    p.cluster.findUnique.mockResolvedValue({ spaceId: 's' });
    p.space.findUnique.mockResolvedValue({ workspaceId: 'w' });
    p.workspaceMembership.findUnique.mockResolvedValue(null);
    p.spaceMembership.findUnique.mockResolvedValue(null);
    p.clusterMembership.findUnique.mockResolvedValue(null);
    expect(await getClusterRole('u', 'c', 'USER')).toBeNull();
  });
});

describe('require*Access / require*Role middleware', () => {
  it('requireWorkspaceAccess: next() for admin', async () => {
    const r = await runAsyncMw(requireWorkspaceAccess(), req({ id: 'u', systemRole: 'ADMIN' }, { workspaceId: 'w' }));
    expect(r.ok).toBe(true);
  });
  it('requireWorkspaceAccess: 404 when no access', async () => {
    p.workspaceMembership.findUnique.mockResolvedValue(null);
    p.spaceMembership.findFirst.mockResolvedValue(null);
    p.clusterMembership.findFirst.mockResolvedValue(null);
    const r = await runAsyncMw(requireWorkspaceAccess(), req({ id: 'u', systemRole: 'USER' }, { workspaceId: 'w' }));
    expect(r.err).toBeInstanceOf(AppError);
  });
  it('requireWorkspaceAccess: errors without a user', async () => {
    const r = await runAsyncMw(requireWorkspaceAccess(), req(undefined, { workspaceId: 'w' }));
    expect(r.err).toBeInstanceOf(AppError);
  });

  it('requireWorkspaceRole: passes for an admin (effective WORKSPACE_ADMIN)', async () => {
    const r = await runAsyncMw(requireWorkspaceRole('MEMBER' as never), req({ id: 'u', systemRole: 'ADMIN' }, { workspaceId: 'w' }));
    expect(r.ok).toBe(true);
  });
  it('requireWorkspaceRole: reads workspaceId from body too', async () => {
    const r = await runAsyncMw(requireWorkspaceRole('MEMBER' as never), req({ id: 'u', systemRole: 'ADMIN' }, {}, { workspaceId: 'w' }));
    expect(r.ok).toBe(true);
  });
  it('requireWorkspaceRole: forbidden when role too low', async () => {
    p.workspaceMembership.findUnique.mockResolvedValue(null);
    const r = await runAsyncMw(requireWorkspaceRole('MEMBER' as never), req({ id: 'u', systemRole: 'USER' }, { workspaceId: 'w' }));
    expect(r.err).toBeInstanceOf(AppError);
  });
  it('requireWorkspaceRole: forbidden without workspace context', async () => {
    const r = await runAsyncMw(requireWorkspaceRole('MEMBER' as never), req({ id: 'u', systemRole: 'USER' }, {}));
    expect(r.err).toBeInstanceOf(AppError);
  });

  it('requireSpaceRole: passes for an admin', async () => {
    const r = await runAsyncMw(requireSpaceRole('MEMBER' as never), req({ id: 'u', systemRole: 'ADMIN' }, { spaceId: 's' }));
    expect(r.ok).toBe(true);
  });
  it('requireSpaceRole: forbidden when insufficient', async () => {
    p.space.findUnique.mockResolvedValue({ workspaceId: 'w' });
    p.workspaceMembership.findUnique.mockResolvedValue(null);
    p.spaceMembership.findUnique.mockResolvedValue(null);
    const r = await runAsyncMw(requireSpaceRole('SPACE_ADMIN' as never), req({ id: 'u', systemRole: 'USER' }, { spaceId: 's' }));
    expect(r.err).toBeInstanceOf(AppError);
  });

  it('requireClusterRole: passes for an admin', async () => {
    const r = await runAsyncMw(requireClusterRole('STUDENT' as never), req({ id: 'u', systemRole: 'ADMIN' }, { clusterId: 'c' }));
    expect(r.ok).toBe(true);
  });
  it('requireClusterRole: forbidden when role too low', async () => {
    p.cluster.findUnique.mockResolvedValue({ spaceId: 's' });
    p.space.findUnique.mockResolvedValue({ workspaceId: 'w' });
    p.workspaceMembership.findUnique.mockResolvedValue(null);
    p.spaceMembership.findUnique.mockResolvedValue(null);
    p.clusterMembership.findUnique.mockResolvedValue({ role: 'STUDENT' });
    const r = await runAsyncMw(requireClusterRole('CLUSTER_ADMIN' as never), req({ id: 'u', systemRole: 'USER' }, { clusterId: 'c' }));
    expect(r.err).toBeInstanceOf(AppError);
  });
});

describe('middleware context guards (branch coverage)', () => {
  it('requireWorkspaceAccess: forbidden when workspaceId is missing', async () => {
    const r = await runAsyncMw(requireWorkspaceAccess(), req({ id: 'u', systemRole: 'USER' }, {}));
    expect(r.err).toBeInstanceOf(AppError);
  });
  it('requireSpaceRole: reads spaceId from body', async () => {
    const r = await runAsyncMw(requireSpaceRole('MEMBER' as never), req({ id: 'u', systemRole: 'ADMIN' }, {}, { spaceId: 's' }));
    expect(r.ok).toBe(true);
  });
  it('requireSpaceRole: forbidden without space context', async () => {
    const r = await runAsyncMw(requireSpaceRole('MEMBER' as never), req({ id: 'u', systemRole: 'USER' }, {}));
    expect(r.err).toBeInstanceOf(AppError);
  });
  it('requireSpaceRole: errors without a user', async () => {
    const r = await runAsyncMw(requireSpaceRole('MEMBER' as never), req(undefined, { spaceId: 's' }));
    expect(r.err).toBeInstanceOf(AppError);
  });
  it('requireClusterRole: reads clusterId from body', async () => {
    const r = await runAsyncMw(requireClusterRole('STUDENT' as never), req({ id: 'u', systemRole: 'ADMIN' }, {}, { clusterId: 'c' }));
    expect(r.ok).toBe(true);
  });
  it('requireClusterRole: forbidden without cluster context', async () => {
    const r = await runAsyncMw(requireClusterRole('STUDENT' as never), req({ id: 'u', systemRole: 'USER' }, {}));
    expect(r.err).toBeInstanceOf(AppError);
  });
  it('requireClusterRole: errors without a user', async () => {
    const r = await runAsyncMw(requireClusterRole('STUDENT' as never), req(undefined, { clusterId: 'c' }));
    expect(r.err).toBeInstanceOf(AppError);
  });
});
