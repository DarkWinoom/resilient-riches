import { formatMoney } from '@resilient-riches/core';
import type { CategoryRecord, EntryRecord } from '@resilient-riches/core';
import type { SQLOutputValue } from 'node:sqlite';
import type { AppDatabase } from './database.ts';

type Row = Record<string, SQLOutputValue>;
function text(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') throw new Error('Invalid database text: ' + key);
  return value;
}
function integer(row: Row, key: string): bigint {
  const value = row[key];
  if (typeof value !== 'bigint') throw new Error('Invalid database integer: ' + key);
  return value;
}
export function categoryFromRow(row: Row): CategoryRecord {
  return {
    id: text(row, 'id'),
    name: text(row, 'name'),
    color: text(row, 'color'),
    openingDate: text(row, 'opening_date'),
    openingBalance: formatMoney(integer(row, 'opening_balance_minor')),
    historicalPnl: formatMoney(integer(row, 'historical_pnl_minor')),
    note: text(row, 'note'),
    archivedOn: row.archived_on === null ? null : text(row, 'archived_on'),
    sortOrder: Number(integer(row, 'sort_order')),
    revision: Number(integer(row, 'revision')),
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at'),
  };
}
export function entryFromRow(row: Row): EntryRecord {
  return {
    id: text(row, 'id'),
    categoryId: text(row, 'category_id'),
    date: text(row, 'date'),
    closingBalance: formatMoney(integer(row, 'closing_balance_minor')),
    buy: formatMoney(integer(row, 'buy_minor')),
    sell: formatMoney(integer(row, 'sell_minor')),
    note: text(row, 'note'),
    revision: Number(integer(row, 'revision')),
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at'),
  };
}
export function loadLedgerInput(database: AppDatabase): {
  categories: CategoryRecord[];
  entries: EntryRecord[];
} {
  return {
    categories: database
      .prepare('SELECT * FROM categories ORDER BY sort_order, name')
      .all()
      .map(categoryFromRow),
    entries: database
      .prepare('SELECT * FROM daily_entries ORDER BY date, category_id')
      .all()
      .map(entryFromRow),
  };
}
