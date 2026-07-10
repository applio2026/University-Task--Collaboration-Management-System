import { NotificationType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { emitToUser } from '../../realtime/io';
import { sendEmail } from '../../lib/email';

// High-signal notifications also go out by email (when SMTP is configured).
const EMAILABLE: NotificationType[] = ['ANNOUNCEMENT_POSTED', 'SUBMISSION_GRADED', 'TASK_ASSIGNED'];

export async function notify(
  recipientIds: string[],
  type: NotificationType,
  title: string,
  opts: { body?: string; link?: string } = {},
) {
  const unique = [...new Set(recipientIds)];
  if (unique.length === 0) return;

  await prisma.notification.createMany({
    data: unique.map((recipientId) => ({
      recipientId,
      type,
      title,
      body: opts.body,
      link: opts.link,
    })),
  });

  for (const recipientId of unique) {
    emitToUser(recipientId, 'notification:new', { type, title, ...opts });
  }

  // Email the same alert for high-signal types.
  if (EMAILABLE.includes(type)) {
    const recipients = await prisma.user.findMany({
      where: { id: { in: unique }, isActive: true },
      select: { email: true },
    });
    const body = opts.body ? `${title}\n\n${opts.body}` : title;
    recipients.forEach((r) => sendEmail(r.email, title, body));
  }
}

export async function listForUser(userId: string, onlyUnread = false) {
  return prisma.notification.findMany({
    where: { recipientId: userId, ...(onlyUnread ? { isRead: false } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function markRead(userId: string, ids: string[]) {
  await prisma.notification.updateMany({
    where: { recipientId: userId, id: { in: ids } },
    data: { isRead: true },
  });
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({
    where: { recipientId: userId, isRead: false },
    data: { isRead: true },
  });
}
