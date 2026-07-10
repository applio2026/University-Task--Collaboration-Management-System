import { NextFunction, Request, Response } from 'express';

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown;

/** Wraps an async route so thrown errors reach the error middleware. */
export const asyncHandler =
  (fn: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
