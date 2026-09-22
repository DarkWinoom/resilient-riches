import { calculateLedger, periodRange } from '@resilient-riches/core';
import type { DashboardResponse, CategoryDetailResponse, Period } from '@resilient-riches/core';
import type { AppDatabase } from '../database/database.ts';
import { loadLedgerInput } from '../database/ledger-input.ts';
import { ApiError } from './ledger-service.ts';
import { performance, statisticsInput } from './performance.ts';
export function createDashboardService(database: AppDatabase, clock: () => string) {
  function dashboard(period: Period, anchor: string): DashboardResponse {
    const today = clock();
    const input = loadLedgerInput(database);
    const stats = statisticsInput(input);
    const current = calculateLedger({
      ...input,
      through: today,
      timeline: 'events',
      includeOpeningHistory: true,
    });
    const week = calculateLedger({
      ...input,
      from: periodRange('week', today, today).from,
      through: today,
      timeline: 'events',
    });
    const month = calculateLedger({
      ...input,
      from: today.slice(0, 7) + '-01',
      through: today,
      timeline: 'events',
    });
    const allIncluded = stats.categories.length === input.categories.length;
    const overviewCurrent = allIncluded
      ? current
      : calculateLedger({
          ...stats,
          through: today,
          timeline: 'events',
          includeOpeningHistory: true,
        });
    const overviewMonth = allIncluded
      ? month
      : calculateLedger({
          ...stats,
          from: today.slice(0, 7) + '-01',
          through: today,
          timeline: 'events',
        });
    const daily = calculateLedger({ ...stats, from: today, through: today, timeline: 'events' });
    const selected = performance(stats, today, period, anchor);
    const nowById = new Map(current.categories.map((item) => [item.categoryId, item]));
    const weekById = new Map(week.categories.map((item) => [item.categoryId, item.summary]));
    const monthById = new Map(month.categories.map((item) => [item.categoryId, item.summary]));
    return {
      today,
      earliestDate: stats.categories.map((item) => item.openingDate).sort()[0] ?? null,
      period,
      anchor,
      range: selected.range,
      overview: {
        current: {
          ...overviewCurrent.portfolio.summary,
          ...overviewCurrent.portfolio.historicalPerformance,
        },
        today: daily.portfolio.summary,
        month: overviewMonth.portfolio.summary,
      },
      performance: selected.summary,
      curve: selected.curve,
      categories: input.categories.map((category) => {
        const now = nowById.get(category.id)!;
        const weekly = weekById.get(category.id)!;
        const monthly = monthById.get(category.id)!;
        return {
          ...category,
          balance: now.summary.closingBalance,
          totalPnl: now.summary.cumulativePnl,
          lastRecordedDate: now.summary.lastRecordedDate,
          weekPnl: weekly.periodPnl,
          weekReturnRate: weekly.returnRate,
          monthPnl: monthly.periodPnl,
          monthReturnRate: monthly.returnRate,
          totalReturnRate: now.historicalPerformance!.returnRate,
          ...(now.historicalPerformance!.historicalRateIncluded === false
            ? { historicalRateIncluded: false }
            : {}),
        };
      }),
    };
  }
  function detail(id: string, period: Period, anchor: string): CategoryDetailResponse {
    const today = clock();
    const input = loadLedgerInput(database);
    const category = input.categories.find((item) => item.id === id);
    if (!category) throw new ApiError(404, 'CATEGORY_NOT_FOUND', '分类不存在或已被删除');
    const own = {
      categories: [category],
      entries: input.entries.filter((item) => item.categoryId === id),
    };
    const current = calculateLedger({ ...own, through: today, timeline: 'events' }).portfolio
      .summary;
    const selected = performance(own, today, period, anchor);
    return {
      category: {
        ...category,
        balance: current.closingBalance,
        totalPnl: current.cumulativePnl,
        lastRecordedDate: current.lastRecordedDate,
      },
      performance: selected.summary,
      range: selected.range,
      curve: selected.curve,
      days: selected.ledger.portfolio.days,
    };
  }
  return { dashboard, detail };
}
