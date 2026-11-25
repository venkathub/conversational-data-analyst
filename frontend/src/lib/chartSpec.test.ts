import type { ResultColumn, ResultRow } from '@cda/shared';
import { describe, expect, it } from 'vitest';
import { buildChartSpec } from './chartSpec';

const month: ResultColumn = { key: 'month', label: 'Month', role: 'dimension', format: 'month' };
const segment: ResultColumn = { key: 'segment', label: 'Segment', role: 'dimension', format: 'text' };
const count: ResultColumn = { key: 'application_count', label: 'Applications', role: 'metric', format: 'integer' };

describe('buildChartSpec', () => {
  it('pivots a second dimension into one series per value for line charts', () => {
    const rows: ResultRow[] = [
      { month: '2025-01', segment: 'Retail', application_count: 10 },
      { month: '2025-01', segment: 'SME', application_count: 4 },
      { month: '2025-02', segment: 'Retail', application_count: 12 },
      { month: '2025-02', segment: 'SME', application_count: 5 },
    ];
    const spec = buildChartSpec([month, segment, count], rows, 'line');
    expect(spec?.series.map((s) => s.key)).toEqual(['Retail', 'SME']);
    expect(spec?.data).toEqual([
      { month: '2025-01', Retail: 10, SME: 4 },
      { month: '2025-02', Retail: 12, SME: 5 },
    ]);
  });

  it('uses one series per metric when there is a single dimension', () => {
    const rows: ResultRow[] = [{ segment: 'Retail', application_count: 900 }, { segment: 'SME', application_count: 450 }];
    const spec = buildChartSpec([segment, count], rows, 'bar');
    expect(spec).toMatchObject({ type: 'bar', xKey: 'segment', yFormat: 'integer' });
    expect(spec?.series).toEqual([{ key: 'application_count', label: 'Applications' }]);
    expect(spec?.data).toHaveLength(2);
  });

  it('returns null for non-chart visualisations', () => {
    expect(buildChartSpec([count], [{ application_count: 1 }], 'kpi')).toBeNull();
    expect(buildChartSpec([segment, count], [], 'table')).toBeNull();
  });
});
