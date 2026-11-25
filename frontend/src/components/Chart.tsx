import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatValue, type CellValue } from '@cda/shared';
import type { ChartSpec } from '../lib/chartSpec';

const COLORS = ['#1f5fbf', '#e07a1f', '#2a9d6f', '#8e44ad', '#c0392b', '#16a2b8'];
const HORIZONTAL_BAR_THRESHOLD = 5;

export function Chart({ spec }: { spec: ChartSpec }) {
  const fmt = (v: CellValue) => formatValue(v, spec.yFormat);
  const tooltipFormatter = (value: unknown): string => fmt(typeof value === 'number' || typeof value === 'string' ? value : null);
  const legend = spec.series.length > 1 ? <Legend /> : null;

  if (spec.type === 'line') {
    return (
      <div className="chart" role="img" aria-label={`Line chart of ${spec.series.map((s) => s.label).join(', ')} by ${spec.xLabel}`}>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={spec.data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e3e7ee" />
            <XAxis dataKey={spec.xKey} tick={{ fontSize: 12 }} minTickGap={24} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={tooltipFormatter} width={64} />
            <Tooltip formatter={tooltipFormatter} />
            {legend}
            {spec.series.map((s, i) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const horizontal = spec.data.length > HORIZONTAL_BAR_THRESHOLD;
  const height = horizontal ? Math.max(240, spec.data.length * 32 + 48) : 320;
  return (
    <div className="chart" role="img" aria-label={`Bar chart of ${spec.series.map((s) => s.label).join(', ')} by ${spec.xLabel}`}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={spec.data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e3e7ee" />
          {horizontal ? (
            <>
              <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={tooltipFormatter} />
              <YAxis type="category" dataKey={spec.xKey} width={130} tick={{ fontSize: 12 }} interval={0} />
            </>
          ) : (
            <>
              <XAxis dataKey={spec.xKey} tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={tooltipFormatter} width={64} />
            </>
          )}
          <Tooltip formatter={tooltipFormatter} />
          {legend}
          {spec.series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={COLORS[i % COLORS.length]} radius={[3, 3, 3, 3]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
