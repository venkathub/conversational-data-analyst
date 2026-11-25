import type { ColumnFormat, TableName } from '@cda/shared';

/**
 * Whitelist catalog. This is the ONLY source of SQL identifiers and expressions.
 * Nothing from the LLM or the user is ever concatenated into SQL; plans refer to
 * these entries by name and the builder looks the SQL fragments up here.
 *
 * Aliases: the primary table is `t`, joined branches are `b`, joined customers are `c`.
 * Percent metrics are fractions (0.25 = 25%).
 */

export type JoinName = 'branch' | 'customer';

export const JOINS: Record<JoinName, string> = {
  branch: 'JOIN branches b ON b.id = t.branch_id',
  customer: 'JOIN customers c ON c.id = t.customer_id',
};

export interface DimensionDef {
  label: string;
  expr: string;
  join?: JoinName;
  kind: 'category' | 'time';
}

export interface MetricDef {
  label: string;
  expr: string;
  format: Exclude<ColumnFormat, 'text' | 'month'>;
}

export type FilterType = 'enum' | 'string' | 'date' | 'number';

export interface FilterDef {
  label: string;
  expr: string;
  join?: JoinName;
  type: FilterType;
  values?: readonly string[];
}

export interface TableDef {
  label: string;
  description: string;
  dimensions: Record<string, DimensionDef>;
  metrics: Record<string, MetricDef>;
  filters: Record<string, FilterDef>;
}

const SEGMENTS = ['Retail', 'SME', 'Corporate'] as const;
const REGIONS = ['North', 'South', 'East', 'West'] as const;
const STATUSES = ['Approved', 'Rejected', 'Pending'] as const;
const TXN_TYPES = ['Credit', 'Debit'] as const;
const CHANNELS = ['Branch', 'Online', 'Mobile'] as const;

