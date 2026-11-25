import type { ResultColumn, ResultRow } from '@cda/shared';
import type { ChartSpec } from './chartSpec';

/** Prevents spreadsheet apps from treating pasted text as a formula. */
function safeText(value: string): string {
  const flat = value.replace(/[\t\r\n]+/g, ' ');
  return /^[=+\-@]/.test(flat) ? `'${flat}` : flat;
}

/** Tab-separated values: header row of labels, then raw (unformatted) values so spreadsheets can compute on them. */
export function toTsv(columns: ResultColumn[], rows: ResultRow[]): string {
  const header = columns.map((c) => safeText(c.label)).join('\t');
  const body = rows.map((r) =>
    columns
      .map((c) => {
        const v = r[c.key];
        if (v === null || v === undefined) return '';
        return typeof v === 'number' ? String(v) : safeText(v);
      })
      .join('\t'),
  );
  return [header, ...body].join('\n');
}

/** The chart exactly as drawn: type, axes, series and data points. */
export function toChartJson(spec: ChartSpec): string {
  return JSON.stringify(spec, null, 2);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for non-secure contexts or denied permission.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      document.body.removeChild(area);
    }
  }
}
