import { formatValue, type ResultColumn, type ResultRow } from '@cda/shared';

export function ResultTable({ columns, rows }: { columns: ResultColumn[]; rows: ResultRow[] }) {
  if (rows.length === 0) return <p className="muted">No rows.</p>;
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label="Result table">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.role === 'metric' ? 'num' : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key} className={c.role === 'metric' ? 'num' : undefined}>
                  {formatValue(r[c.key] ?? null, c.format)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
