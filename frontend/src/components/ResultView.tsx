import type { AskSuccess } from '@cda/shared';
import { buildChartSpec } from '../lib/chartSpec';
import { Chart } from './Chart';
import { KpiCard } from './KpiCard';
import { ResultTable } from './ResultTable';

export function ResultView({ response }: { response: AskSuccess }) {
  const spec = buildChartSpec(response.columns, response.rows, response.viz);
  return (
    <div className="result">
      <p className="answer">{response.answer}</p>
      {response.viz === 'kpi' && <KpiCard columns={response.columns} row={response.rows[0]} />}
      {spec && <Chart spec={spec} />}
      {(response.viz === 'table' || response.viz === 'bar' || response.viz === 'line') && response.rows.length > 0 && (
        <details className="data-details" open={response.viz === 'table'}>
          <summary>{response.viz === 'table' ? 'Data' : `Data (${response.rows.length} rows)`}</summary>
          <ResultTable columns={response.columns} rows={response.rows} />
        </details>
      )}
      <details className="plan-details">
        <summary>How this was answered</summary>
        <p className="muted small">
          The assistant produced this structured plan, which the server validated before building a read-only query.
        </p>
        <pre>{JSON.stringify(response.meta.plan, null, 2)}</pre>
      </details>
    </div>
  );
}
