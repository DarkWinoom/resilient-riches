import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrations } from './migrations.ts';
import type { Migration } from './migrations.ts';

export function openDatabase(filename: string, steps: readonly Migration[] = migrations) {
  const path = filename === ':memory:' ? filename : resolve(filename);
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const connection = new DatabaseSync(path, { timeout: 5000, enableForeignKeyConstraints: true });
  const database = {
    connection,
    prepare(sql: string) {
      const statement = connection.prepare(sql);
      statement.setReadBigInts(true);
      return statement;
    },
    transaction<T>(work: () => T): T {
      if (connection.isTransaction) throw new Error('Nested transactions are not supported');
      connection.exec('BEGIN IMMEDIATE');
      try {
        const result = work();
        if (result instanceof Promise)
          throw new Error('SQLite transactions require synchronous work');
        connection.exec('COMMIT');
        return result;
      } catch (error) {
        connection.exec('ROLLBACK');
        throw error;
      }
    },
    close() {
      if (connection.isOpen) connection.close();
    },
  };
  try {
    connection.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
    migrateDatabase(database, steps);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export type AppDatabase = ReturnType<typeof openDatabase>;

export function migrateDatabase(
  database: AppDatabase,
  steps: readonly Migration[] = migrations,
): void {
  const versions = steps.map((step) => step.version);
  if (versions.some((version, index) => !Number.isSafeInteger(version) || version !== index + 1)) {
    throw new Error('Migration versions must be consecutive and start at 1');
  }
  database.transaction(() => {
    database.connection.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY CHECK (version BETWEEN 1 AND 2147483647),
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ) STRICT`);
    const applied = database
      .prepare('SELECT version, name, checksum FROM schema_migrations ORDER BY version')
      .all();
    for (const row of applied) {
      const migration = steps.find((step) => BigInt(step.version) === row.version);
      if (!migration || migration.name !== row.name || checksum(migration) !== row.checksum) {
        throw new Error(`Unknown or modified migration: ${String(row.version)}`);
      }
    }
    for (const migration of steps) {
      if (applied.some((row) => row.version === BigInt(migration.version))) continue;
      database.connection.exec(migration.sql);
      database
        .prepare('INSERT INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)')
        .run(migration.version, migration.name, checksum(migration));
    }
  });
}

function checksum(migration: Migration): string {
  return createHash('sha256').update(migration.sql).digest('hex');
}

export function schemaVersion(database: AppDatabase): number {
  const result = database
    .prepare('SELECT coalesce(max(version), 0) AS version FROM schema_migrations')
    .get();
  return Number(result?.version ?? 0n);
}
