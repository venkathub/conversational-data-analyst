import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { loadConfig } from '../config.js';
import { Rng } from './prng.js';

/**
 * Deterministic synthetic banking data. Same seed => identical rows.
 * No network, no LLM. Dates are fixed relative to REFERENCE_DATE, not "today".
 */

export type Segment = 'Retail' | 'SME' | 'Corporate';
export type Status = 'Approved' | 'Rejected' | 'Pending';

interface BranchRow { id: number; name: string; city: string; region: string; opened_on: string }
interface CustomerRow { id: number; name: string; segment: Segment; branch_id: number; joined_on: string }
interface ApplicationRow {
  id: number; customer_id: number; branch_id: number; segment: Segment;
  status: Status; submitted_at: string; decided_at: string | null;
}
interface TransactionRow {
  id: number; customer_id: number; branch_id: number; amount: number;
  type: 'Credit' | 'Debit'; channel: 'Branch' | 'Online' | 'Mobile'; txn_date: string;
}

export interface GeneratedData {
  branches: BranchRow[];
  customers: CustomerRow[];
  applications: ApplicationRow[];
  transactions: TransactionRow[];
}

export const REFERENCE_DATE = '2026-06-30';
const WINDOW_MONTHS = 24;
const DAY_MS = 86_400_000;

const BRANCHES: ReadonlyArray<readonly [name: string, city: string, region: string]> = [
  ['Central Square', 'Chennai', 'South'], ['Marina Point', 'Chennai', 'South'], ['Tech Park', 'Bengaluru', 'South'],
  ['Connaught Place', 'Delhi', 'North'], ['Sector 17', 'Chandigarh', 'North'], ['Hazratganj', 'Lucknow', 'North'],
  ['Park Street', 'Kolkata', 'East'], ['Salt Lake', 'Kolkata', 'East'], ['Bhubaneswar Main', 'Bhubaneswar', 'East'],
  ['Nariman Point', 'Mumbai', 'West'], ['FC Road', 'Pune', 'West'], ['CG Road', 'Ahmedabad', 'West'],
];

const FIRST_NAMES = ['Aarav', 'Vivaan', 'Aditya', 'Arjun', 'Rohan', 'Karthik', 'Sanjay', 'Rahul', 'Vikram', 'Nikhil',
  'Ananya', 'Diya', 'Isha', 'Kavya', 'Meera', 'Neha', 'Priya', 'Riya', 'Sneha', 'Divya',
  'Harish', 'Lakshmi', 'Manoj', 'Pooja', 'Ramesh', 'Sunita', 'Tarun', 'Uma', 'Varun', 'Yamini'];
const SURNAMES = ['Sharma', 'Verma', 'Iyer', 'Nair', 'Reddy', 'Patel', 'Gupta', 'Singh', 'Das', 'Banerjee',
  'Mehta', 'Joshi', 'Kulkarni', 'Menon', 'Pillai', 'Chopra', 'Kapoor', 'Malhotra', 'Bose', 'Rao',
  'Naidu', 'Shetty', 'Desai', 'Agarwal', 'Mishra', 'Tiwari', 'Saxena', 'Bhatt', 'Ghosh', 'Chatterjee',
  'Jain', 'Khanna', 'Sethi', 'Thakur', 'Yadav', 'Pandey', 'Hegde', 'Krishnan', 'Subramanian', 'Venkat'];
const SME_SUFFIXES = ['Traders', 'Enterprises', 'Supplies', 'Studio', 'Works'];
const CORP_SUFFIXES = ['Holdings', 'Group', 'Industries', 'Logistics'];

interface SegmentProfile {
  share: number;          // share of customers
  trend: number;          // monthly volume growth
  seasonAmplitude: number;
  seasonPhase: number;
  txnMedian: number;      // log-normal median transaction amount
  txnSigma: number;
  txnFrequency: number;   // relative transaction frequency per customer
}

const PROFILES: Record<Segment, SegmentProfile> = {
  Retail: { share: 0.6, trend: 0.025, seasonAmplitude: 0.2, seasonPhase: 0, txnMedian: 150, txnSigma: 1.0, txnFrequency: 1 },
  SME: { share: 0.3, trend: 0.015, seasonAmplitude: 0.25, seasonPhase: 3, txnMedian: 1500, txnSigma: 1.1, txnFrequency: 2 },
  Corporate: { share: 0.1, trend: 0.01, seasonAmplitude: 0.15, seasonPhase: 6, txnMedian: 15000, txnSigma: 1.2, txnFrequency: 4 },
};
const SEGMENTS: Segment[] = ['Retail', 'SME', 'Corporate'];

