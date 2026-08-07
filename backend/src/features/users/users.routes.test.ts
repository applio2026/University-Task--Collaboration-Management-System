import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Prisma } from '@prisma/client';

// Mock the Prisma client used by the router (and by writeAudit / rbac imports).
vi.mock('../../lib/prisma', () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    refreshToken: { updateMany: vi.fn() },
    university: { findFirst: vi.fn(), findUnique: vi.fn() },
    workspaceMembership: { findMany: vi.fn() },
    spaceMembership: { findMany: vi.fn() },
    clusterMembership: { findMany: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  },
}));

import { prisma } from '../../lib/prisma';
import usersRouter from './users.routes';
import { errorHandler } from '../../middleware/error';
import { signAccessToken } from '../../lib/jwt';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p = prisma as any;

const app = express();
app.use(express.json());
app.use('/api/users', usersRouter);
app.use(errorHandler);

const superToken = signAccessToken({ sub: 'super1', email: 's@x.com', systemRole: 'SUPER_ADMIN' });
const userToken = signAccessToken({ sub: 'user1', email: 'u@x.com', systemRole: 'USER' });
const adminToken = signAccessToken({ sub: 'admin1', email: 'a@x.com', systemRole: 'ADMIN' });
const bearer = (t: string) => ['Authorization', `Bearer ${t}`] as const;

beforeEach(() => vi.clearAllMocks());

describe('users routes — auth guards', () => {
  it('401 without a token', async () => {
    await request(app).get('/api/users').expect(401);
  });
  it('403 for a normal user', async () => {
    await request(app).get('/api/users').set(...bearer(userToken)).expect(403);
  });
  it('403 for an ADMIN (user management is super-admin only)', async () => {
    await request(app).get('/api/users').set(...bearer(adminToken)).expect(403);
  });
});

describe('GET /users', () => {
  it('lists users for a super admin', async () => {
    p.user.findMany.mockResolvedValue([{ id: 'u1', email: 'a@b.com' }]);
    const res = await request(app).get('/api/users').set(...bearer(superToken)).expect(200);
    expect(res.body.users).toHaveLength(1);
  });
});

describe('GET /users/:id/memberships', () => {
  it('returns grouped memberships across workspaces, spaces and clusters', async () => {
    p.workspaceMembership.findMany.mockResolvedValue([
      { workspace: { id: 'w', name: 'W', color: '#000' }, role: 'MEMBER' },
    ]);
    p.spaceMembership.findMany.mockResolvedValue([
      { space: { id: 's', name: 'S', color: '#111' }, role: 'SPACE_ADMIN' },
    ]);
    p.clusterMembership.findMany.mockResolvedValue([
      { cluster: { id: 'c', name: 'C', color: '#222', space: { name: 'S' } }, role: 'STUDENT' },
    ]);
    const res = await request(app).get('/api/users/u1/memberships').set(...bearer(superToken)).expect(200);
    expect(res.body.workspaces[0].name).toBe('W');
    expect(res.body.spaces[0].role).toBe('SPACE_ADMIN');
    expect(res.body.clusters[0].spaceName).toBe('S');
  });
});

describe('POST /users (create)', () => {
  it('creates a user (201) and writes an audit entry', async () => {
    p.user.findUnique.mockResolvedValue(null);
    p.university.findFirst.mockResolvedValue({ id: 'uni1' });
    p.user.create.mockResolvedValue({ id: 'new1', email: 'new@x.com', fullName: 'New', systemRole: 'USER', avatarColor: '#000', isActive: true });
    const res = await request(app).post('/api/users').set(...bearer(superToken))
      .send({ email: 'new@x.com', password: 'Abcdef12', fullName: 'New User', systemRole: 'USER' })
      .expect(201);
    expect(res.body.user.email).toBe('new@x.com');
    expect(p.auditLog.create).toHaveBeenCalled();
  });
  it('honors an explicit universityId', async () => {
    p.user.findUnique.mockResolvedValue(null);
    p.university.findUnique.mockResolvedValue({ id: 'uni2' });
    p.user.create.mockResolvedValue({ id: 'n2', email: 'n2@x.com', fullName: 'N2', systemRole: 'ADMIN', avatarColor: '#000', isActive: true });
    await request(app).post('/api/users').set(...bearer(superToken))
      .send({ email: 'n2@x.com', password: 'Abcdef12', fullName: 'N Two', systemRole: 'ADMIN', universityId: 'uni2' })
      .expect(201);
    expect(p.university.findUnique).toHaveBeenCalled();
  });
  it('409 on a duplicate email', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'exists' });
    await request(app).post('/api/users').set(...bearer(superToken))
      .send({ email: 'dup@x.com', password: 'Abcdef12', fullName: 'Dup User' })
      .expect(409);
  });
  it('400 on a weak password', async () => {
    await request(app).post('/api/users').set(...bearer(superToken))
      .send({ email: 'w@x.com', password: 'weak', fullName: 'Weak User' })
      .expect(400);
  });
  it('400 when no university exists', async () => {
    p.user.findUnique.mockResolvedValue(null);
    p.university.findFirst.mockResolvedValue(null);
    await request(app).post('/api/users').set(...bearer(superToken))
      .send({ email: 'nou@x.com', password: 'Abcdef12', fullName: 'No Uni' })
      .expect(400);
  });
});

