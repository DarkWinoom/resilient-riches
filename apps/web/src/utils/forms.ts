import { parseMoney, validateEntryDate } from '@resilient-riches/core';
import type { CategoryValues, EntryWrite } from '@resilient-riches/core';

export function categoryErrors(values: CategoryValues, today: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!values.name.trim() || [...values.name.trim()].length > 40)
    errors.name = '请输入1–40字的名称';
  if (!/^#[0-9a-f]{6}$/i.test(values.color)) errors.color = '请输入六位十六进制颜色，如#b69a60';
  try {
    validateEntryDate(values.openingDate, today);
  } catch {
    errors.openingDate = '请输入有效日期，且不能晚于今天';
  }
  for (const key of ['openingBalance', 'historicalPnl'] as const) {
    try {
      parseMoney(values[key], key, key === 'historicalPnl');
    } catch {
      errors[key] = '请输入有效金额，最多两位小数';
    }
  }
  if ([...values.note].length > 1000) errors.note = '备注最多1000字';
  return errors;
}

export function entryErrors(values: EntryWrite): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const key of ['closingBalance', 'buy', 'sell'] as const) {
    try {
      parseMoney(values[key], key, false);
    } catch {
      errors[key] = '请输入非负金额，最多两位小数';
    }
  }
  if ([...values.note].length > 1000) errors.note = '备注最多1000字';
  return errors;
}
