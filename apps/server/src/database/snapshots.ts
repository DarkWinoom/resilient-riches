import { randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  copyFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  openSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { calculateLedger, today } from '@resilient-riches/core';
import { openDatabase } from './database.ts';
import { loadLedgerInput } from './ledger-input.ts';

function existingFile(path: string): string {
  const full = resolve(path);
  if (!existsSync(full) || !statSync(full).isFile()) throw new Error(`找不到数据库文件：${full}`);
  return realpathSync(full);
}
function inspectConnection(database: DatabaseSync) {
  const integrity = database.prepare('PRAGMA integrity_check').all();
  if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok')
    throw new Error('数据库完整性检查失败');
  if (database.prepare('PRAGMA foreign_key_check').all().length)
    throw new Error('数据库包含无效的分类关联');
  const settings = database
    .prepare('SELECT currency,timezone,calculation_policy FROM app_settings WHERE id=1')
    .get();
  if (
    settings?.currency !== 'CNY' ||
    settings.timezone !== 'Asia/Shanghai' ||
    settings.calculation_policy !== 'start_of_day_net_v1'
  )
    throw new Error('备份不是受支持的稳健生财账本');
  const categories = Number(
    database.prepare('SELECT count(*) AS total FROM categories').get()?.total ?? 0,
  );
  const entries = Number(
    database.prepare('SELECT count(*) AS total FROM daily_entries').get()?.total ?? 0,
  );
  return { categories, entries };
}
function inspectFile(path: string) {
  const database = new DatabaseSync(path, { readOnly: true, timeout: 5000 });
  try {
    return inspectConnection(database);
  } finally {
    database.close();
  }
}
function checkDistinct(source: string, target: string) {
  const resolvedTarget = existsSync(target) ? realpathSync(target) : resolve(target);
  if ([source, `${source}-wal`, `${source}-shm`, `${source}-journal`].includes(resolvedTarget))
    throw new Error('备份与恢复文件不能指向原数据库或其关联文件');
}
function standalone(path: string) {
  const database = new DatabaseSync(path, { timeout: 5000 });
  try {
    database.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;');
    return inspectConnection(database);
  } finally {
    database.close();
  }
}
function removeStaging(path: string) {
  for (const suffix of ['', '-wal', '-shm', '-journal'])
    rmSync(`${path}${suffix}`, { force: true });
}
export async function backupDatabase(
  sourcePath: string,
  destinationPath: string,
  sourceReadOnly = false,
) {
  const source = existingFile(sourcePath),
    destination = existsSync(destinationPath)
      ? existingFile(destinationPath)
      : resolve(destinationPath);
  checkDistinct(source, destination);
  mkdirSync(dirname(destination), { recursive: true });
  const reservation = openSync(destination, 'wx', 0o600);
  closeSync(reservation);
  let database: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(source, { readOnly: sourceReadOnly, timeout: 5000 });
    database.exec('PRAGMA query_only=ON;');
    inspectConnection(database);
    await backup(database, destination);
    database.close();
    database = undefined;
    const counts = standalone(destination);
    return { path: destination, ...counts };
  } catch (error) {
    database?.close();
    removeStaging(destination);
    throw error;
  }
}
export async function restoreDatabase(
  sourcePath: string,
  destinationPath: string,
  confirm = false,
) {
  const source = existingFile(sourcePath),
    destination = existsSync(destinationPath)
      ? existingFile(destinationPath)
      : resolve(destinationPath);
  checkDistinct(source, destination);
  inspectFile(source);
  mkdirSync(dirname(destination), { recursive: true });
  const stage = resolve(dirname(destination), `.restore-${randomUUID()}.sqlite`);
  try {
    await backupDatabase(source, stage, true);
    const candidate = openDatabase(stage);
    let counts: { categories: number; entries: number };
    try {
      const input = loadLedgerInput(candidate);
      const through = [
        today(),
        ...input.categories.map((row) => row.openingDate),
        ...input.entries.map((row) => row.date),
      ]
        .sort()
        .at(-1)!;
      calculateLedger({ ...input, through, timeline: 'events' });
      counts = inspectConnection(candidate.connection);
    } finally {
      candidate.close();
    }
    standalone(stage);
    if (!confirm) return { restored: false, source, destination, ...counts, safetyBackup: null };
    const ensureStopped = () => {
      if (['-wal', '-shm', '-journal'].some((suffix) => existsSync(`${destination}${suffix}`)))
        throw new Error(
          '目标账本仍有运行关联文件，请先停止服务；异常退出后请正常启动并关闭一次再恢复。',
        );
    };
    ensureStopped();
    let safetyBackup: string | null = null;
    if (existsSync(destination)) {
      const safety = resolve(
        dirname(destination),
        'backups',
        `before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.sqlite`,
      );
      mkdirSync(dirname(safety), { recursive: true });
      copyFileSync(destination, safety, constants.COPYFILE_EXCL);
      chmodSync(safety, 0o600);
      safetyBackup = safety;
    }
    ensureStopped();
    renameSync(stage, destination);
    return { restored: true, source, destination, ...counts, safetyBackup };
  } finally {
    removeStaging(stage);
  }
}
