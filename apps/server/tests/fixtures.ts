import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach } from 'vitest';
import { openDatabase } from '../src/database/database.ts';
import type { AppDatabase } from '../src/database/database.ts';

export function databaseFixture() {
  const directories: string[] = [];
  const databases: AppDatabase[] = [];
  afterEach(() => {
    databases.forEach((database) => database.close());
    for (const directory of directories) {
      if (
        dirname(resolve(directory)) !== resolve(tmpdir()) ||
        !basename(directory).startsWith('resilient-riches-test-')
      ) {
        throw new Error('Unexpected test directory');
      }
      rmSync(directory, { recursive: true, force: true });
    }
    directories.length = 0;
    databases.length = 0;
  });
  return {
    directory() {
      const directory = mkdtempSync(join(tmpdir(), 'resilient-riches-test-'));
      directories.push(directory);
      return directory;
    },
    open(path = ':memory:') {
      const database = openDatabase(path);
      databases.push(database);
      return database;
    },
  };
}

export function insertCategory(database: AppDatabase, id = 'a') {
  database
    .prepare(
      `INSERT INTO categories (id, name, color, opening_date, opening_balance_minor, historical_pnl_minor)
    VALUES (?, ?, '#b69a60', '2026-09-01', 1000000, 0)`,
    )
    .run(id, `分类${id}`);
}

export function insertEntry(
  database: AppDatabase,
  id = 'entry-a',
  date = '2026-09-01',
  balance = 1010000n,
) {
  database
    .prepare(
      `INSERT INTO daily_entries (id, category_id, date, closing_balance_minor, buy_minor, sell_minor)
    VALUES (?, 'a', ?, ?, 0, 0)`,
    )
    .run(id, date, balance);
}