const N_CUSTOMERS = 300;
const N_APPLICATIONS = 1500;
const N_TRANSACTIONS = 8000;

// ---- date helpers (UTC day numbers) ----
const toDay = (iso: string): number => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
const toIso = (day: number): string => new Date(day * DAY_MS).toISOString().slice(0, 10);

/** First day of the month `monthIndex` (0 = oldest) in the 24-month window ending at REFERENCE_DATE. */
function monthStart(monthIndex: number): { day: number; length: number } {
  const ref = new Date(`${REFERENCE_DATE}T00:00:00Z`);
  const first = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - (WINDOW_MONTHS - 1) + monthIndex, 1);
  const next = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - (WINDOW_MONTHS - 1) + monthIndex + 1, 1);
  return { day: first / DAY_MS, length: (next - first) / DAY_MS };
}

function uniqueName(used: Set<string>, make: () => string): string {
  for (let i = 0; i < 1000; i++) {
    const name = make();
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  throw new Error('Could not generate a unique name');
}

export function generateData(seed: number): GeneratedData {
  const rng = new Rng(seed);
  const refDay = toDay(REFERENCE_DATE);

  // ---- branches: spaced rejection rates (5%..35%), shuffled so the ranking is not by id ----
  const rejectionRates = rng.shuffle(BRANCHES.map((_, i) => 0.05 + (0.3 * i) / (BRANCHES.length - 1)));
  const branches: BranchRow[] = BRANCHES.map(([name, city, region], i) => ({
    id: i + 1, name, city, region,
    opened_on: toIso(toDay('2004-01-01') + rng.int(0, 16 * 365)),
  }));

  // ---- customers (joined_on is filled in after applications exist) ----
  const usedNames = new Set<string>();
  const customerSegments: Segment[] = [];
  SEGMENTS.forEach((seg) => {
    const count = Math.round(N_CUSTOMERS * PROFILES[seg].share);
    for (let i = 0; i < count; i++) customerSegments.push(seg);
  });
  const customers: CustomerRow[] = customerSegments.map((segment, i) => {
    const surname = (): string => rng.pick(SURNAMES);
    const name = uniqueName(usedNames, () =>
      segment === 'Retail' ? `${rng.pick(FIRST_NAMES)} ${surname()}`
        : segment === 'SME' ? `${surname()} ${rng.pick(SME_SUFFIXES)}`
          : `${surname()} ${rng.pick(CORP_SUFFIXES)}`);
    return { id: i + 1, name, segment, branch_id: rng.int(1, branches.length), joined_on: REFERENCE_DATE };
  });

  // ---- applications ----
  const monthWeights = (seg: Segment): number[] => {
    const p = PROFILES[seg];
    return Array.from({ length: WINDOW_MONTHS }, (_, m) =>
      (1 + p.trend * m) * (1 + p.seasonAmplitude * Math.sin((2 * Math.PI * (m + p.seasonPhase)) / 12)));
  };
  const weightsBySegment = new Map(SEGMENTS.map((s) => [s, monthWeights(s)] as const));
  const customersBySegment = new Map(SEGMENTS.map((s) => [s, customers.filter((c) => c.segment === s)] as const));

  // Segment of each application: proportional to customer share (exact counts).
  const appSegments: Segment[] = [];
  SEGMENTS.forEach((seg, idx) => {
    const count = idx === SEGMENTS.length - 1
      ? N_APPLICATIONS - appSegments.length
      : Math.round(N_APPLICATIONS * PROFILES[seg].share);
    for (let i = 0; i < count; i++) appSegments.push(seg);
  });

  const segmentCursor = new Map<Segment, number>();
  const applications: ApplicationRow[] = appSegments.map((segment, i) => {
    const pool = customersBySegment.get(segment) ?? [];
    // First pass gives every customer one application; the rest are random repeat applications.
    const cursor = segmentCursor.get(segment) ?? 0;
    segmentCursor.set(segment, cursor + 1);
    const customer = cursor < pool.length ? pool[cursor] : rng.pick(pool);
    if (!customer) throw new Error('No customer for segment');

    const month = monthStart(rng.weightedIndex(weightsBySegment.get(segment) ?? []));
    const submittedDay = month.day + rng.int(0, month.length - 1);
    const rejectRate = rejectionRates[customer.branch_id - 1] ?? 0.2;

    let status: Status;
    let decidedDay: number | null = null;
    const decisionDay = submittedDay + rng.int(1, 14);
    const recent = refDay - submittedDay <= 45;
    if (decisionDay > refDay || (recent && rng.next() < 0.4)) {
      status = 'Pending';
    } else {
      status = rng.next() < rejectRate ? 'Rejected' : 'Approved';
      decidedDay = decisionDay;
    }
    return {
      id: i + 1, customer_id: customer.id, branch_id: customer.branch_id, segment,
      status, submitted_at: toIso(submittedDay), decided_at: decidedDay === null ? null : toIso(decidedDay),
    };
  });

  // Customer record is created at first application.
  const firstSubmitted = new Map<number, string>();
  for (const a of applications) {
    const prev = firstSubmitted.get(a.customer_id);
    if (prev === undefined || a.submitted_at < prev) firstSubmitted.set(a.customer_id, a.submitted_at);
  }
  for (const c of customers) c.joined_on = firstSubmitted.get(c.id) ?? REFERENCE_DATE;

  // ---- transactions: only customers with an approved application, only after approval ----
  const firstApproval = new Map<number, number>();
  for (const a of applications) {
    if (a.status !== 'Approved' || a.decided_at === null) continue;
    const d = toDay(a.decided_at);
    const prev = firstApproval.get(a.customer_id);
    if (prev === undefined || d < prev) firstApproval.set(a.customer_id, d);
  }
  const active = customers.filter((c) => firstApproval.has(c.id));
  // Skewed activity: log-normal weight x segment frequency, so a few customers dominate.
  const activityWeights = active.map((c) => rng.logNormal(1, 0.9) * PROFILES[c.segment].txnFrequency);
  const cumulative: number[] = [];
  activityWeights.reduce((acc, w, i) => (cumulative[i] = acc + w), 0);
  const totalWeight = cumulative[cumulative.length - 1] ?? 0;

  const transactions: TransactionRow[] = [];
  for (let i = 0; i < N_TRANSACTIONS; i++) {
    const target = rng.next() * totalWeight;
    let lo = 0;
    let hi = cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((cumulative[mid] ?? 0) > target) hi = mid; else lo = mid + 1;
    }
    const customer = active[lo];
    if (!customer) throw new Error('No active customer');
    const start = firstApproval.get(customer.id) ?? refDay;
    const profile = PROFILES[customer.segment];
    transactions.push({
      id: i + 1, customer_id: customer.id, branch_id: customer.branch_id,
      amount: Math.max(1, Math.round(rng.logNormal(profile.txnMedian, profile.txnSigma) * 100) / 100),
      type: rng.next() < 0.45 ? 'Credit' : 'Debit',
      channel: (['Branch', 'Online', 'Mobile'] as const)[rng.weightedIndex([0.25, 0.4, 0.35])] ?? 'Online',
      txn_date: toIso(start + rng.int(0, Math.max(0, refDay - start))),
    });
  }

  return { branches, customers, applications, transactions };
}

