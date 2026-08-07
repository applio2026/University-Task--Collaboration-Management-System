import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      // Coverage is scoped to the security-critical modules under test
      // (roles/RBAC, auth, captcha, jwt, password, errors).
      include: [
        'src/lib/password.ts',
        'src/lib/captcha.ts',
        'src/lib/jwt.ts',
        'src/lib/errors.ts',
        'src/middleware/auth.ts',
        'src/middleware/rbac.ts',
        'src/features/users/users.routes.ts',
      ],
      thresholds: { statements: 95, branches: 90, functions: 95, lines: 95 },
    },
  },
});
