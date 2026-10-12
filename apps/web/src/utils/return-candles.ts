import { FinancialDecimal, parseDate, periodRange, serializeRate } from '@resilient-riches/core';
import type { Period, RateReason, ReturnHistoryPoint } from '@resilient-riches/core';

export type CandlePeriod = Exclude<Period, 'all'>;
export interface ReturnCandle {
  date: string;
  from: string;
  to: string;
  open: string | null;
  close: string | null;
  high: string | null;
  low: string | null;
  returnRate: string | null;
  direction: 'up' | 'down' | 'flat' | 'missing';
  rateReason: RateReason | null;
  historicalRateIncluded: boolean;
  partial: boolean;
  openingBalance: string | null;
  closingBalance: string | null;
  pnl: string | null;
}

const dayMilliseconds = 86_400_000;

function dateLabel(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function bucketStart(date: string, period: CandlePeriod): string {
  if (period === 'day') return date;
  if (period === 'month') return date.slice(0, 7) + '-01';
  if (period === 'year') return date.slice(0, 4) + '-01-01';
  const value = parseDate(date);
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return dateLabel(value);
}

function bucketDistance(from: string, to: string, period: CandlePeriod): number {
  if (period === 'year') return Number(to.slice(0, 4)) - Number(from.slice(0, 4));
  if (period === 'month')
    return (
      (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
      Number(to.slice(5, 7)) -
      Number(from.slice(5, 7))
    );
  return (
    Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / dayMilliseconds) /
    (period === 'week' ? 7 : 1)
  );
}

function offsetBucket(from: string, offset: number, period: CandlePeriod): string {
  const value = parseDate(from);
  if (period === 'year') value.setUTCFullYear(value.getUTCFullYear() + offset);
  else if (period === 'month') value.setUTCMonth(value.getUTCMonth() + offset);
  else value.setUTCDate(value.getUTCDate() + offset * (period === 'week' ? 7 : 1));
  return dateLabel(value);
}

function lowerBound(points: readonly ReturnHistoryPoint[], date: string, inclusive: boolean) {
  let low = 0,
    high = points.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle]!.date < date || (inclusive && points[middle]!.date === date))
      low = middle + 1;
    else high = middle;
  }
  return low;
}

function incompletePeriod(to: string, period: CandlePeriod): boolean {
  if (period === 'day') return false;
  const date = parseDate(to);
  if (period === 'week') return date.getUTCDay() !== 0;
  if (period === 'year') return to.slice(5) !== '12-31';
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.getUTCMonth() === date.getUTCMonth();
}

// The API supplies event dates. Only visible calendar buckets are expanded, so an old
// opening date never allocates every carried day in the history of the account.
export function createReturnTimeline(
  history: readonly ReturnHistoryPoint[],
  period: CandlePeriod,
  today: string,
) {
  const points = history.filter((point) => point.date <= today);
  const first = points[0];
  if (!first) return { length: 0, candles: () => [] as ReturnCandle[] };
  const beginning = bucketStart(first.date, period);
  const recorded = period === 'day' ? points.filter((point) => point.recorded !== false) : [];
  const length =
    period === 'day'
      ? recorded.length
      : bucketDistance(beginning, bucketStart(today, period), period) + 1;
  const monetary = points.every(
    (point) => point.pnl !== undefined && point.closingBalance !== undefined,
  );
  const firstMeasured = points.findIndex((point) => point.returnRate !== null);
  const initialBaselineKnown =
    firstMeasured >= 0 &&
    points.slice(0, firstMeasured).every((point) => point.rateReason === 'no_capital');

  function candle(index: number): ReturnCandle {
    const date = period === 'day' ? recorded[index]!.date : offsetBucket(beginning, index, period);
    const range = periodRange(period, date, today);
    const from = range.from < first!.date ? first!.date : range.from;
    const to = range.to;
    const start = lowerBound(points, from, false);
    const end = lowerBound(points, to, true);
    const prior = points[start - 1];
    const initial = points[lowerBound(points, from, true) - 1];
    const final = points[end - 1]!;
    const openingBalance =
      initial?.date === from
        ? (initial.openingBalance ?? prior?.closingBalance ?? null)
        : (prior?.closingBalance ?? null);
    const pnl = monetary
      ? points
          .slice(start, end)
          .reduce((sum, point) => sum.plus(point.pnl!), new FinancialDecimal(0))
          .toFixed(2)
      : null;
    // Zero is a known compounding baseline before the first measurable return,
    // rather than a replacement for an undefined rate after a discontinuity.
    const useInitialBaseline =
      initialBaselineKnown && start === firstMeasured && initial?.returnRate !== null;
    const open =
      initial?.date === from && initial.openingReturnRate !== undefined
        ? initial.openingReturnRate
        : (prior?.returnRate ?? (useInitialBaseline ? '0' : null));
    const close = final.returnRate;
    const observations = [initial, ...points.slice(start, end)].filter(
      (point): point is ReturnHistoryPoint => point !== undefined,
    );
    const missing = observations.find((point) => point.returnRate === null);
    const valid = open !== null && close !== null && !missing;
    const values = valid
      ? [
          open,
          ...observations.flatMap((point) => [
            point.returnRate!,
            ...(point.date >= from && point.openingReturnRate != null
              ? [point.openingReturnRate]
              : []),
          ]),
        ].map((value) => new FinancialDecimal(value))
      : [];
    const high = values.length ? serializeRate(FinancialDecimal.max(...values)) : null;
    const low = values.length ? serializeRate(FinancialDecimal.min(...values)) : null;
    const comparison = valid ? new FinancialDecimal(close).cmp(open) : null;
    const factor = open === null ? null : new FinancialDecimal(open).plus(1);
    let returnRate =
      valid && factor !== null && !factor.isZero()
        ? serializeRate(new FinancialDecimal(close).plus(1).div(factor).minus(1))
        : null;
    if (period === 'day' && initial && valid) {
      if (initial.date === from && initial.dailyReturnRate !== undefined)
        returnRate = initial.dailyReturnRate;
      else if (initial.date < from && initial.carriedReturnRate !== undefined)
        returnRate = initial.carriedReturnRate;
    }
    if (
      observations.every(
        (point) => point.dailyReturnRate !== undefined && point.carriedReturnRate !== undefined,
      ) &&
      !observations.some(
        (point) => (point.date < from ? point.carriedReturnRate : point.dailyReturnRate) !== null,
      )
    )
      returnRate = null;
    return {
      date,
      from,
      to,
      open,
      close,
      high,
      low,
      returnRate,
      direction:
        comparison === null ? 'missing' : comparison > 0 ? 'up' : comparison < 0 ? 'down' : 'flat',
      rateReason: valid
        ? null
        : (missing?.rateReason ?? prior?.rateReason ?? final.rateReason ?? 'no_capital'),
      historicalRateIncluded: final.historicalRateIncluded !== false,
      partial: to === today && incompletePeriod(to, period),
      openingBalance,
      closingBalance: final.closingBalance ?? null,
      pnl,
    };
  }

  return {
    length,
    candles(start: number, count: number): ReturnCandle[] {
      const from = Math.max(0, Math.min(length, Math.floor(start)));
      const to = Math.max(from, Math.min(length, from + Math.floor(count)));
      return Array.from({ length: to - from }, (_, index) => candle(from + index));
    },
  };
}

export function candleRateReason(reason: RateReason | null): string {
  return {
    no_capital: '无可计算的本金',
    zero_capital_gain: '零本金收益无法计算收益率',
    capital_reset: '本金归零后重新投入，累计收益率无法连续计算',
  }[reason ?? 'no_capital'];
}
