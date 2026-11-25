import { Router } from 'express';
import type Database from 'better-sqlite3';
import { DEFAULT_LIMIT, MAX_QUESTION_LENGTH, type AskSuccess } from '@cda/shared';
import { z } from 'zod';
import { AppError, cannotAnswer } from '../errors/AppError.js';
import type { LlmProvider } from '../llm/provider.js';
import { buildSql, execute, parseLlmPlan, validatePlan } from '../query/index.js';
import { buildColumns, chooseViz, composeAnswer } from '../query/present.js';

const askBody = z.object({ question: z.string().trim().min(1, 'Please type a question.').max(MAX_QUESTION_LENGTH, `Questions are limited to ${MAX_QUESTION_LENGTH} characters.`) }).strict();

export function askRouter(deps: { db: Database.Database; provider: LlmProvider }): Router {
  const router = Router();

  router.post('/ask', async (req, res, next) => {
    try {
      const started = Date.now();
      const parsed = askBody.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('INVALID_REQUEST', parsed.error.issues[0]?.message ?? 'Send a JSON body like {"question": "..."}.');
      }

      const raw = await deps.provider.planQuery(parsed.data.question);
      const llmPlan = parseLlmPlan(raw);
      if (llmPlan.kind === 'unsupported') throw cannotAnswer(llmPlan.reason);

      const plan = validatePlan(llmPlan);
      const { rows, truncated } = execute(deps.db, buildSql(plan));
      const columns = buildColumns(plan);
      const viz = chooseViz(plan, rows);

      const body: AskSuccess = {
        ok: true,
        answer: composeAnswer(columns, rows, viz, truncated && plan.limit >= DEFAULT_LIMIT),
        viz,
        columns,
        rows,
        meta: { provider: deps.provider.name, table: plan.table, rowCount: rows.length, truncated, elapsedMs: Date.now() - started, plan },
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
