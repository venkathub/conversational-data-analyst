import type { ResultColumn, ResultRow } from '@cda/shared';
import { describe, expect, it } from 'vitest';
import { buildChartSpec } from './chartSpec';
import { toChartJson, toTsv } from './copy';

const columns: ResultColumn[] = [
  { key: 'branch', label: 'Branch', role: 'dimension', format: 'text' },
  { key: 'rejection_rate', label: 'Rejection rate', role: 'metric', format: 'percent' },
];

describe('toTsv', () => {
  it('writes a header row and raw values separated by tabs', () => {
    const rows: ResultRow[] = [{ branch: 'Sector 17', rejection_rate: 0.375 }, { branch: 'Park Street', rejection_rate: null }];
    expect(toTsv(columns, rows)).toBe('Branch\tRejection rate\nSector 17\t0.375\nPark Street\t');
  });

  it('flattens tabs and newlines inside cells so rows stay aligned', () => {
    expect(toTsv(columns, [{ branch: 'A\tB\nC', rejection_rate: 1 }])).toBe('Branch\tRejection rate\nA B C\t1');
  });

  it('neutralises spreadsheet formulas in text cells but keeps negative numbers', () => {
    const out = toTsv(columns, [{ branch: '=HYPERLINK("http://x")', rejection_rate: -0.5 }]);
    expect(out.split('\n')[1]).toBe(`'=HYPERLINK("http://x")\t-0.5`);
  });
});

describe('toChartJson', () => {
  it('round-trips the chart spec', () => {
    const spec = buildChartSpec(columns, [{ branch: 'Sector 17', rejection_rate: 0.375 }, { branch: 'Salt Lake', rejection_rate: 0.07 }], 'bar');
    expect(spec).not.toBeNull();
    const parsed = JSON.parse(toChartJson(spec!)) as { type: string; xKey: string; data: unknown[] };
    expect(parsed.type).toBe('bar');
    expect(parsed.xKey).toBe('branch');
    expect(parsed.data).toHaveLength(2);
  });
});
