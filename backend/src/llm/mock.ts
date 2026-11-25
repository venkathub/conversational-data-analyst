import type { LlmProvider } from './provider.js';

/**
 * Rule-based provider: keyword rules for the example questions plus synonyms.
 * Anything it does not recognise returns an `unsupported` plan. Used when no API key is set,
 * and in tests so everything works offline.
 */

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

const SEGMENT_PATTERNS: ReadonlyArray<readonly [segment: string, pattern: RegExp]> = [
  ['Retail', /\bretail\b/],
  ['SME', /\bsmes?\b|small business/],
  ['Corporate', /\bcorporates?\b|\bcorporation/],
];

type Plan = Record<string, unknown>;

function topN(q: string): number | undefined {
  const m = q.match(/\b(?:top|first|best|highest|bottom)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/);
  if (!m?.[1]) return undefined;
  return NUMBER_WORDS[m[1]] ?? Number(m[1]);
}

function mentionedSegments(q: string): string[] {
  return SEGMENT_PATTERNS.filter(([, p]) => p.test(q)).map(([s]) => s);
}

function unsupported(reason: string): Plan {
  return { kind: 'unsupported', reason };
}

function plan(p: Partial<Plan> & { table: string; metrics: string[] }): Plan {
  return { kind: 'query', dimensions: [], filters: [], ...p };
}

function segmentFilter(segments: string[]): Plan[] {
  return segments.length > 0 ? [{ field: 'segment', op: 'in', value: segments }] : [];
}

function planFor(question: string): Plan {
  const q = question.toLowerCase();

  if (/\b(delete|drop|update|insert|remove|alter|truncate|modify)\b/.test(q)) {
    return unsupported('I can only read and summarise data, not change it.');
  }

  const segments = mentionedSegments(q);
  const wantsMonth = /\bmonth|monthly|trend|over time|time series/.test(q);
  const wantsSegment = /\bsegment|customer type/.test(q) || segments.length > 0 || /\bcompare|\bvs\b|versus/.test(q);
  const n = topN(q);

  // Rejections
  if (/reject/.test(q)) {
    const dim = /region/.test(q) ? 'region' : wantsMonth ? 'month' : /segment/.test(q) ? 'segment' : 'branch';
    const asRate = /rate|ratio|percent|%|highest|lowest|which|worst|best/.test(q);
    return plan({
      table: 'onboarding_applications',
      metrics: [asRate ? 'rejection_rate' : 'rejected_count'],
      dimensions: [dim],
      filters: segmentFilter(segments),
      ...(dim === 'month' ? {} : { sort: { by: asRate ? 'rejection_rate' : 'rejected_count', direction: /lowest|best/.test(q) ? 'asc' : 'desc' } }),
      limit: n ?? 12,
    });
  }

  // Onboarding applications
  if (/onboard|application|sign.?up|new customers/.test(q)) {
    const dims: string[] = [];
    if (wantsMonth) dims.push('month');
    if (wantsSegment) dims.push('segment');
    if (/\bbranch/.test(q) && dims.length < 2) dims.push('branch');
    if (/\bregion/.test(q) && dims.length < 2) dims.push('region');
    const metric = /\bapproved\b|approval/.test(q) ? 'approved_count' : /\bpending\b/.test(q) ? 'pending_count' : 'application_count';
    const sort = dims.includes('month') ? {} : { sort: { by: metric, direction: 'desc' } };
    return plan({ table: 'onboarding_applications', metrics: [metric], dimensions: dims, filters: segmentFilter(segments), ...sort, limit: n ?? 100 });
  }

  // Transactions
  if (/transaction|payment|spend|spent|amount|credit|debit|turnover/.test(q)) {
    const metric = /\bcount\b|how many|number of/.test(q) ? 'transaction_count'
      : /average|avg|mean/.test(q) ? 'avg_amount'
        : /largest|biggest|maximum|\bmax\b/.test(q) && !/customer/.test(q) ? 'max_amount' : 'total_amount';
    const dims: string[] = [];
    if (/customer|client|account holder/.test(q)) dims.push('customer');
    if (wantsMonth) dims.push('month');
    if (/channel|mobile|online/.test(q)) dims.push('channel');
    if (/\bbranch/.test(q) && dims.length < 2) dims.push('branch');
    if (/\bregion/.test(q) && dims.length < 2) dims.push('region');
    if (/\btype\b|credit.*debit|debit.*credit/.test(q) && dims.length < 2) dims.push('type');
    if (dims.length === 0 && segments.length > 0) dims.push('segment');
    const ranked = dims.includes('customer');
    const sort = dims.includes('month') ? {} : { sort: { by: metric, direction: 'desc' } };
    return plan({
      table: 'transactions',
      metrics: [metric],
      dimensions: dims.slice(0, 2),
      filters: dims.includes('customer') ? segmentFilter(segments) : [],
      ...sort,
      limit: n ?? (ranked ? 10 : 100),
    });
  }

  // Customers and branches
  if (/\bhow many branches|\bbranches?\b.*\b(count|number|per region)/.test(q)) {
    return plan({ table: 'branches', metrics: ['branch_count'], dimensions: ['region'], limit: 20 });
  }
  if (/customer/.test(q)) {
    const dim = /region/.test(q) ? 'region' : /\bbranch/.test(q) ? 'branch' : 'segment';
    return plan({ table: 'customers', metrics: ['customer_count'], dimensions: [dim], filters: segmentFilter(segments), sort: { by: 'customer_count', direction: 'desc' }, limit: n ?? 20 });
  }

  return unsupported(
    'That is not something I can find in the banking data (onboarding applications, customers, branches and transactions).',
  );
}

export class MockProvider implements LlmProvider {
  readonly name = 'mock' as const;

  async planQuery(question: string): Promise<unknown> {
    return planFor(question);
  }
}