describe('POST /users/:id/reset-password', () => {
  it('resets and revokes sessions (204)', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
    p.user.updateMany.mockResolvedValue({ count: 1 });
    p.refreshToken.updateMany.mockResolvedValue({ count: 2 });
    await request(app).post('/api/users/u1/reset-password').set(...bearer(superToken))
      .send({ newPassword: 'Abcdef12' })
      .expect(204);
    expect(p.refreshToken.updateMany).toHaveBeenCalled();
  });
  it('400 when the user is not found', async () => {
    p.user.findUnique.mockResolvedValue(null);
    await request(app).post('/api/users/x/reset-password').set(...bearer(superToken))
      .send({ newPassword: 'Abcdef12' })
      .expect(400);
  });
  it('400 on a too-short new password', async () => {
    await request(app).post('/api/users/u1/reset-password').set(...bearer(superToken))
      .send({ newPassword: 'weak' })
      .expect(400);
  });
  it('accepts the user email as a temporary password (default)', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'u1', email: 'chinmoy@gmail.com' });
    p.user.updateMany.mockResolvedValue({ count: 1 });
    p.refreshToken.updateMany.mockResolvedValue({ count: 0 });
    await request(app).post('/api/users/u1/reset-password').set(...bearer(superToken))
      .send({ newPassword: 'chinmoy@gmail.com' })
      .expect(204);
  });
});

describe('PATCH /users/:id/active', () => {
  it('deactivates and revokes sessions', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
    p.user.update.mockResolvedValue({});
    p.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).patch('/api/users/u1/active').set(...bearer(superToken))
      .send({ isActive: false })
      .expect(200);
    expect(res.body.user.isActive).toBe(false);
    expect(p.refreshToken.updateMany).toHaveBeenCalled();
  });
  it('activates without revoking sessions', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
    p.user.update.mockResolvedValue({});
    await request(app).patch('/api/users/u1/active').set(...bearer(superToken))
      .send({ isActive: true })
      .expect(200);
    expect(p.refreshToken.updateMany).not.toHaveBeenCalled();
  });
  it('400 when acting on your own account', async () => {
    await request(app).patch('/api/users/super1/active').set(...bearer(superToken))
      .send({ isActive: false })
      .expect(400);
  });
  it('400 when the user is not found', async () => {
    p.user.findUnique.mockResolvedValue(null);
    await request(app).patch('/api/users/x/active').set(...bearer(superToken))
      .send({ isActive: false })
      .expect(400);
  });
});

describe('DELETE /users/:id', () => {
  it('deletes a user (204)', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
    p.user.delete.mockResolvedValue({});
    await request(app).delete('/api/users/u1').set(...bearer(superToken)).expect(204);
  });
  it('400 when deleting your own account', async () => {
    await request(app).delete('/api/users/super1').set(...bearer(superToken)).expect(400);
  });
  it('400 when the user is not found', async () => {
    p.user.findUnique.mockResolvedValue(null);
    await request(app).delete('/api/users/x').set(...bearer(superToken)).expect(400);
  });
  it('409 when the user owns FK-restricted content', async () => {
    p.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
    p.user.delete.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('FK', { code: 'P2003', clientVersion: '5' }));
    await request(app).delete('/api/users/u1').set(...bearer(superToken)).expect(409);
  });
});

describe('GET /users/search', () => {
  it('searches users for any authenticated user', async () => {
    p.user.findMany.mockResolvedValue([{ id: 'u1', fullName: 'A', email: 'a@b.com', avatarColor: '#000' }]);
    const res = await request(app).get('/api/users/search?q=a').set(...bearer(userToken)).expect(200);
    expect(res.body.users).toHaveLength(1);
  });
  it('defaults to an empty query', async () => {
    p.user.findMany.mockResolvedValue([]);
    await request(app).get('/api/users/search').set(...bearer(userToken)).expect(200);
  });
});
