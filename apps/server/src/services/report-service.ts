import { FinancialDecimal, periodLabel } from '@resilient-riches/core';
import type { Period, ReportResponse } from '@resilient-riches/core';
import type { AppDatabase } from '../database/database.ts';
import { loadLedgerInput } from '../database/ledger-input.ts';
import { performance, statisticsInput } from './performance.ts';

export function createReportService(database: AppDatabase, clock: () => string) {
  return function report(period: Period, anchor: string): ReportResponse {
    const today = clock();
    const input = statisticsInput(loadLedgerInput(database));
    const selected = performance(input, today, period, anchor);
    const data = {
      today,
      range: selected.range,
      performance: selected.summary,
      curve: selected.curve,
      categories: input.categories,
    };
    const summaries = new Map(selected.ledger.categories.map((item) => [item.categoryId, item]));
    const label = periodLabel(period, data.range.to === today);
    const entries = input.entries.filter((entry) => entry.date <= data.range.to);
    const categories = data.categories
      .filter(
        (category) =>
          category.openingDate <= data.range.to &&
          (!category.archivedOn || category.archivedOn >= data.range.from),
      )
      .map((category) => {
        const item = summaries.get(category.id)!;
        const summary = item.summary;
        return {
          id: category.id,
          name: category.name,
          color: category.color,
          pnl: period === 'all' ? summary.cumulativePnl : summary.periodPnl,
          endingBalance: summary.closingBalance,
          returnRate:
            period === 'all' ? item.historicalPerformance!.returnRate : summary.returnRate,
          ...(period === 'all' && item.historicalPerformance!.historicalRateIncluded === false
            ? { historicalRateIncluded: false }
            : {}),
          lastRecordedDate:
            entries.filter((entry) => entry.categoryId === category.id).at(-1)?.date ?? null,
        };
      });
    const recordCount = entries.filter((entry) => entry.date >= data.range.from).length;
    const winners = categories
      .filter((category) => new FinancialDecimal(category.pnl).gt(0))
      .sort((a, b) => new FinancialDecimal(b.pnl).cmp(a.pnl));
    const losers = categories
      .filter((category) => new FinancialDecimal(category.pnl).lt(0))
      .sort((a, b) => new FinancialDecimal(a.pnl).cmp(b.pnl));
    const pnl = new FinancialDecimal(data.performance.periodPnl);
    const commentary: string[] = [];
    if (!categories.length) commentary.push(label + '尚无启用的分类。');
    else if (!recordCount) commentary.push(label + '没有录入记录。');
    else
      commentary.push(
        `${label}${pnl.isZero() ? '盈亏持平' : pnl.gt(0) ? '取得正收益' : '出现亏损'}，${winners.length} 个分类盈利，${losers.length} 个分类亏损。`,
      );
    if (data.performance.returnRate !== null)
      commentary.push(
        `组合收益率为 ${new FinancialDecimal(data.performance.returnRate).mul(100).toFixed(2)}%。`,
      );
    if (winners[0]) {
      const positive = winners.reduce(
        (sum, category) => sum.plus(category.pnl),
        new FinancialDecimal(0),
      );
      const share = new FinancialDecimal(winners[0].pnl).div(positive).mul(100).toFixed(1);
      commentary.push(`“${winners[0].name}”贡献最多，占盈利分类收益合计的 ${share}%。`);
    }
    if (losers[0]) commentary.push(`“${losers[0].name}”是${label}主要亏损来源。`);
    return {
      today: data.today,
      period,
      anchor,
      range: data.range,
      current: data.range.to === data.today,
      summary: data.performance,
      curve: data.curve,
      categories,
      recordCount,
      commentary,
    };
  };
}
