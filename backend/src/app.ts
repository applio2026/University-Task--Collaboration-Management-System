import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error';
import { mountSwagger } from './docs/swagger';

import authRoutes from './features/auth/auth.routes';
import userRoutes from './features/users/users.routes';
import workspaceRoutes from './features/workspaces/workspaces.routes';
import spaceRoutes from './features/spaces/spaces.routes';
import clusterRoutes from './features/clusters/clusters.routes';
import taskRoutes from './features/tasks/tasks.routes';
import announcementRoutes from './features/announcements/announcements.routes';
import chatRoutes from './features/chat/chat.routes';
import searchRoutes from './features/search/search.routes';
import submissionRoutes from './features/submissions/submissions.routes';
import fileRoutes from './features/files/files.routes';
import auditRoutes from './features/audit/audit.routes';
import templateRoutes from './features/templates/templates.routes';
import archiveRoutes from './features/archive/archive.routes';
import configRoutes from './features/config/config.routes';
import notificationRoutes from './features/notifications/notifications.routes';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());
  if (!env.isProd) app.use(morgan('dev'));

  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

  // Public config must be mounted before the `/api` routers below, which each
  // apply `authenticate` to every /api/* path and would otherwise 401 it.
  app.use('/api/config', configRoutes);

  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/spaces', spaceRoutes);
  // Workspace, cluster & task routers use absolute paths (/workspaces, /clusters,
  // /spaces/:id/clusters, /tasks…)
  app.use('/api', workspaceRoutes);
  app.use('/api', clusterRoutes);
  app.use('/api', taskRoutes);
  app.use('/api', announcementRoutes);
  app.use('/api', chatRoutes);
  app.use('/api', submissionRoutes);
  app.use('/api', fileRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/templates', templateRoutes);
  app.use('/api/archive', archiveRoutes);
  app.use('/api/notifications', notificationRoutes);

  mountSwagger(app);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
