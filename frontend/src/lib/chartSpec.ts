import type { CellValue, ColumnFormat, ResultColumn, ResultRow, VizType } from '@cda/shared';

export interface ChartSeries {
  key: string;
  label: string;
}

/** Everything needed to draw (and to export) a bar or line chart. */
export interface ChartSpec {
  type: 'bar' | 'line';
  xKey: string;
  xLabel: string;
  yFormat: ColumnFormat;
  series: ChartSeries[];
  data: Record<string, CellValue>[];
}

/**
 * Shapes API rows into chart data.
 * - bar: one dimension on the x axis, one series per metric.
 * - line: first dimension (time) on the x axis. A second dimension is pivoted into one series per value.
 */
export function buildChartSpec(columns: ResultColumn[], rows: ResultRow[], viz: VizType): ChartSpec | null {
  if (viz !== 'bar' && viz !== 'line') return null;
  const dims = columns.filter((c) => c.role === 'dimension');
  const metrics = columns.filter((c) => c.role === 'metric');
  const x = dims[0];
  const firstMetric = metrics[0];
  if (!x || !firstMetric) return null;

  const second = viz === 'line' ? dims[1] : undefined;
  if (!second) {
    return {
      type: viz,
      xKey: x.key,
      xLabel: x.label,
      yFormat: firstMetric.format,
      series: metrics.map((m) => ({ key: m.key, label: m.label })),
      data: rows.map((r) => ({ [x.key]: r[x.key] ?? null, ...Object.fromEntries(metrics.map((m) => [m.key, r[m.key] ?? null])) })),
    };
  }

  // Pivot: one row per x value, one column per value of the second dimension.
  const seriesKeys: string[] = [];
  const byX = new Map<string, Record<string, CellValue>>();
  for (const r of rows) {
    const xv = String(r[x.key] ?? '');
    const sv = String(r[second.key] ?? '');
    if (!seriesKeys.includes(sv)) seriesKeys.push(sv);
    const point = byX.get(xv) ?? { [x.key]: xv };
    point[sv] = r[firstMetric.key] ?? null;
    byX.set(xv, point);
  }
  return {
    type: 'line',
    xKey: x.key,
    xLabel: x.label,
    yFormat: firstMetric.format,
    series: seriesKeys.map((k) => ({ key: k, label: k })),
    data: [...byX.values()],
  };
}
