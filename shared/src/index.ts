/** Types and constants shared by backend and frontend. */

export const TABLE_NAMES = ['branches', 'customers', 'onboarding_applications', 'transactions'] as const;
export type TableName = (typeof TABLE_NAMES)[number];

export const FILTER_OPS = ['eq', 'in', 'gt', 'gte', 'lt', 'lte'] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export const MAX_QUESTION_LENGTH = 500;
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;
export const MAX_METRICS = 3;
export const MAX_DIMENSIONS = 2;
export const MAX_FILTERS = 6;

export type FilterValue = string | number | string[];

export interface PlanFilter {
  field: string;
  op: FilterOp;
  value: FilterValue;
}

export interface PlanSort {
  by: string;
  direction: SortDirection;
}

/** What the LLM produces for an answerable question. Never SQL. */
export interface QueryPlan {
  kind: 'query';
  table: TableName;
  metrics: string[];
  dimensions: string[];
  filters: PlanFilter[];
  sort?: PlanSort;
  limit?: number;
}

/** What the LLM produces when the question is out of scope. */
export interface UnsupportedPlan {
  kind: 'unsupported';
  reason: string;
}

export type LlmPlan = QueryPlan | UnsupportedPlan;

// ---- API ----

export interface AskRequest {
  question: string;
}

export type VizType = 'kpi' | 'table' | 'bar' | 'line';
export type ColumnRole = 'dimension' | 'metric';
export type ColumnFormat = 'text' | 'month' | 'integer' | 'decimal' | 'currency' | 'percent';

export interface ResultColumn {
  key: string;
  label: string;
  role: ColumnRole;
  format: ColumnFormat;
}

export type CellValue = string | number | null;
export type ResultRow = Record<string, CellValue>;

export interface AskMeta {
  provider: 'mock' | 'anthropic';
  table: TableName;
  rowCount: number;
  truncated: boolean;
  elapsedMs: number;
  /** The validated plan that was executed (the LLM's JSON plan, not SQL). */
  plan: QueryPlan;
}

export interface AskSuccess {
  ok: true;
  answer: string;
  viz: VizType;
  columns: ResultColumn[];
  rows: ResultRow[];
  meta: AskMeta;
}

export const ERROR_CODES = [
  'INVALID_REQUEST',
  'CANNOT_ANSWER',
  'PROVIDER_ERROR',
  'PROVIDER_TIMEOUT',
  'RATE_LIMITED',
  'NOT_FOUND',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface AskFailure {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    /** Example questions the user can try, present for CANNOT_ANSWER. */
    suggestions?: string[];
  };
}

export type AskResponse = AskSuccess | AskFailure;

export const EXAMPLE_QUESTIONS = [
  'Show monthly onboarding applications by customer segment',
  'Which branches have the highest rejection rate?',
  'Compare retail and SME onboarding volumes',
  'Show the top five customers by transaction value',
] as const;

/** Formats a cell for display and copying. Percent values are fractions; currency is INR. */
export function formatValue(value: CellValue, format: ColumnFormat): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  switch (format) {
    case 'integer':
      return value.toLocaleString('en-IN', { maximumFractionDigits: 0 });
    case 'currency':
      return value.toLocaleString('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2,
      });
    case 'percent':
      return `${(value * 100).toFixed(1)}%`;
    case 'decimal':
      return value.toLocaleString('en-IN', { maximumFractionDigits: 1 });
    default:
      return String(value);
  }
}
