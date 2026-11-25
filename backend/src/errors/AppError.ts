import type { ErrorCode } from '@cda/shared';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  INVALID_REQUEST: 400,
  CANNOT_ANSWER: 422,
  PROVIDER_ERROR: 502,
  PROVIDER_TIMEOUT: 504,
  RATE_LIMITED: 429,
  NOT_FOUND: 404,
  INTERNAL: 500,
};

/**
 * An error whose message is safe to show to the client.
 * Never put SQL, stack traces or secrets in `message`.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
}

/** Plan or question cannot be answered from the available data. */
export const cannotAnswer = (detail: string): AppError =>
  new AppError('CANNOT_ANSWER', `I can't answer that: ${detail}`);
