import { Decimal } from 'decimal.js';
import { LedgerError } from './errors.ts';

export const MAX_INPUT_MINOR = 99_999_999_999_999n;
export const MAX_TOTAL_MINOR = 9_223_372_036_854_775_807n;
export const FinancialDecimal = Decimal.clone({ precision: 50, rounding: Decimal.ROUND_HALF_UP });

export function parseMoney(value: unknown, field = 'amount', signed = true): bigint {
  if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) {
    throw new LedgerError('INVALID_MONEY', '金额必须是最多两位小数的十进制字符串', field);
  }
  const negative = value.startsWith('-');
  const [whole = '0', fraction = ''] = value.replace(/^-/, '').split('.');
  const absolute = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (absolute > MAX_INPUT_MINOR) {
    throw new LedgerError('MONEY_LIMIT', '单项金额超出支持范围', field);
  }
  if (!signed && negative && absolute !== 0n) {
    throw new LedgerError('NEGATIVE_MONEY', '此金额不能为负数', field);
  }
  return negative ? -absolute : absolute;
}

export function checkTotal(value: bigint): bigint {
  if (value > MAX_TOTAL_MINOR || value < -MAX_TOTAL_MINOR) {
    throw new LedgerError('TOTAL_LIMIT', '汇总金额超出支持范围');
  }
  return value;
}

export function formatMoney(value: bigint): string {
  checkTotal(value);
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

export function sumMoney(values: readonly bigint[]): bigint {
  return checkTotal(values.reduce((sum, value) => sum + value, 0n));
}

export function serializeRate(value: Decimal): string {
  return value.toDecimalPlaces(30).toFixed();
}
