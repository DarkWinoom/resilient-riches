import { addDays, FinancialDecimal } from '@resilient-riches/core';

export function moneyLabel(value: string): string {
  const [whole = '0', fraction = '00'] = new FinancialDecimal(value).toFixed(2).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
}

export function signedMoney(value: string): string {
  return value.startsWith('-')
    ? `−${moneyLabel(value.slice(1))}`
    : value === '0.00'
      ? '0.00'
      : `+${moneyLabel(value)}`;
}
export function rateLabel(value: string | null): string {
  if (value === null) return '—';
  const number = new FinancialDecimal(value).mul(100);
  return `${number.isPositive() && !number.isZero() ? '+' : ''}${number.toFixed(2)}%`;
}
export function amountTone(value: string): string {
  return new FinancialDecimal(value).isZero() ? 'muted' : value.startsWith('-') ? 'loss' : 'profit';
}
export function returnRateHint(
  pnl: string | undefined,
  rate: string | null,
  historicalRateIncluded?: boolean,
  privateMode = false,
): string | undefined {
  if (privateMode || historicalRateIncluded !== false || rate === null || pnl === undefined)
    return undefined;
  return new FinancialDecimal(pnl).mul(rate).lt(0)
    ? '盈亏含历史金额，收益率仅统计可计算部分。'
    : undefined;
}
export function lastEntryLabel(date: string | null, currentDate: string): string {
  if (!date) return '尚无录入';
  if (date === currentDate) return '今日已录入';
  if (date === addDays(currentDate, -1)) return '上次录入：昨天';
  return `上次录入：${date}`;
}
export function recordingDateLabel(date: string | null, currentDate: string): string {
  if (!date) return '—';
  if (date === currentDate) return '今日';
  return date.slice(0, 4) === currentDate.slice(0, 4) ? date.slice(5) : date;
}
