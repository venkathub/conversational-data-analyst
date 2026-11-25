import { formatValue, type QueryPlan, type ResultColumn, type ResultRow, type VizType } from '@cda/shared';
import { CATALOG } from '../catalog/index.js';

const MAX_BAR_ROWS = 30;

export function buildColumns(plan: QueryPlan): ResultColumn[] {
  const table = CATALOG[plan.table];
  const dims = plan.dimensions.map((key): ResultColumn => {
    const def = table.dimensions[key];
    return { key, label: def?.label ?? key, role: 'dimension', format: def?.kind === 'time' ? 'month' : 'text' };
  });
  const metrics = plan.metrics.map((key): ResultColumn => {
    const def = table.metrics[key];
    return { key, label: def?.label ?? key, role: 'metric', format: def?.format ?? 'decimal' };
  });
  return [...dims, ...metrics];
}

export function chooseViz(plan: QueryPlan, rows: ResultRow[]): VizType {
  if (rows.length === 0) return 'table';
  const table = CATALOG[plan.table];
  if (plan.dimensions.length === 0) return 'kpi';
  const hasTime = plan.dimensions.some((d) => table.dimensions[d]?.kind === 'time');
  if (hasTime) return rows.length >= 2 ? 'line' : 'table';
  if (plan.dimensions.length === 1 && rows.length >= 2 && rows.length <= MAX_BAR_ROWS) return 'bar';
  return 'table';
}

/** Plain-language summary built from the result itself (no extra LLM call, nothing invented). */
export function composeAnswer(columns: ResultColumn[], rows: ResultRow[], viz: VizType, showTruncationNote: boolean): string {
  if (rows.length === 0) return 'No data matched that question.';
  const metrics = columns.filter((c) => c.role === 'metric');
  const dims = columns.filter((c) => c.role === 'dimension');
  const first = metrics[0];
  const top = rows[0];
  if (!first || !top) return `Found ${rows.length} rows.`;
  const note = showTruncationNote ? ' Only the first rows are shown; narrow the question to see the rest.' : '';
  const fmt = (r: ResultRow, c: ResultColumn): string => formatValue(r[c.key] ?? null, c.format);

  if (viz === 'kpi') {
    return `${metrics.map((m) => `${m.label}: ${fmt(top, m)}`).join('; ')}.${note}`;
  }

  const labelOf = (r: ResultRow): string => dims.map((d) => fmt(r, d)).join(' / ');
  if (viz === 'line') {
    const byTime = new Map<string, number>();
    const timeDim = dims.find((d) => d.format === 'month') ?? dims[0];
    if (timeDim) {
      for (const r of rows) {
        const k = String(r[timeDim.key]);
        byTime.set(k, (byTime.get(k) ?? 0) + Number(r[first.key] ?? 0));
      }
    }
    const months = [...byTime.keys()];
    const peak = [...byTime.entries()].sort((a, b) => b[1] - a[1])[0];
    const range = months.length > 1 ? ` from ${months[0]} to ${months[months.length - 1]}` : '';
    const peakText = peak && first.format === 'integer' ? ` Peak month: ${peak[0]} (${formatValue(peak[1], first.format)} in total).` : '';
    return `${first.label}${range}, ${rows.length} data points.${peakText}${note}`;
  }

  const last = rows[rows.length - 1] ?? top;
  if (rows.length === 1) return `${labelOf(top)}: ${first.label} ${fmt(top, first)}.${note}`;
  return `${labelOf(top)} is first with ${first.label.toLowerCase()} ${fmt(top, first)}; ${labelOf(last)} is last with ${fmt(last, first)}. ${rows.length} rows.${note}`;
}
