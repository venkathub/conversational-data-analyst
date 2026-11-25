import { FILTER_OPS, MAX_DIMENSIONS, MAX_FILTERS, MAX_METRICS, SORT_DIRECTIONS, TABLE_NAMES } from '@cda/shared';
import { z } from 'zod';

/**
 * Structural schema for what the LLM returns. Names of metrics, dimensions and
 * filter fields are plain strings here and are checked against the catalog by
 * validatePlan(), which gives table-specific error messages.
 */
const name = z.string().min(1).max(64);

const filterSchema = z
  .object({
    field: name,
    op: z.enum(FILTER_OPS),
    value: z.union([z.string().max(100), z.number(), z.array(z.string().max(100)).min(1).max(20)]),
  })
  .strict();

export const queryPlanSchema = z
  .object({
    kind: z.literal('query'),
    table: z.enum(TABLE_NAMES),
    metrics: z.array(name).min(1).max(MAX_METRICS),
    dimensions: z.array(name).max(MAX_DIMENSIONS).default([]),
    filters: z.array(filterSchema).max(MAX_FILTERS).default([]),
    sort: z.object({ by: name, direction: z.enum(SORT_DIRECTIONS) }).strict().optional(),
    // Range is checked in validatePlan so an out-of-range value gets a clear error, never a clamp.
    limit: z.number().int().optional(),
  })
  .strict();

export const unsupportedPlanSchema = z
  .object({ kind: z.literal('unsupported'), reason: z.string().min(1).max(300) })
  .strict();

export const llmPlanSchema = z.discriminatedUnion('kind', [queryPlanSchema, unsupportedPlanSchema]);
