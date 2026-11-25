import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  type LlmPlan,
  type PlanFilter,
  type QueryPlan,
} from '@cda/shared';
import type { ZodError } from 'zod';
import { CATALOG, OPS_BY_FILTER_TYPE, type FilterDef, type TableDef } from '../catalog/index.js';
import { cannotAnswer } from '../errors/AppError.js';
import { llmPlanSchema, queryPlanSchema } from './planSchema.js';

export type ValidatedPlan = QueryPlan & { limit: number };

const shown = (value: unknown): string => JSON.stringify(String(value).slice(0, 40));

function describeZodError(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'the query plan is malformed.';
  const where = issue.path.length > 0 ? ` at "${issue.path.join('.')}"` : '';
  return `the query plan is malformed${where} (${issue.message}).`;
}

/** Parse raw LLM output into a plan or an "unsupported" marker. Strict: unknown keys are rejected. */
export function parseLlmPlan(raw: unknown): LlmPlan {
  const result = llmPlanSchema.safeParse(raw);
  if (!result.success) throw cannotAnswer(describeZodError(result.error));
  return result.data;
}

const isIsoDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

function validateScalar(field: string, def: FilterDef, value: unknown): void {
  switch (def.type) {
    case 'enum':
      if (typeof value !== 'string' || !def.values?.includes(value)) {
        throw cannotAnswer(`${shown(value)} is not a valid value for ${field} (use ${def.values?.join(', ')}).`);
      }
      return;
    case 'string':
      if (typeof value !== 'string' || value.length === 0) throw cannotAnswer(`filter ${field} needs a text value.`);
      return;
    case 'date':
      if (typeof value !== 'string' || !isIsoDate(value)) {
        throw cannotAnswer(`filter ${field} needs a real date in YYYY-MM-DD format.`);
      }
      return;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) throw cannotAnswer(`filter ${field} needs a number.`);
      return;
  }
}

function validateFilter(table: TableDef, filter: PlanFilter): void {
  const def = Object.entries(table.filters).find(([key]) => key === filter.field)?.[1];
  if (!def) throw cannotAnswer(`I can't filter on ${shown(filter.field)} for this data.`);
  if (!OPS_BY_FILTER_TYPE[def.type].includes(filter.op)) {
    throw cannotAnswer(`the operator ${filter.op} is not allowed on ${filter.field}.`);
  }
  if (filter.op === 'in') {
    if (!Array.isArray(filter.value)) throw cannotAnswer(`filter ${filter.field} with "in" needs a list of values.`);
    filter.value.forEach((v) => validateScalar(filter.field, def, v));
  } else {
    if (Array.isArray(filter.value)) throw cannotAnswer(`filter ${filter.field} needs a single value.`);
    validateScalar(filter.field, def, filter.value);
  }
}

function assertKnownUnique(kind: string, names: string[], known: Record<string, unknown>, table: string): void {
  const seen = new Set<string>();
  for (const n of names) {
    if (!Object.keys(known).includes(n)) throw cannotAnswer(`${shown(n)} is not a ${kind} I have for ${table}.`);
    if (seen.has(n)) throw cannotAnswer(`${kind} ${shown(n)} was listed twice.`);
    seen.add(n);
  }
}

/**
 * Strictly validates an untrusted plan against the catalog. Throws a CANNOT_ANSWER AppError
 * for anything unknown or out of range. Never clamps, drops or rewrites parts of the plan.
 */
export function validatePlan(raw: unknown): ValidatedPlan {
  const parsed = queryPlanSchema.safeParse(raw);
  if (!parsed.success) throw cannotAnswer(describeZodError(parsed.error));
  const plan = parsed.data;

  const table = Object.entries(CATALOG).find(([name]) => name === plan.table)?.[1];
  if (!table) throw cannotAnswer(`I don't have a table called ${shown(plan.table)}.`);

  assertKnownUnique('metric', plan.metrics, table.metrics, plan.table);
  assertKnownUnique('dimension', plan.dimensions, table.dimensions, plan.table);
  plan.filters.forEach((f) => validateFilter(table, f));

  if (plan.sort && ![...plan.metrics, ...plan.dimensions].includes(plan.sort.by)) {
    throw cannotAnswer(`I can only sort by a metric or dimension in the result, not ${shown(plan.sort.by)}.`);
  }

  const limit = plan.limit ?? DEFAULT_LIMIT;
  if (limit < 1 || limit > MAX_LIMIT) throw cannotAnswer(`the row limit must be between 1 and ${MAX_LIMIT}.`);

  return { ...plan, limit };
}
