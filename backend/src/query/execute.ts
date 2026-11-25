import type Database from 'better-sqlite3';
import type { ResultRow } from '@cda/shared';
import { AppError } from '../errors/AppError.js';
import type { BuiltQuery } from './buildSql.js';

export interface ExecutionResult {
  rows: ResultRow[];
  truncated: boolean;
}

/** Runs a built query. Any database failure is mapped to a generic error (no SQL in the message). */
export function execute(db: Database.Database, query: BuiltQuery): ExecutionResult {
  try {
    const all = db.prepare(query.sql).all(...query.params) as ResultRow[];
    return { rows: all.slice(0, query.limit), truncated: all.length > query.limit };
  } catch (err) {
    console.error('Query execution failed:', err instanceof Error ? err.message : 'unknown error');
    throw new AppError('INTERNAL', 'The query could not be run. Please try again.');
  }
}
