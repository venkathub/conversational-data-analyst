import { CATALOG, JOINS, SQL_OPS, type DimensionDef, type JoinName, type MetricDef } from '../catalog/index.js';
import type { ValidatedPlan } from './validatePlan.js';

export type SqlParam = string | number;

export interface BuiltQuery {
  sql: string;
  params: SqlParam[];
  /** Rows the caller asked for. The SQL fetches limit + 1 so truncation can be detected. */
  limit: number;
}

/** Returns the catalog's own key and definition, so SQL text never contains plan-supplied strings. */
function lookup<T>(record: Record<string, T>, key: string): [string, T] {
  const entry = Object.entries(record).find(([k]) => k === key);
  if (!entry) throw new Error('buildSql received a plan that was not validated');
  return entry;
}

/**
 * Builds a parameterised SELECT from a validated plan. Identifiers and expressions come only
 * from the catalog; every value is a bound parameter (including LIMIT).
 */
export function buildSql(plan: ValidatedPlan): BuiltQuery {
  const [tableName, table] = lookup(CATALOG, plan.table);
  const dims = plan.dimensions.map((d) => lookup<DimensionDef>(table.dimensions, d));
  const metrics = plan.metrics.map((m) => lookup<MetricDef>(table.metrics, m));

  const params: SqlParam[] = [];
  const where: string[] = [];
  const joins = new Set<JoinName>();
  dims.forEach(([, d]) => d.join && joins.add(d.join));

  for (const f of plan.filters) {
    const [, def] = lookup(table.filters, f.field);
    if (def.join) joins.add(def.join);
    if (f.op === 'in') {
      const values = f.value as string[];
      where.push(`${def.expr} IN (${values.map(() => '?').join(', ')})`);
      params.push(...values);
    } else {
      where.push(`${def.expr} ${SQL_OPS[f.op]} ?`);
      params.push(f.value as SqlParam);
    }
  }

  const select = [
    ...dims.map(([name, d]) => `${d.expr} AS "${name}"`),
    ...metrics.map(([name, m]) => `${m.expr} AS "${name}"`),
  ].join(', ');

  const orderBy: string[] = [];
  if (plan.sort) {
    const [by] = [...dims, ...metrics].find(([name]) => name === plan.sort?.by) ?? [];
    if (!by) throw new Error('buildSql received a plan that was not validated');
    orderBy.push(`"${by}" ${plan.sort.direction === 'asc' ? 'ASC' : 'DESC'}`);
  } else if (dims.some(([, d]) => d.kind === 'time')) {
    dims.filter(([, d]) => d.kind === 'time').forEach(([name]) => orderBy.push(`"${name}" ASC`));
  } else if (metrics[0]) {
    orderBy.push(`"${metrics[0][0]}" DESC`);
  }
  // Deterministic tie-breaking.
  dims.forEach(([name]) => {
    if (!orderBy.some((o) => o.startsWith(`"${name}" `))) orderBy.push(`"${name}" ASC`);
  });

  const sql = [
    `SELECT ${select}`,
    `FROM ${tableName} t`,
    ...(['branch', 'customer'] as const).filter((j) => joins.has(j)).map((j) => JOINS[j]),
    where.length > 0 ? `WHERE ${where.join(' AND ')}` : '',
    dims.length > 0 ? `GROUP BY ${dims.map(([, d]) => d.expr).join(', ')}` : '',
    orderBy.length > 0 ? `ORDER BY ${orderBy.join(', ')}` : '',
    'LIMIT ?',
  ]
    .filter(Boolean)
    .join('\n');

  params.push(plan.limit + 1);
  return { sql, params, limit: plan.limit };
}
