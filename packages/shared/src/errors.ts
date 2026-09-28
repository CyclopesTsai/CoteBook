/**
 * Machine-readable error codes returned by the API as `{ error: { code, message } }`.
 * Clients should branch on `code`; `message` is an English fallback for logs.
 */
export const ErrorCode = {
  BadRequest: 'bad_request',
  ValidationFailed: 'validation_failed',
  Unauthorized: 'unauthorized',
  Forbidden: 'forbidden',
  NotFound: 'not_found',
  Conflict: 'conflict',
  EmailTaken: 'email_taken',
  InvalidCredentials: 'invalid_credentials',
  RegistrationDisabled: 'registration_disabled',
  VersionConflict: 'version_conflict',
  InvalidMove: 'invalid_move',
  UnsupportedMediaType: 'unsupported_media_type',
  PayloadTooLarge: 'payload_too_large',
  RateLimited: 'rate_limited',
  /** The instance runs without a database (DATABASE_ENABLED=false). */
  DatabaseDisabled: 'database_disabled',
  Internal: 'internal_error',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}
