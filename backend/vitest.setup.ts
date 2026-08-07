// Deterministic, hermetic env for tests — set before config/env.ts loads so the
// suite never depends on a real .env or database.
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET ||= 'test-access-secret-0123456789-abcdefghijkl';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret-0123456789-abcdefghij';
process.env.DATABASE_URL ||= 'postgresql://user:pass@localhost:5432/testdb';
