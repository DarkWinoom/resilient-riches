import { calculateLedger, includeHistoricalReturn, periodRange } from '@resilient-riches/core';
import type { DashboardResponse, CategoryDetailResponse, Period } from '@resilient-riches/core';
import type { AppDatabase } from '../database/database.ts';
import { loadLedgerInput } from '../database/ledger-input.ts';
import { ApiError } from './ledger-service.ts';

export function createDashboardService(database: AppDatabase, clock: () => string) {
  function dashboard(period: Period, anchor: string): DashboardResponse {
    const today = clock();
    const range = periodRange(period, anchor, today);
    const input = loadLedgerInput(database);
    const current = calculateLedger({ ...input, through: today, timeline: 'events' });
    const daily = calculateLedger({ ...input, from: today, through: today, timeline: 'events' });
    const month = calculateLedger({
      ...input,
      from: today.slice(0, 7) + '-01',
      through: today,
      timeline: 'events',
    });
    const selected = calculateLedger({
      ...input,
      from: range.from,
      through: range.to,
      timeline: 'period',
      includeCurve: true,
      includeOpeningHistory: true,
    });
    return {
      today,
      earliestDate: input.categories.map((item) => item.openingDate).sort()[0] ?? null,
      period,
      anchor,
      range,
      overview: {
        current: includeHistoricalReturn(
          current.portfolio.summary,
          input.categories.filter((category) => category.openingDate <= today),
        ),
        today: daily.portfolio.summary,
        month: month.portfolio.summary,
      },
      performance: selected.portfolio.summary,
      curve: selected.portfolio.curve ?? [],
      categories: input.categories.map((category) => {
        const now = current.categories.find((item) => item.categoryId === category.id)!.summary;
        const chosen = selected.categories.find((item) => item.categoryId === category.id)!.summary;
        return {
          ...category,
          balance: now.closingBalance,
          totalPnl: now.cumulativePnl,
          lastRecordedDate: now.lastRecordedDate,
          periodPnl: chosen.periodPnl,
          periodClosingBalance: chosen.closingBalance,
          returnRate: chosen.returnRate,
          rateReason: chosen.rateReason,
        };
      }),
    };
  }
  function detail(id: string, period: Period, anchor: string): CategoryDetailResponse {
    const data = dashboard(period, anchor);
    const category = data.categories.find((item) => item.id === id);
    if (!category) throw new ApiError(404, 'CATEGORY_NOT_FOUND', '分类不存在或已被删除');
    const input = loadLedgerInput(database);
    const entries = input.entries.filter((item) => item.categoryId === id);
    const ledger = calculateLedger({
      categories: [category],
      entries,
      from: data.range.from,
      through: data.range.to,
      timeline: 'period',
      includeCurve: true,
      includeOpeningHistory: true,
    });
    const days = new Map(ledger.categories[0]!.days.map((day) => [day.date, day]));
    return {
      category,
      days: ledger.portfolio.days,
      range: data.range,
      curve: ledger.portfolio.curve ?? [],
      records: entries
        .filter((item) => item.date >= data.range.from && item.date <= data.range.to)
        .reverse()
        .map((entry) => ({
          ...entry,
          pnl: days.get(entry.date)!.pnl,
          returnRate: days.get(entry.date)!.returnRate,
        })),
    };
  }
  return { dashboard, detail };
}
