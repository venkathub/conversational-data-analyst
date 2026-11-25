import Database from 'better-sqlite3';

/** Query-time handle: read-only, so even a bug in the builder cannot modify data. */
export function openReadOnly(dbPath: string): Database.Database {
  return new Database(dbPath, { readonly: true, fileMustExist: true });
}
