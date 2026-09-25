import { ErrorCode } from '@cotebook/shared';

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }

  static badRequest(message = 'Bad request', details?: unknown) {
    return new HttpError(400, ErrorCode.BadRequest, message, details);
  }
  static unauthorized(message = 'Authentication required') {
    return new HttpError(401, ErrorCode.Unauthorized, message);
  }
  static forbidden(message = 'Forbidden') {
    return new HttpError(403, ErrorCode.Forbidden, message);
  }
  static notFound(message = 'Not found') {
    return new HttpError(404, ErrorCode.NotFound, message);
  }
}
