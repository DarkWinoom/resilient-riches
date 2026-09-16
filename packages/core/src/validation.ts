import { parseDate } from './dates.ts';
import { LedgerError } from './errors.ts';
import { parseMoney } from './money.ts';
import type { Category, DailyEntry } from './types.ts';

function text(value: unknown, field: string, max: number, empty = false): void {
  if (typeof value !== 'string' || (!empty && !value.trim()) || [...value].length > max) {
    throw new LedgerError('INVALID_TEXT', `${field}内容不合法或过长`, field);
  }
}

export function validateCategory(category: Category): void {
  text(category.id, 'id', 64);
  text(category.name, 'name', 40);
  if (!/^#[0-9a-f]{6}$/i.test(category.color)) {
    throw new LedgerError('INVALID_COLOR', '颜色必须是六位十六进制色值', 'color');
  }
  parseDate(category.openingDate, 'openingDate');
  parseMoney(category.openingBalance, 'openingBalance', false);
  parseMoney(category.historicalPnl, 'historicalPnl');
  if (category.note !== undefined) text(category.note, 'note', 1000, true);
  if (category.archivedOn != null) {
    parseDate(category.archivedOn, 'archivedOn');
    if (category.archivedOn < category.openingDate) {
      throw new LedgerError('INVALID_ARCHIVE_DATE', '归档日不能早于启用日', 'archivedOn');
    }
  }
}

export function validateEntry(entry: DailyEntry): void {
  if (entry.liquidationPnl != null) parseMoney(entry.liquidationPnl, 'liquidationPnl');
  text(entry.categoryId, 'categoryId', 64);
  parseDate(entry.date);
  parseMoney(entry.closingBalance, 'closingBalance', false);
  parseMoney(entry.buy, 'buy', false);
  parseMoney(entry.sell, 'sell', false);
  if (entry.note !== undefined) text(entry.note, 'note', 1000, true);
}
