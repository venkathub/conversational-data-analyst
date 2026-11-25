import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXAMPLE_QUESTIONS } from '@cda/shared';
import { seedDatabase } from '../db/seed.js';
import { buildSql, execute, parseLlmPlan, validatePlan } from '../query/index.js';
import { MockProvider } from './mock.js';

const mock = new MockProvider();
let db: Database.Database;
beforeAll(() => {
  db = new Database(':memory:');
  seedDatabase(db, 42);
});
afterAll(() => db.close());

async function run(question: string) {
  const raw = parseLlmPlan(await mock.planQuery(question));
  if (raw.kind !== 'query') throw new Error(`unsupported: ${raw.reason}`);
  const validated = validatePlan(raw);
  return { validated, result: execute(db, buildSql(validated)) };
}

describe('MockProvider', () => {
  it('answers all four example questions with valid, executable plans', async () => {
    for (const q of EXAMPLE_QUESTIONS) {
      const { result } = await run(q);
      expect(result.rows.length).toBeGreaterThan(0);
    }
  });

  it('monthly onboarding by segment -> month x segment', async () => {
    const { validated, result } = await run('Show monthly onboarding applications by customer segment');
    expect(validated.dimensions).toEqual(['month', 'segment']);
    expect(result.rows.length).toBe(72); // 24 months x 3 segments
  });

  it('highest rejection rate by branch -> ranked desc', async () => {
    const { validated, result } = await run('Which branches have the highest rejection rate?');
    expect(validated.metrics).toEqual(['rejection_rate']);
    expect(validated.dimensions).toEqual(['branch']);
    const rates = result.rows.map((r) => r.rejection_rate as number);
    expect(rates).toEqual([...rates].sort((a, b) => b - a));
  });

  it('Retail vs SME -> exactly two segments, Retail larger', async () => {
    const { result } = await run('Compare retail and SME onboarding volumes');
    expect(result.rows.map((r) => r.segment).sort()).toEqual(['Retail', 'SME']);
    const by = Object.fromEntries(result.rows.map((r) => [r.segment, r.application_count as number]));
    expect(by.Retail).toBeGreaterThan(by.SME as number);
  });

  it('top five customers by transaction value -> five rows, descending', async () => {
    const { validated, result } = await run('Show the top five customers by transaction value');
    expect(validated.limit).toBe(5);
    expect(result.rows).toHaveLength(5);
    const totals = result.rows.map((r) => r.total_amount as number);
    expect(totals).toEqual([...totals].sort((a, b) => b - a));
  });

  it('understands digits and synonyms', async () => {
    const { validated } = await run('top 3 clients by total payments');
    expect(validated.limit).toBe(3);
    expect(validated.dimensions).toEqual(['customer']);
  });

  it('gives a KPI-shaped plan when there is no grouping', async () => {
    const { validated } = await run('How many onboarding applications are there?');
    expect(validated.dimensions).toEqual([]);
  });

  it.each([
    "What's the weather in Chennai?",
    'Write me a poem',
    'Delete all customers',
    'Drop table transactions',
    '',
  ])('returns unsupported for: %s', async (q) => {
    expect(parseLlmPlan(await mock.planQuery(q)).kind).toBe('unsupported');
  });
});
