import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../lib/jwt';
import { badRequest, conflict, locked, unauthorized } from '../../lib/errors';

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function publicUser(u: {
  id: string;
  email: string;
  fullName: string;
  systemRole: string;
  avatarColor: string;
  universityId: string;
  mustChangePassword?: boolean;
}) {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    systemRole: u.systemRole,
    avatarColor: u.avatarColor,
    universityId: u.universityId,
    mustChangePassword: u.mustChangePassword ?? false,
  };
}

async function issueTokens(user: { id: string; email: string; systemRole: string }) {
  const accessToken = signAccessToken({ sub: user.id, email: user.email, systemRole: user.systemRole });
  const refreshToken = signRefreshToken(user.id);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  return { accessToken, refreshToken };
}

export async function register(input: {
  email: string;
  password: string;
  fullName: string;
  universityId?: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw conflict('Email already registered');

  // Attach to the first university if none provided (single-tenant dev default).
  const university =
    (input.universityId && (await prisma.university.findUnique({ where: { id: input.universityId } }))) ||
    (await prisma.university.findFirst());
  if (!university) throw badRequest('No university exists; seed the database first');

  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      universityId: university.id,
    },
  });
  const tokens = await issueTokens(user);
  return { user: publicUser(user), ...tokens };
}

// A valid bcrypt hash of a random value, compared against when the email is
// unknown so login timing doesn't reveal whether an account exists.
const DUMMY_HASH = '$2a$10$C6UzMDM.H6dfI/f/IKcEeO3f3Y3f3Y3f3Y3f3Y3f3Y3f3Y3f3Y3f3';
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });

  // Reject early if the account is currently locked out.
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    throw locked('Account temporarily locked after too many failed attempts. Try again later.');
  }

  // Always run a bcrypt comparison (constant-ish time) to avoid user enumeration.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.isActive || !ok) {
    // Count a failed attempt against a real, active account and lock at the cap.
    if (user && user.isActive && !ok) {
      const attempts = user.failedLoginAttempts + 1;
      await prisma.user.update({
        where: { id: user.id },
        data:
          attempts >= MAX_FAILED_ATTEMPTS
            ? { failedLoginAttempts: attempts, lockedUntil: new Date(Date.now() + LOCK_DURATION_MS) }
            : { failedLoginAttempts: attempts },
      });
    }
    throw unauthorized('Invalid credentials');
  }

  // Successful login clears the failure counters.
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
  });
  const tokens = await issueTokens(user);
  return { user: publicUser(user), ...tokens };
}

export async function refresh(refreshToken: string) {
  let payload: { sub: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw unauthorized('Invalid refresh token');
  }
  const tokenHash = hashToken(refreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw unauthorized('Refresh token expired or revoked');
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) throw unauthorized('User not found');

  // Rotate: revoke old, issue new.
  await prisma.refreshToken.update({ where: { tokenHash }, data: { revokedAt: new Date() } });
  const tokens = await issueTokens(user);
  return { user: publicUser(user), ...tokens };
}

export async function logout(refreshToken: string | undefined) {
  if (!refreshToken) return;
  const tokenHash = hashToken(refreshToken);
  await prisma.refreshToken
    .update({ where: { tokenHash }, data: { revokedAt: new Date() } })
    .catch(() => undefined);
}

export async function me(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized();
  return publicUser(user);
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized();
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw unauthorized('Current password is incorrect');

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false } }),
    // Revoke every existing session so a stolen refresh token dies with the old password.
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}
