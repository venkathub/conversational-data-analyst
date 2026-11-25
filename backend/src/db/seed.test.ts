import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateData, seedDatabase } from './seed.js';

let db: Database.Database;

beforeAll(() => {
  db = new Database(':memory:');
  seedDatabase(db, 42);
});
afterAll(() => db.close());

const count = (sql: string): number => (db.prepare(sql).get() as { n: number }).n;

describe('seed data', () => {
  it('produces the specified volumes', () => {
    expect(count('SELECT COUNT(*) n FROM branches')).toBe(12);
    expect(count('SELECT COUNT(*) n FROM customers')).toBe(300);
    expect(count('SELECT COUNT(*) n FROM onboarding_applications')).toBe(1500);
    expect(count('SELECT COUNT(*) n FROM transactions')).toBe(8000);
  });

  it('has roughly 60/30/10 customer segments', () => {
    const rows = db.prepare('SELECT segment, COUNT(*) n FROM customers GROUP BY segment').all() as { segment: string; n: number }[];
    const by = Object.fromEntries(rows.map((r) => [r.segment, r.n]));
    expect(by).toEqual({ Retail: 180, SME: 90, Corporate: 30 });
  });

  it('has no foreign key violations', () => {
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('never has a transaction before the customer joined', () => {
    expect(count('SELECT COUNT(*) n FROM transactions t JOIN customers c ON c.id = t.customer_id WHERE t.txn_date < c.joined_on')).toBe(0);
  });

  it('only gives transactions to customers with an approved application', () => {
    expect(count(`SELECT COUNT(*) n FROM transactions t WHERE NOT EXISTS (
      SELECT 1 FROM onboarding_applications a WHERE a.customer_id = t.customer_id AND a.status = 'Approved')`)).toBe(0);
  });

  it('keeps decided_at consistent with status', () => {
    expect(count(`SELECT COUNT(*) n FROM onboarding_applications WHERE status = 'Pending' AND decided_at IS NOT NULL`)).toBe(0);
    expect(count(`SELECT COUNT(*) n FROM onboarding_applications WHERE status <> 'Pending' AND (decided_at IS NULL OR decided_at < submitted_at)`)).toBe(0);
  });

  it('gives branches distinct rejection rates with a clear spread', () => {
    const rows = db.prepare(`SELECT branch_id, 1.0 * SUM(status = 'Rejected') / SUM(status <> 'Pending') AS rate
      FROM onboarding_applications GROUP BY branch_id ORDER BY rate DESC`).all() as { rate: number }[];
    expect(rows).toHaveLength(12);
    expect(rows[0]!.rate - rows[11]!.rate).toBeGreaterThan(0.2);
  });

  it('has Retail volume clearly above SME', () => {
    const n = (seg: string): number => count(`SELECT COUNT(*) n FROM onboarding_applications WHERE segment = '${seg}'`);
    expect(n('Retail')).toBeGreaterThan(n('SME') * 1.5);
  });

  it('is idempotent: reseeding the same database gives the same totals', () => {
    const before = count('SELECT COUNT(*) n FROM transactions');
    seedDatabase(db, 42);
    expect(count('SELECT COUNT(*) n FROM transactions')).toBe(before);
  });
});

describe('determinism', () => {
  it('same seed gives identical data', () => {
    expect(generateData(7)).toEqual(generateData(7));
  });

  it('different seeds give different data', () => {
    const a = generateData(1).transactions.reduce((s, t) => s + t.amount, 0);
    const b = generateData(2).transactions.reduce((s, t) => s + t.amount, 0);
    expect(a).not.toBe(b);
  });

  it('seed 42 produces fixed headline numbers', () => {
    const d = generateData(42);
    expect(d.transactions.reduce((s, t) => s + t.amount, 0).toFixed(2)).toBe('69255675.85');
    expect(d.applications.filter((a) => a.status === 'Rejected')).toHaveLength(305);
  });
});
});
