import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TableName } from '@cda/shared';
import { CATALOG } from '../catalog/index.js';
import { openReadOnly } from '../db/connection.js';
import { seedDatabase } from '../db/seed.js';
import { AppError } from '../errors/AppError.js';
import { buildSql, execute, parseLlmPlan, validatePlan } from './index.js';

const base = {
  kind: 'query',
  table: 'onboarding_applications',
  metrics: ['application_count'],
  dimensions: ['segment'],
  filters: [],
} as const;

const plan = (over: Record<string, unknown> = {}): unknown => ({ ...base, ...over });

function expectRejected(input: unknown, messagePart?: string): void {
  try {
    validatePlan(input);
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    const e = err as AppError;
    expect(e.code).toBe('CANNOT_ANSWER');
    expect(e.status).toBe(422);
    expect(e.message).toMatch(/^I can't answer that: /);
    if (messagePart) expect(e.message).toContain(messagePart);
    return;
  }
  throw new Error('expected validatePlan to reject');
}

let db: Database.Database;
beforeAll(() => {
  db = new Database(':memory:');
  seedDatabase(db, 42);
});
afterAll(() => db.close());

describe('validatePlan rejects strictly', () => {
  it('accepts a valid plan and defaults the limit without clamping', () => {
    expect(validatePlan(plan()).limit).toBe(50);
    expect(validatePlan(plan({ limit: 100 })).limit).toBe(100);
  });

  it('rejects an unknown table', () => expectRejected(plan({ table: 'users' })));
  it('rejects an unknown metric', () => expectRejected(plan({ metrics: ['profit'] }), 'metric'));
  it('rejects an unknown dimension', () => expectRejected(plan({ dimensions: ['salary'] }), 'dimension'));
  it('rejects a metric that belongs to another table', () => expectRejected(plan({ metrics: ['total_amount'] })));
  it('rejects an unknown filter field', () =>
    expectRejected(plan({ filters: [{ field: 'password', op: 'eq', value: 'x' }] }), "can't filter"));
  it('rejects an invalid enum value', () =>
    expectRejected(plan({ filters: [{ field: 'segment', op: 'eq', value: 'Platinum' }] }), 'not a valid value'));
  it('rejects an operator not allowed for the filter type', () =>
    expectRejected(plan({ filters: [{ field: 'segment', op: 'gt', value: 'Retail' }] }), 'operator'));
  it('rejects an impossible date', () =>
    expectRejected(plan({ filters: [{ field: 'submitted_at', op: 'gte', value: '2026-02-30' }] }), 'date'));
  it('rejects a list for a scalar op and a scalar for "in"', () => {
    expectRejected(plan({ filters: [{ field: 'segment', op: 'eq', value: ['Retail'] }] }));
    expectRejected(plan({ filters: [{ field: 'segment', op: 'in', value: 'Retail' }] }));
  });
  it('rejects sort by something not in the result', () =>
    expectRejected(plan({ sort: { by: 'rejection_rate', direction: 'desc' } }), 'sort'));
  it('rejects duplicates and empty metrics', () => {
    expectRejected(plan({ metrics: ['application_count', 'application_count'] }), 'twice');
    expectRejected(plan({ metrics: [] }));
  });
  it('rejects unknown keys (strict schema)', () => expectRejected(plan({ sql: 'SELECT 1' })));
  it('rejects non-object input', () => {
    expectRejected(null);
    expectRejected('SELECT * FROM customers');
  });

  it.each([0, -1, 101, 1000, 1.5])('rejects out-of-range limit %s instead of clamping', (limit) =>
    expectRejected(plan({ limit }), 'limit'),
  );

  it.each([
    "customers; DROP TABLE customers;--",
    "' OR 1=1 --",
    'transactions t JOIN customers',
    '"; DELETE FROM branches; --',
  ])('rejects injection string as identifier: %s', (evil) => {
    expectRejected(plan({ table: evil }));
    expectRejected(plan({ metrics: [evil] }));
    expectRejected(plan({ dimensions: [evil] }));
    expectRejected(plan({ filters: [{ field: evil, op: 'eq', value: 'x' }] }));
    expectRejected(plan({ sort: { by: evil, direction: 'asc' } }));
  });
});

describe('parseLlmPlan', () => {
  it('accepts an unsupported marker', () => {
    expect(parseLlmPlan({ kind: 'unsupported', reason: 'Not about banking data' })).toEqual({
      kind: 'unsupported',
      reason: 'Not about banking data',
    });
  });
  it('rejects garbage and unknown kinds', () => {
    expect(() => parseLlmPlan('hello')).toThrow(AppError);
    expect(() => parseLlmPlan({ kind: 'sql', text: 'DROP TABLE x' })).toThrow(AppError);
  });
});

describe('buildSql', () => {
  it('emits a single parameterised SELECT with a bound LIMIT', () => {
    const q = buildSql(validatePlan(plan({ limit: 5 })));
    expect(q.sql.startsWith('SELECT ')).toBe(true);
    expect(q.sql).not.toContain(';');
    expect(q.sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|PRAGMA|ATTACH)\b/i);
    expect(q.sql.match(/\?/g)).toHaveLength(q.params.length);
    expect(q.params.at(-1)).toBe(6); // limit + 1, to detect truncation
  });

  it('never puts values in the SQL text, even hostile ones', () => {
    const hostile = "x'; DROP TABLE customers; --";
    const q = buildSql(validatePlan({
      kind: 'query', table: 'transactions', metrics: ['total_amount'], dimensions: ['branch'],
      filters: [{ field: 'branch', op: 'eq', value: hostile }, { field: 'amount', op: 'gt', value: 100 }],
    }));
    expect(q.sql).not.toContain('DROP');
    expect(q.sql).not.toContain(hostile);
    expect(q.params).toContain(hostile);
    expect(q.params).toContain(100);
    expect(execute(db, q).rows).toEqual([]);
    expect(db.prepare('SELECT COUNT(*) n FROM customers').get()).toEqual({ n: 300 });
  });

  it('expands "in" lists into one placeholder per value', () => {
    const q = buildSql(validatePlan(plan({ filters: [{ field: 'segment', op: 'in', value: ['Retail', 'SME'] }] })));
    expect(q.sql).toContain('t.segment IN (?, ?)');
    expect(q.params.slice(0, 2)).toEqual(['Retail', 'SME']);
  });

  it('refuses a plan that skipped validation', () => {
    expect(() => buildSql({ ...(base as object), table: 'nope', limit: 5 } as never)).toThrow();
  });

  it('runs every catalog metric x dimension on the seeded database', () => {
    let ran = 0;
    for (const table of Object.keys(CATALOG) as TableName[]) {
      const def = CATALOG[table];
      for (const metric of Object.keys(def.metrics)) {
        for (const dimension of [undefined, ...Object.keys(def.dimensions)]) {
          const q = buildSql(validatePlan({
            kind: 'query', table, metrics: [metric], dimensions: dimension ? [dimension] : [],
          }));
          expect(() => execute(db, q)).not.toThrow();
          ran++;
        }
      }
    }
    expect(ran).toBeGreaterThan(40);
  });

  it('runs every catalog filter with a sample value', () => {
    for (const table of Object.keys(CATALOG) as TableName[]) {
      const def = CATALOG[table];
      const metric = Object.keys(def.metrics)[0] as string;
      for (const [field, f] of Object.entries(def.filters)) {
        const value = f.type === 'number' ? 10 : f.type === 'date' ? '2025-01-01' : (f.values?.[0] ?? 'Chennai');
        const op = f.type === 'date' || f.type === 'number' ? 'gte' : 'eq';
        const q = buildSql(validatePlan({ kind: 'query', table, metrics: [metric], filters: [{ field, op, value }] }));
        expect(() => execute(db, q)).not.toThrow();
      }
    }
  });
});

describe('execute', () => {
  it('flags truncation when more rows exist than the limit', () => {
    const r = execute(db, buildSql(validatePlan(plan({ dimensions: ['month'], limit: 3 }))));
    expect(r.rows).toHaveLength(3);
    expect(r.truncated).toBe(true);
  });

  it('maps database failures to a generic error with no SQL in the message', () => {
    try {
      execute(db, { sql: 'SELECT secret_column FROM nowhere', params: [], limit: 1 });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('INTERNAL');
      expect((err as AppError).message).not.toMatch(/SELECT|nowhere|secret_column/);
    }
  });
});

describe('read-only connection', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cda-')), 'ro.db');
  beforeAll(() => {
    const w = new Database(file);
    seedDatabase(w, 42);
    w.close();
  });
  afterAll(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }));

  it('reads but refuses any write', () => {
    const ro = openReadOnly(file);
    expect(ro.prepare('SELECT COUNT(*) n FROM branches').get()).toEqual({ n: 12 });
    expect(() => ro.exec('DELETE FROM customers')).toThrow(/readonly/i);
    expect(() => ro.exec('DROP TABLE branches')).toThrow(/readonly/i);
    ro.close();
  });
});
