import type { Decimal } from 'decimal.js';
import { datesBetween, parseDate } from './dates.ts';
import { LedgerError } from './errors.ts';
import {
  checkTotal,
  FinancialDecimal,
  formatMoney,
  parseMoney,
  serializeRate,
  sumMoney,
} from './money.ts';
import type {
  Category,
  DailyEntry,
  DayResult,
  LedgerResult,
  LedgerSeries,
  RateReason,
  ReturnSegment,
} from './types.ts';
import { validateCategory, validateEntry } from './validation.ts';

interface InternalDay {
  date: string;
  opening: bigint;
  buy: bigint;
  sell: bigint;
  closing: bigint;
  pnl: bigint;
  rate: Decimal | null;
  reason: RateReason | null;
  source: DayResult['source'];
  lastRecordedDate: string | null;
}

interface ParsedEntry {
  closing: bigint;
  buy: bigint;
  sell: bigint;
}

function computeDay(opening: bigint, buy: bigint, sell: bigint, closing: bigint) {
  const capital = checkTotal(opening + buy - sell);
  if (capital < 0n) {
    throw new LedgerError('NEGATIVE_CAPITAL', '卖出不能超过前日余额与当日买入之和', 'sell');
  }
  const pnl = checkTotal(closing - capital);
  const rate = capital > 0n ? new FinancialDecimal(pnl.toString()).div(capital.toString()) : null;
  const reason = capital === 0n ? (closing === 0n ? 'no_capital' : 'zero_capital_gain') : null;
  return { pnl, rate, reason } as const;
}

export function calculateDay(input: {
  openingBalance: string;
  buy: string;
  sell: string;
  closingBalance: string;
}) {
  const result = computeDay(
    parseMoney(input.openingBalance, 'openingBalance', false),
    parseMoney(input.buy, 'buy', false),
    parseMoney(input.sell, 'sell', false),
    parseMoney(input.closingBalance, 'closingBalance', false),
  );
  return {
    pnl: formatMoney(result.pnl),
    returnRate: result.rate === null ? null : serializeRate(result.rate),
    rateReason: result.reason,
  };
}

function compound(points: readonly InternalDay[]) {
  const segments: ReturnSegment[] = [];
  let current: { from: string; to: string; factor: Decimal } | undefined;
  let total = new FinancialDecimal(1);
  let valid = false;
  let wiped = false;
  let restarted = false;
  let zeroGain = false;
  const flush = () => {
    if (!current) return;
    segments.push({
      from: current.from,
      to: current.to,
      returnRate: serializeRate(current.factor.minus(1)),
      reason: null,
    });
    current = undefined;
  };
  for (const point of points) {
    if (point.rate === null) {
      if (point.reason === 'zero_capital_gain') {
        flush();
        zeroGain = true;
        segments.push({
          from: point.date,
          to: point.date,
          returnRate: null,
          reason: 'zero_capital_gain',
        });
      } else if (current) current.to = point.date;
      continue;
    }
    valid = true;
    if (!current) {
      if (wiped) restarted = true;
      current = { from: point.date, to: point.date, factor: new FinancialDecimal(1) };
    }
    const factor = point.rate.plus(1);
    total = total.mul(factor);
    current.factor = current.factor.mul(factor);
    current.to = point.date;
    if (factor.isZero()) {
      wiped = true;
      flush();
    }
  }
  flush();
  const reason: RateReason | null = zeroGain
    ? 'zero_capital_gain'
    : restarted
      ? 'capital_reset'
      : valid
        ? null
        : 'no_capital';
  return {
    returnRate: reason === null ? serializeRate(total.minus(1)) : null,
    rateReason: reason,
    segments,
  };
}

function serializeDay(point: InternalDay): DayResult {
  return {
    date: point.date,
    openingBalance: formatMoney(point.opening),
    buy: formatMoney(point.buy),
    sell: formatMoney(point.sell),
    closingBalance: formatMoney(point.closing),
    pnl: formatMoney(point.pnl),
    returnRate: point.rate === null ? null : serializeRate(point.rate),
    rateReason: point.reason,
    source: point.source,
    lastRecordedDate: point.lastRecordedDate,
  };
}

function series(points: readonly InternalDay[], from: string, historical: bigint): LedgerSeries {
  const selected = points.filter((point) => point.date >= from);
  const closing = points.at(-1)?.closing ?? 0n;
  const cumulative = checkTotal(sumMoney(points.map((point) => point.pnl)) + historical);
  return {
    days: selected.map(serializeDay),
    summary: {
      closingBalance: formatMoney(closing),
      periodPnl: formatMoney(sumMoney(selected.map((point) => point.pnl))),
      cumulativePnl: formatMoney(cumulative),
      historicalPnl: formatMoney(historical),
      netInvested: formatMoney(checkTotal(closing - cumulative)),
      ...compound(selected),
      lastRecordedDate: points.at(-1)?.lastRecordedDate ?? null,
    },
  };
}

