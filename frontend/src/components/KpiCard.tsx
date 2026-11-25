import { formatValue, type ResultColumn, type ResultRow } from '@cda/shared';

export function KpiCard({ columns, row }: { columns: ResultColumn[]; row: ResultRow | undefined }) {
  const metrics = columns.filter((c) => c.role === 'metric');
  if (!row) return null;
  return (
    <div className="kpis">
      {metrics.map((m) => (
        <div className="kpi" key={m.key}>
          <div className="kpi-label">{m.label}</div>
          <div className="kpi-value">{formatValue(row[m.key] ?? null, m.format) || '—'}</div>
        </div>
      ))}
    </div>
  );
}
