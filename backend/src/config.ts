import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Loads backend/.env if present. Values are never logged.
dotenv.config({ path: path.join(backendDir, '.env') });

export interface Config {
  port: number;
  dbPath: string;
  seed: number;
  anthropicApiKey: string | undefined;
  anthropicModel: string;
}

function parseIntEnv(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`Invalid ${name}: expected a non-negative integer`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dbPath = env.DB_PATH?.trim() ? env.DB_PATH.trim() : 'data/bank.db';
  const key = env.ANTHROPIC_API_KEY?.trim();
  return {
    port: parseIntEnv('PORT', env.PORT, 3001),
    dbPath: path.resolve(backendDir, dbPath),
    seed: parseIntEnv('SEED', env.SEED, 42),
    anthropicApiKey: key ? key : undefined,
    anthropicModel: env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5-5',
  };
}
