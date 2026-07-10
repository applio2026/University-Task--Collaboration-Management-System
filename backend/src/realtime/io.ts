import { Server as HttpServer } from 'node:http';
import { Server as SocketServer, Socket } from 'socket.io';
import { env } from '../config/env';
import { verifyAccessToken } from '../lib/jwt';
import { getClusterRole } from '../middleware/rbac';

let io: SocketServer | null = null;

interface AuthedSocket extends Socket {
  userId?: string;
  systemRole?: string;
}

export function initSocket(server: HttpServer): SocketServer {
  io = new SocketServer(server, {
    cors: { origin: env.corsOrigin, credentials: true },
  });

  // JWT handshake auth.
  io.use((socket: AuthedSocket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Auth token required'));
    try {
      const payload = verifyAccessToken(token);
      socket.userId = payload.sub;
      socket.systemRole = payload.systemRole;
      // Personal room for direct notifications.
      socket.join(`user:${payload.sub}`);
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthedSocket) => {
    // Client asks to join a cluster's live room (chat / task updates).
    socket.on('cluster:join', async (clusterId: string) => {
      const role = await getClusterRole(socket.userId!, clusterId, socket.systemRole);
      if (role) socket.join(`cluster:${clusterId}`);
    });
    socket.on('cluster:leave', (clusterId: string) => socket.leave(`cluster:${clusterId}`));
  });

  return io;
}

export function emitToCluster(clusterId: string, event: string, payload: unknown): void {
  io?.to(`cluster:${clusterId}`).emit(event, payload);
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(`user:${userId}`).emit(event, payload);
}
