import Database from 'better-sqlite3';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { EXAMPLE_QUESTIONS, MAX_QUESTION_LENGTH, type AskFailure, type AskSuccess } from '@cda/shared';
import { createApp } from '../app.js';
import { seedDatabase } from '../db/seed.js';
import { AppError } from '../errors/AppError.js';
import { MockProvider } from '../llm/mock.js';
import type { LlmProvider } from '../llm/provider.js';

let db: Database.Database;
beforeAll(() => {
  db = new Database(':memory:');
  seedDatabase(db, 42);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterAll(() => db.close());

const appWith = (provider: LlmProvider, rateLimitPerMinute = 0) => createApp({ db, provider, rateLimitPerMinute });
const mockApp = () => appWith(new MockProvider());
const ask = (app: ReturnType<typeof createApp>, body: unknown) => request(app).post('/api/ask').send(body as object);

const providerReturning = (plan: unknown): LlmProvider => ({ name: 'mock', planQuery: async () => plan });
const providerThrowing = (err: unknown): LlmProvider => ({ name: 'anthropic', planQuery: async () => { throw err; } });

describe('POST /api/ask: the example questions', () => {
  it('monthly onboarding by segment -> line chart, 24 months x 3 segments', async () => {
    const res = await ask(mockApp(), { question: EXAMPLE_QUESTIONS[0] });
    const body = res.body as AskSuccess;
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.viz).toBe('line');
    expect(body.rows).toHaveLength(72);
    expect(body.columns.map((c) => c.key)).toEqual(['month', 'segment', 'application_count']);
    expect(body.answer).toContain('2024-07');
  });

  it('highest rejection rate by branch -> bar chart sorted descending', async () => {
    const body = (await ask(mockApp(), { question: EXAMPLE_QUESTIONS[1] })).body as AskSuccess;
    expect(body.viz).toBe('bar');
    expect(body.rows).toHaveLength(12);
    const rates = body.rows.map((r) => r.rejection_rate as number);
    expect(rates).toEqual([...rates].sort((a, b) => b - a));
    expect(body.columns.at(-1)?.format).toBe('percent');
  });

  it('Retail vs SME -> bar chart with two segments', async () => {
    const body = (await ask(mockApp(), { question: EXAMPLE_QUESTIONS[2] })).body as AskSuccess;
    expect(body.viz).toBe('bar');
    expect(body.rows.map((r) => r.segment).sort()).toEqual(['Retail', 'SME']);
  });

  it('top five customers by transaction value -> five rows without a truncation warning', async () => {
    const body = (await ask(mockApp(), { question: EXAMPLE_QUESTIONS[3] })).body as AskSuccess;
    expect(body.rows).toHaveLength(5);
    expect(body.meta.plan.limit).toBe(5);
    expect(body.answer).not.toContain('Only the first rows');
  });

  it('a single number -> KPI card', async () => {
    const body = (await ask(mockApp(), { question: 'How many onboarding applications are there?' })).body as AskSuccess;
    expect(body.viz).toBe('kpi');
    expect(body.rows).toEqual([{ application_count: 1500 }]);
  });

  it('exposes the plan but never SQL', async () => {
    const res = await ask(mockApp(), { question: EXAMPLE_QUESTIONS[1] });
    expect((res.body as AskSuccess).meta.plan.table).toBe('onboarding_applications');
    expect(res.text).not.toMatch(/SELECT |FROM |GROUP BY/);
  });
});

describe('POST /api/ask: invalid questions and bad requests', () => {
  it('out-of-scope question -> 422 CANNOT_ANSWER with suggestions', async () => {
    const res = await ask(mockApp(), { question: "What's the weather in Chennai?" });
    const body = res.body as AskFailure;
    expect(res.status).toBe(422);
    expect(body.error.code).toBe('CANNOT_ANSWER');
    expect(body.error.suggestions).toEqual([...EXAMPLE_QUESTIONS]);
  });

  it('request to modify data is refused', async () => {
    const res = await ask(mockApp(), { question: 'Delete all customers' });
    expect(res.status).toBe(422);
  });

  it('malformed JSON -> 400 INVALID_REQUEST', async () => {
    const res = await request(mockApp()).post('/api/ask').set('content-type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect((res.body as AskFailure).error.code).toBe('INVALID_REQUEST');
  });

  it.each([
    ['missing question', {}],
    ['empty question', { question: '   ' }],
    ['non-string question', { question: 42 }],
    ['too long', { question: 'a'.repeat(MAX_QUESTION_LENGTH + 1) }],
    ['unexpected field', { question: 'hi', sql: 'DROP TABLE customers' }],
  ])('%s -> 400 INVALID_REQUEST', async (_name, payload) => {
    const res = await ask(mockApp(), payload);
    expect(res.status).toBe(400);
    expect((res.body as AskFailure).error.code).toBe('INVALID_REQUEST');
  });

  it('unknown route -> 404 structured error', async () => {
    const res = await request(mockApp()).get('/api/nope');
    expect(res.status).toBe(404);
    expect((res.body as AskFailure).error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/ask: untrusted LLM output', () => {
  it.each([
    ['unknown table', { kind: 'query', table: 'users', metrics: ['x'] }],
    ['unknown column', { kind: 'query', table: 'transactions', metrics: ['salary'] }],
    ['out-of-range limit', { kind: 'query', table: 'transactions', metrics: ['total_amount'], limit: 5000 }],
    ['raw SQL smuggled in', { kind: 'query', table: 'transactions', metrics: ['total_amount'], sql: 'DROP TABLE customers' }],
    ['not a plan at all', 'SELECT * FROM customers'],
  ])('%s -> 422 and nothing runs', async (_name, plan) => {
    const res = await ask(appWith(providerReturning(plan)), { question: 'anything' });
    expect(res.status).toBe(422);
    expect((res.body as AskFailure).error.code).toBe('CANNOT_ANSWER');
    expect(db.prepare('SELECT COUNT(*) n FROM customers').get()).toEqual({ n: 300 });
  });
});

describe('POST /api/ask: provider failures', () => {
  it.each([
    ['PROVIDER_ERROR', 502],
    ['PROVIDER_TIMEOUT', 504],
    ['RATE_LIMITED', 429],
  ] as const)('%s -> %i with its safe message', async (code, status) => {
    const res = await ask(appWith(providerThrowing(new AppError(code, 'safe message'))), { question: 'q' });
    expect(res.status).toBe(status);
    expect(res.body).toEqual({ ok: false, error: { code, message: 'safe message' } });
  });

  it('unexpected exceptions -> generic 500 with no internals', async () => {
    const res = await ask(appWith(providerThrowing(new Error('boom: SELECT * FROM secrets at /home/x/app.ts:10'))), { question: 'q' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ ok: false, error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } });
    expect(res.text).not.toMatch(/boom|SELECT|secrets|\.ts|stack/i);
  });
});

describe('platform behaviour', () => {
  it('GET /api/health reports the provider', async () => {
    const res = await request(mockApp()).get('/api/health');
    expect(res.body).toEqual({ ok: true, provider: 'mock' });
  });

  it('sets security headers and hides x-powered-by', async () => {
    const res = await request(mockApp()).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('rate limits /api/ask per client', async () => {
    const app = appWith(new MockProvider(), 2);
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) statuses.push((await ask(app, { question: EXAMPLE_QUESTIONS[0] })).status);
    expect(statuses).toEqual([200, 200, 429]);
  });
});
