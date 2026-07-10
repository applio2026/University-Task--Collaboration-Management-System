import { NextFunction, Request, Response } from 'express';
import { AnyZodObject, ZodEffects } from 'zod';

type Schema = AnyZodObject | ZodEffects<AnyZodObject>;

/** Validates and coerces req.body/query/params against a Zod schema. */
export function validate(schema: { body?: Schema; query?: Schema; params?: Schema }) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (schema.body) req.body = schema.body.parse(req.body);
    if (schema.query) Object.assign(req.query, schema.query.parse(req.query));
    if (schema.params) Object.assign(req.params, schema.params.parse(req.params));
    next();
  };
}
