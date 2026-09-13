import { formatMoney } from '@resilient-riches/core';
import type { Category, DailyEntry } from '@resilient-riches/core';
import type { SQLOutputValue } from 'node:sqlite';
import type { AppDatabase } from './database.ts';

type Row = Record<string, SQLOutputValue>;

function text(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') throw new Error(`Invalid database text: ${key}`);
  return value;
}

function money(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== 'bigint') throw new Error(`Invalid database money: ${key}`);
  return formatMoney(value);
}

export function loadLedgerInput(database: AppDatabase): {
  categories: Category[];
  entries: DailyEntry[];
} {
  const categories = database
    .prepare(
      `SELECT id, name, color, opening_date, opening_balance_minor,
    historical_pnl_minor, note, archived_on FROM categories ORDER BY sort_order, name`,
    )
    .all()
    .map((row): Category => ({
      id: text(row, 'id'),
      name: text(row, 'name'),
      color: text(row, 'color'),
      openingDate: text(row, 'opening_date'),
      openingBalance: money(row, 'opening_balance_minor'),
      historicalPnl: money(row, 'historical_pnl_minor'),
      note: text(row, 'note'),
      archivedOn: row.archived_on === null ? null : text(row, 'archived_on'),
    }));
  const entries = database
    .prepare(
      `SELECT category_id, date, closing_balance_minor, buy_minor,
    sell_minor, note FROM daily_entries ORDER BY date, category_id`,
    )
    .all()
    .map((row): DailyEntry => ({
      categoryId: text(row, 'category_id'),
      date: text(row, 'date'),
      closingBalance: money(row, 'closing_balance_minor'),
      buy: money(row, 'buy_minor'),
      sell: money(row, 'sell_minor'),
      note: text(row, 'note'),
    }));
  return { categories, entries };
}
