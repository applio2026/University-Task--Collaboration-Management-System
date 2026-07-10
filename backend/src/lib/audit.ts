import { Request } from 'express';
import { prisma } from './prisma';

/**
 * Records an audit-trail entry. Fire-and-forget: never throws into the request
 * path — an audit write must not break the action it is recording.
 */
export function writeAudit(
  req: Request,
  action: string,
  entityType: string,
  entityId?: string,
  meta?: Record<string, unknown>,
): void {
  void prisma.auditLog
    .create({
      data: {
        actorId: req.user?.id,
        action,
        entityType,
        entityId,
        meta: meta ? (meta as object) : undefined,
        ipAddress: req.ip,
      },
    })
    .catch(() => undefined);
}
