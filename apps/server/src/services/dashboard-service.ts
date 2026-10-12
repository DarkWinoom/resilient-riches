import {
  calculateLedger,
  FinancialDecimal,
  periodRange,
  serializeRate,
} from '@resilient-riches/core';
import type {
  DashboardResponse,
  CategoryDetailResponse,
  LedgerSeries,
  Period,
  ReturnHistoryPoint,
} from '@resilient-riches/core';
import type { AppDatabase } from '../database/database.ts';
import { loadLedgerInput } from '../database/ledger-input.ts';
import { ApiError } from './ledger-service.ts';
import { performance, statisticsInput } from './performance.ts';
import type { LedgerInput } from './performance.ts';

function returnHistory(input: LedgerInput, portfolio: LedgerSeries): ReturnHistoryPoint[] {
  const days = new Map(portfolio.days.map((day) => [day.date, day]));
  const openingAssets = new Map<string, InstanceType<typeof FinancialDecimal>>();
  for (const category of input.categories) {
    openingAssets.set(
      category.openingDate,
      (openingAssets.get(category.openingDate) ?? new FinancialDecimal(0)).plus(
        category.openingBalance,
      ),
    );
  }
  return (portfolio.curve ?? []).map((point) => {
    const day = days.get(point.date)!;
    let openingReturnRate: string | null = null;
    if (point.returnRate !== null) {
      if (day.returnRate === null) openingReturnRate = point.returnRate;
      else if (day.returnRate === '-1') {
        // A total loss cannot be inverted. Reconstruct the opening level without
        // this day's entries, retaining any restored history activated that day.
        openingReturnRate = calculateLedger({
          ...input,
          entries: input.entries.filter((entry) => entry.date < point.date),
          through: point.date,
          timeline: 'events',
          includeOpeningHistory: true,
        }).portfolio.historicalPerformance!.returnRate;
      } else {
        openingReturnRate = serializeRate(
          new FinancialDecimal(point.returnRate)
            .plus(1)
            .div(new FinancialDecimal(day.returnRate).plus(1))
            .minus(1),
        );
      }
    }
    return {
      date: point.date,
      returnRate: point.returnRate,
      rateReason: point.rateReason,
      openingReturnRate,
      dailyReturnRate: day.returnRate,
      carriedReturnRate: new FinancialDecimal(point.closingBalance).gt(0) ? '0' : null,
      openingBalance: new FinancialDecimal(day.openingBalance)
        .plus(openingAssets.get(point.date) ?? 0)
        .toFixed(2),
      closingBalance: point.closingBalance,
      pnl: point.pnl,
      recorded: day.source === 'recorded',
      ...(point.historicalRateIncluded === false ? { historicalRateIncluded: false } : {}),
    };
  });
}

export function createDashboardService(database: AppDatabase, clock: () => string) {
  function dashboard(period: Period, anchor: string): DashboardResponse {
    const today = clock();
    const input = loadLedgerInput(database);
    const stats = statisticsInput(input);
    const allIncluded = stats.categories.length === input.categories.length;
    const earliest = stats.categories.map((item) => item.openingDate).sort()[0];
    const current = calculateLedger({
      ...input,
      through: today,
      timeline: 'events',
      includeOpeningHistory: true,
      includeCurve: allIncluded,
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
    const overviewCurrent = allIncluded
      ? current
      : calculateLedger({
          ...stats,
          through: today,
          timeline: 'events',
          includeOpeningHistory: true,
          includeCurve: true,
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
      earliestDate: earliest ?? null,
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
      returnHistory: earliest
        ? returnHistory(stats, overviewCurrent.portfolio).filter((point) => point.date >= earliest)
        : [],
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
