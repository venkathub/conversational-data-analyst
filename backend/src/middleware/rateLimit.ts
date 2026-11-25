import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError.js';

/** Minimal in-memory fixed-window limiter per client IP. Protects LLM spend; use a shared store in production. */
export function rateLimit(maxRequests: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, _res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = req.ip ?? 'unknown';
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      return next();
    }
    entry.count += 1;
    if (entry.count > maxRequests) return next(new AppError('RATE_LIMITED', 'Too many questions. Please wait a moment and try again.'));
    next();
  };
}
