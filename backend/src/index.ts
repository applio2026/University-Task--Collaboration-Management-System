// import http from 'node:http';
// import { createApp } from './app';
// import { env } from './config/env';
// import { initSocket } from './realtime/io';
// import { prisma } from './lib/prisma';

// async function main() {
//   const app = createApp();
//   const server = http.createServer(app);
//   initSocket(server);

//   server.listen(env.port, () => {
//     // eslint-disable-next-line no-console
//     console.log(`🚀 API listening on http://localhost:${env.port}`);
//     // eslint-disable-next-line no-console
//     console.log(`📚 Swagger UI at http://localhost:${env.port}/api/docs`);
//   });

//   const shutdown = async () => {
//     // eslint-disable-next-line no-console
//     console.log('Shutting down…');
//     await prisma.$disconnect();
//     server.close(() => process.exit(0));
//   };
//   process.on('SIGINT', shutdown);
//   process.on('SIGTERM', shutdown);
// }

// main().catch((err) => {
//   // eslint-disable-next-line no-console
//   console.error('Fatal startup error:', err);
//   process.exit(1);
// });







import http from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { initSocket } from './realtime/io';
import { prisma } from './lib/prisma';

async function main() {
  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);

  // Explicitly bind to 0.0.0.0 here:
  server.listen(env.port, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(`🚀 API listening on http://0.0.0.0:${env.port}`);
    // eslint-disable-next-line no-console
    console.log(`📚 Swagger UI at http://0.0.0.0:${env.port}/api/docs`);
  });

  const shutdown = async () => {
    // eslint-disable-next-line no-console
    console.log('Shutting down…');
    await prisma.$disconnect();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});