const TABLES_DROP_ORDER = ['transactions', 'onboarding_applications', 'customers', 'branches'];

function readSchema(): string {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8');
}

/** Drops and recreates all tables, then inserts generated data, in one transaction. Idempotent. */
export function seedDatabase(db: Database.Database, seed: number): GeneratedData {
  const data = generateData(seed);
  db.pragma('foreign_keys = ON');
  const schema = readSchema();

  const run = db.transaction(() => {
    for (const t of TABLES_DROP_ORDER) db.exec(`DROP TABLE IF EXISTS ${t}`);
    db.exec(schema);

    const insertAll = <T extends object>(table: string, rows: T[]): void => {
      const first = rows[0];
      if (!first) return;
      const cols = Object.keys(first);
      const stmt = db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => `@${c}`).join(', ')})`);
      for (const row of rows) stmt.run(row);
    };
    insertAll('branches', data.branches);
    insertAll('customers', data.customers);
    insertAll('onboarding_applications', data.applications);
    insertAll('transactions', data.transactions);
  });
  run();
  return data;
}

function main(): void {
  const config = loadConfig();
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  const db = new Database(config.dbPath);
  try {
    const data = seedDatabase(db, config.seed);
    console.log(
      `Seeded ${config.dbPath} (seed ${config.seed}): ${data.branches.length} branches, ${data.customers.length} customers, ` +
      `${data.applications.length} applications, ${data.transactions.length} transactions`,
    );
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
