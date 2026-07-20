import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Known placeholder secrets that must never reach production.
const WEAK_SECRETS = new Set([
  'dev-access-secret',
  'dev-refresh-secret',
  'change-me-access-secret-in-production',
  'change-me-refresh-secret-in-production',
]);

/** In production a signing secret must be explicitly set and non-placeholder. */
function secret(name: string, devFallback: string): string {
  const value = required(name, devFallback);
  if (process.env.NODE_ENV === 'production' && (WEAK_SECRETS.has(value) || value.length < 32)) {
    throw new Error(
      `${name} is missing, a known placeholder, or too short (<32 chars). ` +
        'Set a strong random secret before running in production.',
    );
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT ?? 4000),
  // Whether the auth refresh cookie is flagged `Secure`. Browsers DROP Secure
  // cookies received over plain HTTP, so a production deployment served over
  // HTTP (no TLS) must set COOKIE_SECURE=false or users get logged out on every
  // refresh (the refresh cookie never persists). Defaults to on in production;
  // set to `true` explicitly once the site is behind HTTPS.
  cookieSecure:
    process.env.COOKIE_SECURE !== undefined
      ? process.env.COOKIE_SECURE === 'true'
      : process.env.NODE_ENV === 'production',
  // Self-service signup is off by default: the Super Admin creates accounts.
  allowPublicRegistration: process.env.ALLOW_PUBLIC_REGISTRATION === 'true',
  databaseUrl: required('DATABASE_URL', 'postgresql://uni:uni_secret@localhost:5432/uni_tcms?schema=public'),
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((s) => s.trim()),
  jwt: {
    accessSecret: secret('JWT_ACCESS_SECRET', 'dev-access-secret'),
    refreshSecret: secret('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  },
  uploadsDir: process.env.UPLOADS_DIR ?? 'uploads',
};
