import { Express } from 'express';
import swaggerUi from 'swagger-ui-express';

/**
 * Minimal OpenAPI document. The JSDoc @openapi annotations in the route files
 * document individual endpoints; here we expose a browsable spec + Swagger UI.
 * (For a full generated spec, add swagger-jsdoc; kept lightweight for now.)
 */
export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'University Task & Collaboration Management System API',
    version: '0.1.0',
    description:
      'REST API for the University TCMS. Hierarchy: University → Space → Cluster → Task. ' +
      'JWT auth with role-based access control (Super Admin, Space Admin, Cluster Admin/Faculty, TA, Student).',
  },
  servers: [{ url: '/api' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
  tags: [
    { name: 'Auth' },
    { name: 'Users' },
    { name: 'Spaces' },
    { name: 'Clusters' },
    { name: 'Tasks' },
    { name: 'Notifications' },
  ],
  paths: {
    '/auth/login': { post: { tags: ['Auth'], summary: 'Login' } },
    '/auth/register': { post: { tags: ['Auth'], summary: 'Register' } },
    '/auth/refresh': { post: { tags: ['Auth'], summary: 'Rotate refresh token' } },
    '/auth/me': { get: { tags: ['Auth'], summary: 'Current user', security: [{ bearerAuth: [] }] } },
    '/spaces': {
      get: { tags: ['Spaces'], summary: 'List accessible spaces', security: [{ bearerAuth: [] }] },
      post: { tags: ['Spaces'], summary: 'Create space (super admin)', security: [{ bearerAuth: [] }] },
    },
    '/spaces/{spaceId}/clusters': {
      get: { tags: ['Clusters'], summary: 'List clusters', security: [{ bearerAuth: [] }] },
      post: { tags: ['Clusters'], summary: 'Create cluster', security: [{ bearerAuth: [] }] },
    },
    '/clusters/{clusterId}/tasks': {
      get: { tags: ['Tasks'], summary: 'List tasks', security: [{ bearerAuth: [] }] },
      post: { tags: ['Tasks'], summary: 'Create task', security: [{ bearerAuth: [] }] },
    },
    '/tasks/overview': {
      get: { tags: ['Tasks'], summary: 'Grouped overview', security: [{ bearerAuth: [] }] },
    },
    '/tasks/{taskId}': { get: { tags: ['Tasks'], summary: 'Get task', security: [{ bearerAuth: [] }] } },
    '/tasks/{taskId}/comments': {
      get: { tags: ['Tasks'], summary: 'List comments', security: [{ bearerAuth: [] }] },
      post: { tags: ['Tasks'], summary: 'Add comment', security: [{ bearerAuth: [] }] },
    },
    '/notifications': { get: { tags: ['Notifications'], summary: 'List notifications', security: [{ bearerAuth: [] }] } },
  },
} as const;

export function mountSwagger(app: Express): void {
  app.get('/api/openapi.json', (_req, res) => res.json(openApiDocument));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
}
