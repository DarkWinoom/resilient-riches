import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { backupDatabase, restoreDatabase } from '../src/database/snapshots.ts';
import { databaseFixture, insertCategory, insertEntry } from './fixtures.ts';

describe('ledger backup and restore', () => {
  const fixture = databaseFixture();
  it('backs up committed WAL data while the application is open and produces a standalone file', async () => {
    const directory = fixture.directory(),
      source = join(directory, 'source.sqlite'),
      copy = join(directory, 'copy.sqlite');
    const database = fixture.open(source);
    insertCategory(database);
    insertEntry(database);
    expect(existsSync(source + '-wal')).toBe(true);
    expect(await backupDatabase(source, copy)).toMatchObject({ categories: 1, entries: 1 });
    expect(existsSync(copy + '-wal')).toBe(false);
    expect(existsSync(copy + '-shm')).toBe(false);
    const snapshot = new DatabaseSync(copy, { readOnly: true });
    try {
      expect(
        snapshot.prepare('SELECT closing_balance_minor FROM daily_entries').get()
          ?.closing_balance_minor,
      ).toBe(1010000);
    } finally {
      snapshot.close();
    }
  });
  it('refuses to overwrite an existing backup or the original database', async () => {
    const directory = fixture.directory(),
      source = join(directory, 'source.sqlite'),
      copy = join(directory, 'copy.sqlite');
    const database = fixture.open(source);
    insertCategory(database);
    writeFileSync(copy, 'keep');
    await expect(backupDatabase(source, copy)).rejects.toThrow();
    expect(readFileSync(copy, 'utf8')).toBe('keep');
    await expect(backupDatabase(source, source)).rejects.toThrow('不能指向');
  });
  it('previews restoration without changing the target, then preserves the old ledger on confirmation', async () => {
    const directory = fixture.directory(),
      source = join(directory, 'source.sqlite'),
      target = join(directory, 'target.sqlite');
    const original = fixture.open(source);
    insertCategory(original);
    insertEntry(original);
    original.close();
    const current = fixture.open(target);
    insertCategory(current, 'b');
    current.close();
    const before = readFileSync(target);
    const preview = await restoreDatabase(source, target);
    expect(preview).toMatchObject({ restored: false, categories: 1, entries: 1 });
    expect(readFileSync(target)).toEqual(before);
    const result = await restoreDatabase(source, target, true);
    expect(result.restored).toBe(true);
    expect(result.safetyBackup).not.toBeNull();
    const restored = fixture.open(target);
    expect(restored.prepare('SELECT id FROM categories').get()?.id).toBe('a');
    const saved = fixture.open(result.safetyBackup!);
    expect(saved.prepare('SELECT id FROM categories').get()?.id).toBe('b');
  });
  it('refuses restoration while the target is open and can initialize a missing target after confirmation', async () => {
    const directory = fixture.directory(),
      source = join(directory, 'source.sqlite'),
      target = join(directory, 'target.sqlite');
    const original = fixture.open(source);
    insertCategory(original);
    original.close();
    const running = fixture.open(target);
    insertCategory(running, 'b');
    await expect(restoreDatabase(source, target, true)).rejects.toThrow('先停止服务');
    expect(running.prepare('SELECT id FROM categories').get()?.id).toBe('b');
    const missing = join(directory, 'new.sqlite');
    expect((await restoreDatabase(source, missing)).restored).toBe(false);
    expect(existsSync(missing)).toBe(false);
    await restoreDatabase(source, missing, true);
    expect(existsSync(missing)).toBe(true);
  });
  it('rejects invalid backups and altered migration history without touching the destination', async () => {
    const directory = fixture.directory(),
      source = join(directory, 'source.sqlite'),
      target = join(directory, 'target.sqlite');
    const original = fixture.open(source);
    insertCategory(original);
    original.prepare("UPDATE schema_migrations SET checksum='tampered'").run();
    original.close();
    const current = fixture.open(target);
    insertCategory(current, 'b');
    current.close();
    const before = readFileSync(target);
    await expect(restoreDatabase(source, target, true)).rejects.toThrow('migration');
    expect(readFileSync(target)).toEqual(before);
    const invalid = join(directory, 'invalid.sqlite');
    writeFileSync(invalid, 'not sqlite');
    await expect(restoreDatabase(invalid, target, true)).rejects.toThrow();
    expect(readFileSync(target)).toEqual(before);
  });
  it('rejects financially invalid history before replacing the original', async () => {
    const directory = fixture.directory(),
      source = join(directory, 'source.sqlite'),
      target = join(directory, 'target.sqlite');
    const original = fixture.open(source);
    insertCategory(original);
    insertEntry(original);
    original.prepare('UPDATE daily_entries SET sell_minor=2000000').run();
    original.close();
    const current = fixture.open(target);
    insertCategory(current, 'b');
    current.close();
    const before = readFileSync(target);
    await expect(restoreDatabase(source, target, true)).rejects.toThrow('卖出不能超过');
    expect(readFileSync(target)).toEqual(before);
  });
  it('can recover a damaged stopped database while preserving its original bytes', async () => {
    const directory = fixture.directory(),
      source = join(directory, 'source.sqlite'),
      target = join(directory, 'damaged.sqlite');
    const original = fixture.open(source);
    insertCategory(original);
    original.close();
    writeFileSync(target, 'damaged original');
    const result = await restoreDatabase(source, target, true);
    expect(result.restored).toBe(true);
    expect(readFileSync(result.safetyBackup!, 'utf8')).toBe('damaged original');
    const recovered = fixture.open(target);
    expect(recovered.prepare('SELECT id FROM categories').get()?.id).toBe('a');
  });
});
