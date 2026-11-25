import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { AskFailure } from '@cda/shared';
import { EXAMPLE_QUESTIONS } from '@cda/shared';
import { AppError } from '../errors/AppError.js';

export const notFound: RequestHandler = (_req, res) => {
  const body: AskFailure = { ok: false, error: { code: 'NOT_FOUND', message: 'Not found.' } };
  res.status(404).json(body);
};

/** Converts any error into a structured response. Never includes stack traces, SQL or internal messages. */
export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  let status = 500;
  let body: AskFailure = { ok: false, error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } };

  if (err instanceof AppError) {
    status = err.status;
    body = { ok: false, error: { code: err.code, message: err.message } };
    if (err.code === 'CANNOT_ANSWER') body.error.suggestions = [...EXAMPLE_QUESTIONS];
  } else if (typeof err === 'object' && err !== null && 'type' in err) {
    const type = (err as { type: unknown }).type;
    if (type === 'entity.parse.failed') {
      status = 400;
      body = { ok: false, error: { code: 'INVALID_REQUEST', message: 'The request body must be valid JSON.' } };
    } else if (type === 'entity.too.large') {
      status = 413;
      body = { ok: false, error: { code: 'INVALID_REQUEST', message: 'The request is too large.' } };
    }
  }

  if (status === 500) console.error('Unhandled error:', err instanceof Error ? err.message : 'unknown');
  res.status(status).json(body);
};
