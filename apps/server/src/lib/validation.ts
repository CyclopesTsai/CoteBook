import { ErrorCode } from '@cotebook/shared';
import type { z } from 'zod';
import { HttpError } from './errors.js';

/** Parses untrusted input with a zod schema, throwing a 400 on failure. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new HttpError(
      400,
      ErrorCode.ValidationFailed,
      'Request validation failed',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}
