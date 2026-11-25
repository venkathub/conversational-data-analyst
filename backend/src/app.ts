import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type Database from 'better-sqlite3';
import type { LlmProvider } from './llm/provider.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { rateLimit } from './middleware/rateLimit.js';
import { askRouter } from './routes/ask.js';

export interface AppDeps {
  db: Database.Database;
  provider: LlmProvider;
  corsOrigin?: string;
  /** Requests per minute per IP on /api/ask. 0 disables the limiter. */
  rateLimitPerMinute?: number;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: deps.corsOrigin ?? 'http://localhost:5173', methods: ['GET', 'POST'] }));
  app.use(express.json({ limit: '10kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, provider: deps.provider.name });
  });

  const limit = deps.rateLimitPerMinute ?? 30;
  if (limit > 0) app.use('/api/ask', rateLimit(limit, 60_000));
  app.use('/api', askRouter({ db: deps.db, provider: deps.provider }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
