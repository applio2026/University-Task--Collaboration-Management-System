import { describe, it, expect } from 'vitest';
import { AppError, badRequest, unauthorized, forbidden, notFound, conflict, locked } from './errors';

describe('error constructors', () => {
  it('badRequest carries status, code and details', () => {
    const e = badRequest('bad', { field: 'x' });
    expect(e.statusCode).toBe(400);
    expect(e.code).toBe('BAD_REQUEST');
    expect(e.details).toEqual({ field: 'x' });
    expect(e).toBeInstanceOf(AppError);
    expect(e).toBeInstanceOf(Error);
  });
  it('unauthorized has a default and accepts a custom message', () => {
    expect(unauthorized().statusCode).toBe(401);
    expect(unauthorized('nope').message).toBe('nope');
  });
  it('forbidden -> 403', () => expect(forbidden().statusCode).toBe(403));
  it('notFound -> 404', () => expect(notFound().statusCode).toBe(404));
  it('conflict -> 409', () => expect(conflict('dup').statusCode).toBe(409));
  it('locked -> 423', () => expect(locked('locked').statusCode).toBe(423));
});
