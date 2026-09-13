import { FinancialDecimal } from '@resilient-riches/core';
import type { Period, ReportResponse } from '@resilient-riches/core';
import type { AppDatabase } from '../database/database.ts';
import { loadLedgerInput } from '../database/ledger-input.ts';
import { createDashboardService } from './dashboard-service.ts';

export function createReportService(database: AppDatabase, clock: () => string) {
  const dashboard = createDashboardService(database, clock);
  return function report(period: Period, anchor: string): ReportResponse {
    const data = dashboard.dashboard(period, anchor);
    const entries = loadLedgerInput(database).entries.filter(
      (entry) => entry.date <= data.range.to,
    );
    const categories = data.categories
      .filter(
        (category) =>
          category.openingDate <= data.range.to &&
          (!category.archivedOn || category.archivedOn >= data.range.from),
      )
      .map((category) => ({
        id: category.id,
        name: category.name,
        color: category.color,
        pnl: category.periodPnl,
        endingBalance: category.periodClosingBalance,
        returnRate: category.returnRate,
        lastRecordedDate:
          entries.filter((entry) => entry.categoryId === category.id).at(-1)?.date ?? null,
      }));
    const recordCount = entries.filter((entry) => entry.date >= data.range.from).length;
    const winners = categories
      .filter((category) => new FinancialDecimal(category.pnl).gt(0))
      .sort((a, b) => new FinancialDecimal(b.pnl).cmp(a.pnl));
    const losers = categories
      .filter((category) => new FinancialDecimal(category.pnl).lt(0))
      .sort((a, b) => new FinancialDecimal(a.pnl).cmp(b.pnl));
    const pnl = new FinancialDecimal(data.performance.periodPnl);
    const commentary: string[] = [];
    if (!categories.length) commentary.push('本期尚无启用的分类。');
    else if (!recordCount) commentary.push('本期没有录入记录，收益按零变动展示。');
    else
      commentary.push(
        `本期${pnl.isZero() ? '盈亏持平' : pnl.gt(0) ? '取得正收益' : '出现亏损'}，${winners.length} 个分类盈利，${losers.length} 个分类亏损。`,
      );
    if (data.performance.returnRate !== null)
      commentary.push(
        `组合复利收益率为 ${new FinancialDecimal(data.performance.returnRate).mul(100).toFixed(2)}%。`,
      );
    else if (data.performance.rateReason === 'capital_reset')
      commentary.push('本期本金归零后重新投入，收益金额仍可汇总，连续复利收益率不适用。');
    else if (data.performance.rateReason === 'zero_capital_gain')
      commentary.push('本期存在零本金收益，无法计算连续复利收益率。');
    if (winners[0]) {
      const positive = winners.reduce(
        (sum, category) => sum.plus(category.pnl),
        new FinancialDecimal(0),
      );
      const share = new FinancialDecimal(winners[0].pnl).div(positive).mul(100).toFixed(1);
      commentary.push(`“${winners[0].name}”贡献最多，占盈利分类收益合计的 ${share}%。`);
    }
    if (losers[0]) commentary.push(`“${losers[0].name}”是本期主要亏损来源。`);
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