export function calculateLedger(input: {
  categories: readonly Category[];
  entries: readonly DailyEntry[];
  through: string;
  from?: string;
}): LedgerResult {
  parseDate(input.through, 'through');
  if (input.from !== undefined) parseDate(input.from, 'from');
  if (input.from !== undefined && input.from > input.through) {
    throw new LedgerError('INVALID_RANGE', '开始日期不能晚于结束日期', 'from');
  }
  const states = input.categories.map((category) => {
    validateCategory(category);
    return {
      category,
      opening: parseMoney(category.openingBalance),
      historical: parseMoney(category.historicalPnl),
      previous: 0n,
      activated: false,
      lastRecordedDate: null as string | null,
      records: new Map<string, ParsedEntry>(),
      points: [] as InternalDay[],
    };
  });
  const byId = new Map(states.map((state) => [state.category.id, state]));
  if (byId.size !== states.length) throw new LedgerError('DUPLICATE_CATEGORY', '分类ID重复');
  for (const entry of input.entries) {
    validateEntry(entry);
    const state = byId.get(entry.categoryId);
    if (!state) throw new LedgerError('UNKNOWN_CATEGORY', '记录对应的分类不存在', 'categoryId');
    if (
      entry.date < state.category.openingDate ||
      (state.category.archivedOn != null && entry.date > state.category.archivedOn)
    ) {
      throw new LedgerError('ENTRY_OUTSIDE_LIFETIME', '记录日期不在分类启用与归档日期内', 'date');
    }
    if (state.records.has(entry.date))
      throw new LedgerError('DUPLICATE_ENTRY', '同分类同日期只能有一条记录', 'date');
    state.records.set(entry.date, {
      closing: parseMoney(entry.closingBalance),
      buy: parseMoney(entry.buy),
      sell: parseMoney(entry.sell),
    });
  }
  const earliest = states.map((state) => state.category.openingDate).sort()[0];
  const start =
    [earliest ?? input.through, input.from ?? input.through, input.through].sort()[0] ??
    input.through;
  const from =
    input.from ?? (earliest !== undefined && earliest <= input.through ? earliest : input.through);
  const portfolio: InternalDay[] = [];
  let lastRecordedDate: string | null = null;
  for (const date of datesBetween(start, input.through)) {
    const opening = sumMoney(states.map((state) => state.previous));
    const buys: bigint[] = [];
    const sells: bigint[] = [];
    let hasRecord = false;
    let hasOpening = false;
    for (const state of states) {
      const { category } = state;
      if (date < category.openingDate) continue;
      const isOpening = date === category.openingDate;
      const isArchived = category.archivedOn != null && date > category.archivedOn;
      state.activated = true;
      const record = state.records.get(date);
      const previous = isOpening ? state.opening : state.previous;
      const buy = record?.buy ?? 0n;
      const sell = record?.sell ?? 0n;
      const closing = record?.closing ?? previous;
      if (category.archivedOn != null && date >= category.archivedOn && closing !== 0n) {
        throw new LedgerError('NONZERO_ARCHIVE', '归档分类必须已经清空余额', 'archivedOn');
      }
      const values = computeDay(previous, buy, sell, closing);
      if (record) {
        state.lastRecordedDate = date;
        hasRecord = true;
      }
      if (isOpening) hasOpening = true;
      state.points.push({
        date,
        opening: previous,
        buy,
        sell,
        closing,
        ...values,
        source: record ? 'recorded' : isOpening ? 'opening' : isArchived ? 'archived' : 'carried',
        lastRecordedDate: state.lastRecordedDate,
      });
      state.previous = closing;
      buys.push(buy + (isOpening ? state.opening : 0n));
      sells.push(sell);
    }
    if (hasRecord) lastRecordedDate = date;
    const buy = sumMoney(buys);
    const sell = sumMoney(sells);
    const closing = sumMoney(states.map((state) => state.previous));
    portfolio.push({
      date,
      opening,
      buy,
      sell,
      closing,
      ...computeDay(opening, buy, sell, closing),
      source: hasRecord ? 'recorded' : hasOpening ? 'opening' : 'carried',
      lastRecordedDate,
    });
  }
  return {
    from,
    to: input.through,
    portfolio: series(
      portfolio,
      from,
      sumMoney(states.filter((state) => state.activated).map((state) => state.historical)),
    ),
    categories: states.map((state) => ({
      categoryId: state.category.id,
      ...series(state.points, from, state.activated ? state.historical : 0n),
    })),
  };
}
