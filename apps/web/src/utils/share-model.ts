import type { Period, DateRange, ReportResponse, RateReason } from '@resilient-riches/core';

export interface ShareOptions {
  hideAmounts: boolean;
  hideCategories: boolean;
}
export interface ShareAmounts {
  pnl: string;
}
export interface ShareModel {
  period: Period;
  range: DateRange;
  current: boolean;
  returnRate: string | null;
  rateReason: RateReason | null;
  amounts?: ShareAmounts;
  curve: { date: string; returnRate: string | null; cumulativePnl?: string }[];
  categories?: { name: string; color: string; returnRate: string | null; amounts?: ShareAmounts }[];
}
export function buildShareModel(report: ReportResponse, options: ShareOptions): ShareModel {
  return {
    period: report.period,
    range: { from: report.range.from, to: report.range.to },
    current: report.current,
    returnRate: report.summary.returnRate,
    rateReason: report.summary.rateReason,
    ...(!options.hideAmounts ? { amounts: { pnl: report.summary.periodPnl } } : {}),
    curve:
      report.period === 'day'
        ? []
        : report.curve.map((point) => ({
            date: point.date,
            returnRate: point.returnRate,
            ...(!options.hideAmounts ? { cumulativePnl: point.cumulativePnl } : {}),
          })),
    ...(!options.hideCategories
      ? {
          categories: report.categories.map((category) => ({
            name: category.name,
            color: category.color,
            returnRate: category.returnRate,
            ...(!options.hideAmounts ? { amounts: { pnl: category.pnl } } : {}),
          })),
        }
      : {}),
  };
}
export const reportTitles: Record<Period, string> = {
  day: '收益日报',
  week: '收益周报',
  month: '收益月报',
  year: '收益年报',
  all: '收益总览',
};
export function shareFilename(model: ShareModel): string {
  return `resilient-riches-${model.period}-${model.range.from}-${model.range.to}${model.amounts ? '' : '-percent'}${model.categories ? '' : '-overview'}.png`;
}
