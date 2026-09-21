import { LedgerError } from './errors.ts';

export const BUSINESS_TIMEZONE = 'Asia/Shanghai';
export type Period = 'day' | 'week' | 'month' | 'year' | 'all';
export interface DateRange {
  from: string;
  to: string;
}

function utcDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function printDate(date: Date): string {
  const year = date.getUTCFullYear();
  if (year < 1 || year > 9999) throw new LedgerError('INVALID_DATE', '日期超出支持范围');
  return `${String(year).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function parseDate(value: unknown, field = 'date'): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new LedgerError('INVALID_DATE', '日期必须使用YYYY-MM-DD格式', field);
  }
  const [year = 0, month = 0, day = 0] = value.split('-').map(Number);
  const date = utcDate(year, month, day);
  if (year < 1 || year > 9999 || printDate(date) !== value) {
    throw new LedgerError('INVALID_DATE', '日期不存在', field);
  }
  return date;
}

export function addDays(value: string, amount: number): string {
  if (!Number.isInteger(amount)) throw new LedgerError('INVALID_DAY_OFFSET', '日期偏移必须是整数');
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return printDate(date);
}

export function today(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function validateEntryDate(value: string, latest = today()): void {
  parseDate(value);
  parseDate(latest, 'today');
  if (value > latest) throw new LedgerError('FUTURE_DATE', '不能录入未来日期', 'date');
}

export function periodRange(
  period: Period,
  anchor: string,
  latest = today(),
  earliest = latest,
): DateRange {
  validateEntryDate(anchor, latest);
  const date = parseDate(anchor);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  let from = anchor;
  let to = anchor;
  switch (period) {
    case 'all':
      validateEntryDate(earliest, latest);
      return { from: earliest, to: latest };
    case 'day':
      break;
    case 'week':
      from = addDays(anchor, -((date.getUTCDay() + 6) % 7));
      to = addDays(from, 6);
      break;
    case 'month':
      from = printDate(utcDate(year, month, 1));
      to = printDate(utcDate(year, month + 1, 0));
      break;
    case 'year':
      from = `${String(year).padStart(4, '0')}-01-01`;
      to = `${String(year).padStart(4, '0')}-12-31`;
      break;
    default:
      throw new LedgerError('INVALID_PERIOD', '不支持的报表周期');
  }
  return { from, to: to > latest ? latest : to };
}

export function* datesBetween(from: string, to: string): Generator<string> {
  parseDate(from, 'from');
  parseDate(to, 'to');
  if (from > to) throw new LedgerError('INVALID_RANGE', '开始日期不能晚于结束日期');
  for (let date = from; ; date = addDays(date, 1)) {
    yield date;
    if (date === to) break;
  }
}

export function periodLabel(period: Period, current = true): string {
  return {
    day: '当日',
    week: current ? '本周' : '当周',
    month: current ? '本月' : '当月',
    year: current ? '本年' : '当年',
    all: '累计',
  }[period];
}