export const CATALOG: Record<TableName, TableDef> = {
  branches: {
    label: 'Branches',
    description: 'Bank branches with city and region',
    dimensions: {
      region: { label: 'Region', expr: 't.region', kind: 'category' },
      city: { label: 'City', expr: 't.city', kind: 'category' },
      branch: { label: 'Branch', expr: 't.name', kind: 'category' },
    },
    metrics: {
      branch_count: { label: 'Branches', expr: 'COUNT(*)', format: 'integer' },
    },
    filters: {
      region: { label: 'Region', expr: 't.region', type: 'enum', values: REGIONS },
      city: { label: 'City', expr: 't.city', type: 'string' },
    },
  },

  customers: {
    label: 'Customers',
    description: 'Customers with segment and home branch',
    dimensions: {
      segment: { label: 'Segment', expr: 't.segment', kind: 'category' },
      branch: { label: 'Branch', expr: 'b.name', join: 'branch', kind: 'category' },
      region: { label: 'Region', expr: 'b.region', join: 'branch', kind: 'category' },
      joined_month: { label: 'Month joined', expr: "strftime('%Y-%m', t.joined_on)", kind: 'time' },
    },
    metrics: {
      customer_count: { label: 'Customers', expr: 'COUNT(*)', format: 'integer' },
    },
    filters: {
      segment: { label: 'Segment', expr: 't.segment', type: 'enum', values: SEGMENTS },
      region: { label: 'Region', expr: 'b.region', join: 'branch', type: 'enum', values: REGIONS },
      branch: { label: 'Branch', expr: 'b.name', join: 'branch', type: 'string' },
      joined_on: { label: 'Joined on', expr: 't.joined_on', type: 'date' },
    },
  },

  onboarding_applications: {
    label: 'Onboarding applications',
    description: 'Customer onboarding applications and their decisions',
    dimensions: {
      month: { label: 'Month', expr: "strftime('%Y-%m', t.submitted_at)", kind: 'time' },
      segment: { label: 'Segment', expr: 't.segment', kind: 'category' },
      status: { label: 'Status', expr: 't.status', kind: 'category' },
      branch: { label: 'Branch', expr: 'b.name', join: 'branch', kind: 'category' },
      region: { label: 'Region', expr: 'b.region', join: 'branch', kind: 'category' },
    },
    metrics: {
      application_count: { label: 'Applications', expr: 'COUNT(*)', format: 'integer' },
      approved_count: {
        label: 'Approved',
        expr: "SUM(CASE WHEN t.status = 'Approved' THEN 1 ELSE 0 END)",
        format: 'integer',
      },
      rejected_count: {
        label: 'Rejected',
        expr: "SUM(CASE WHEN t.status = 'Rejected' THEN 1 ELSE 0 END)",
        format: 'integer',
      },
      pending_count: {
        label: 'Pending',
        expr: "SUM(CASE WHEN t.status = 'Pending' THEN 1 ELSE 0 END)",
        format: 'integer',
      },
      // Derived: rejected / decided (pending applications are excluded from the denominator).
      rejection_rate: {
        label: 'Rejection rate',
        expr: "ROUND(1.0 * SUM(CASE WHEN t.status = 'Rejected' THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN t.status <> 'Pending' THEN 1 ELSE 0 END), 0), 4)",
        format: 'percent',
      },
      avg_decision_days: {
        label: 'Avg days to decision',
        expr: 'ROUND(AVG(julianday(t.decided_at) - julianday(t.submitted_at)), 1)',
        format: 'decimal',
      },
    },
    filters: {
      segment: { label: 'Segment', expr: 't.segment', type: 'enum', values: SEGMENTS },
      status: { label: 'Status', expr: 't.status', type: 'enum', values: STATUSES },
      region: { label: 'Region', expr: 'b.region', join: 'branch', type: 'enum', values: REGIONS },
      branch: { label: 'Branch', expr: 'b.name', join: 'branch', type: 'string' },
      submitted_at: { label: 'Submitted on', expr: 't.submitted_at', type: 'date' },
    },
  },

  transactions: {
    label: 'Transactions',
    description: 'Customer transactions (credits and debits) by channel',
    dimensions: {
      month: { label: 'Month', expr: "strftime('%Y-%m', t.txn_date)", kind: 'time' },
      customer: { label: 'Customer', expr: 'c.name', join: 'customer', kind: 'category' },
      segment: { label: 'Segment', expr: 'c.segment', join: 'customer', kind: 'category' },
      branch: { label: 'Branch', expr: 'b.name', join: 'branch', kind: 'category' },
      region: { label: 'Region', expr: 'b.region', join: 'branch', kind: 'category' },
      type: { label: 'Type', expr: 't.type', kind: 'category' },
      channel: { label: 'Channel', expr: 't.channel', kind: 'category' },
    },
    metrics: {
      transaction_count: { label: 'Transactions', expr: 'COUNT(*)', format: 'integer' },
      total_amount: { label: 'Total amount', expr: 'ROUND(SUM(t.amount), 2)', format: 'currency' },
      avg_amount: { label: 'Average amount', expr: 'ROUND(AVG(t.amount), 2)', format: 'currency' },
      max_amount: { label: 'Largest amount', expr: 'ROUND(MAX(t.amount), 2)', format: 'currency' },
    },
    filters: {
      segment: { label: 'Segment', expr: 'c.segment', join: 'customer', type: 'enum', values: SEGMENTS },
      region: { label: 'Region', expr: 'b.region', join: 'branch', type: 'enum', values: REGIONS },
      branch: { label: 'Branch', expr: 'b.name', join: 'branch', type: 'string' },
      type: { label: 'Type', expr: 't.type', type: 'enum', values: TXN_TYPES },
      channel: { label: 'Channel', expr: 't.channel', type: 'enum', values: CHANNELS },
      txn_date: { label: 'Transaction date', expr: 't.txn_date', type: 'date' },
      amount: { label: 'Amount', expr: 't.amount', type: 'number' },
    },
  },
};

/** Operators allowed for each filter type. */
export const OPS_BY_FILTER_TYPE: Record<FilterType, readonly string[]> = {
  enum: ['eq', 'in'],
  string: ['eq', 'in'],
  date: ['eq', 'gte', 'lte', 'gt', 'lt'],
  number: ['eq', 'gt', 'gte', 'lt', 'lte'],
};

/** Fixed SQL comparison for each op; the op name from the plan is never put into SQL directly. */
export const SQL_OPS = { eq: '=', gt: '>', gte: '>=', lt: '<', lte: '<=' } as const;

/** Compact description of the catalog for the LLM prompt (names only, no SQL). */
export function describeCatalog(): string {
  return (Object.entries(CATALOG) as [TableName, TableDef][])
    .map(([name, def]) => {
      const filters = Object.entries(def.filters)
        .map(([k, f]) => `${k}${f.values ? ` (${f.values.join('|')})` : f.type === 'date' ? ' (YYYY-MM-DD)' : ''}`)
        .join(', ');
      return [
        `table ${name}: ${def.description}`,
        `  metrics: ${Object.keys(def.metrics).join(', ')}`,
        `  dimensions: ${Object.keys(def.dimensions).join(', ')}`,
        `  filters: ${filters}`,
      ].join('\n');
    })
    .join('\n');
}
