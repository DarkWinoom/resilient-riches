import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrateDatabase, schemaVersion } from '../src/database/database.ts';
import { migrations } from '../src/database/migrations.ts';
import { databaseFixture, insertCategory, insertEntry } from './fixtures.ts';

describe('SQLite persistence and constraints', () => {
  const fixture = databaseFixture();
  it('migrates an empty database and reopens without losing data', () => {
    const path = join(fixture.directory(), 'ledger.sqlite');
    const first = fixture.open(path);
    insertCategory(first);
    insertEntry(first);
    expect(schemaVersion(first)).toBe(1);
    expect(first.prepare('PRAGMA journal_mode').get()?.journal_mode).toBe('wal');
    expect(first.prepare('PRAGMA foreign_keys').get()?.foreign_keys).toBe(1n);
    first.close();
    const second = fixture.open(path);
    expect(
      second.prepare('SELECT closing_balance_minor FROM daily_entries').get()
        ?.closing_balance_minor,
    ).toBe(1010000n);
    expect(second.prepare('SELECT count(*) AS count FROM schema_migrations').get()?.count).toBe(1n);
    expect(second.prepare('SELECT currency, timezone FROM app_settings').get()).toMatchObject({
      currency: 'CNY',
      timezone: 'Asia/Shanghai',
    });
  });
  it('rolls back the entire transaction if any write fails', () => {
    const database = fixture.open();
    insertCategory(database);
    expect(() =>
      database.transaction(() => {
        insertEntry(database);
        insertEntry(database, 'duplicate-date');
      }),
    ).toThrow();
    expect(database.prepare('SELECT count(*) AS count FROM daily_entries').get()?.count).toBe(0n);
    expect(database.connection.isTransaction).toBe(false);
    database.transaction(() => insertEntry(database));
    expect(database.prepare('SELECT count(*) AS count FROM daily_entries').get()?.count).toBe(1n);
  });
  it('rejects duplicate days, missing foreign keys and invalid dates', () => {
    const database = fixture.open();
    expect(() => insertEntry(database)).toThrow();
    insertCategory(database);
    insertEntry(database);
    expect(() => insertEntry(database, 'another')).toThrow();
    expect(() => insertEntry(database, 'invalid', '2026-02-30')).toThrow();
    expect(() => insertEntry(database, 'before-opening', '2026-08-31')).toThrow();
    database.prepare("UPDATE categories SET archived_on = '2026-09-02' WHERE id = 'a'").run();
    expect(() => insertEntry(database, 'after-archive', '2026-09-03')).toThrow();
  });
  it('stores cents as INTEGER and rejects fractional, negative and oversized balances', () => {
    const database = fixture.open();
    insertCategory(database);
    insertEntry(database, 'max', '2026-09-01', 99999999999999n);
    expect(
      database
        .prepare(
          'SELECT typeof(closing_balance_minor) AS storage, closing_balance_minor FROM daily_entries',
        )
        .get(),
    ).toMatchObject({ storage: 'integer', closing_balance_minor: 99999999999999n });
    const update = database.prepare('UPDATE daily_entries SET closing_balance_minor = ?');
    expect(() => update.run(1.25)).toThrow();
    expect(() => update.run(-1n)).toThrow();
    expect(() => update.run(100000000000000n)).toThrow();
  });
  it('enforces category metadata constraints and singleton settings', () => {
    const database = fixture.open();
    insertCategory(database);
    expect(() => database.prepare("UPDATE categories SET color = 'red'").run()).toThrow();
    expect(() => database.prepare("UPDATE categories SET name = ''").run()).toThrow();
    expect(() =>
      database.prepare("UPDATE categories SET opening_date = '2026-02-30'").run(),
    ).toThrow();
    expect(() =>
      database
        .prepare(
          "INSERT INTO app_settings VALUES (2, 'CNY', 'Asia/Shanghai', 'start_of_day_net_v1')",
        )
        .run(),
    ).toThrow();
  });
  it('keeps original data and version intact after a failed migration', () => {
    const database = fixture.open();
    insertCategory(database);
    const invalid = {
      version: 2,
      name: 'broken',
      sql: 'CREATE TABLE attempt(id INTEGER); INSERT INTO nonexistent VALUES (1);',
    };
    expect(() => migrateDatabase(database, [...migrations, invalid])).toThrow();
    expect(schemaVersion(database)).toBe(1);
    expect(
      database.prepare("SELECT name FROM sqlite_master WHERE name = 'attempt'").get(),
    ).toBeUndefined();
    expect(database.prepare('SELECT count(*) AS count FROM categories').get()?.count).toBe(1n);
    migrateDatabase(database, [
      ...migrations,
      { version: 2, name: 'extra', sql: 'CREATE TABLE extra(id INTEGER) STRICT;' },
    ]);
    expect(schemaVersion(database)).toBe(2);
  });
  it('rejects modified or missing applied migrations', () => {
    const database = fixture.open();
    expect(() =>
      migrateDatabase(database, [{ version: 1, name: 'initial-ledger', sql: 'SELECT 1;' }]),
    ).toThrow('modified');
    expect(() => migrateDatabase(database, [])).toThrow('Unknown');
    expect(() =>
      migrateDatabase(database, [{ version: 3, name: 'skip', sql: 'SELECT 1;' }]),
    ).toThrow('consecutive');
    expect(schemaVersion(database)).toBe(1);
  });
  it('updates dependent lifetime bounds and cascades only explicitly removed categories', () => {
    const database = fixture.open();
    insertCategory(database);
    insertCategory(database, 'b');
    insertEntry(database);
    expect(() => database.prepare("UPDATE daily_entries SET date = '2026-08-01'").run()).toThrow();
    database.transaction(() => database.prepare("DELETE FROM categories WHERE id = 'a'").run());
    expect(database.prepare('SELECT count(*) AS count FROM daily_entries').get()?.count).toBe(0n);
    expect(database.prepare('SELECT id FROM categories').get()?.id).toBe('b');
  });
});
