import { calculateLedger, includeHistoricalReturn, periodRange } from '@resilient-riches/core';
import type { Period } from '@resilient-riches/core';
import type { loadLedgerInput } from '../database/ledger-input.ts';
export type LedgerInput = ReturnType<typeof loadLedgerInput>;
export function statisticsInput(input: LedgerInput): LedgerInput {
  const categories = input.categories.filter((category) => category.includeInStats !== false);
  const ids = new Set(categories.map((category) => category.id));
  return { categories, entries: input.entries.filter((entry) => ids.has(entry.categoryId)) };
}
export function performance(input: LedgerInput, today: string, period: Period, anchor: string) {
  const earliest = input.categories.map((category) => category.openingDate).sort()[0];
  const range = periodRange(period, anchor, today, earliest ?? today);
  const from = earliest && earliest > range.from && earliest <= range.to ? earliest : range.from;
  const ledger = calculateLedger({
    ...input,
    from,
    through: range.to,
    timeline: 'period',
    includeCurve: true,
    includeOpeningHistory: true,
  });
  const active = input.categories.filter((category) => category.openingDate <= range.to);
  const summary =
    period === 'all'
      ? includeHistoricalReturn(
          { ...ledger.portfolio.summary, periodPnl: ledger.portfolio.summary.cumulativePnl },
          active,
        )
      : ledger.portfolio.summary;
  return {
    range,
    ledger,
    summary,
    curve: earliest ? (ledger.portfolio.curve ?? []).filter((point) => point.date >= earliest) : [],
  };
}
