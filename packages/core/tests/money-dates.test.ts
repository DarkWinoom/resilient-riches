import { describe, expect, it } from 'vitest';
import {
  addDays,
  datesBetween,
  formatMoney,
  MAX_INPUT_MINOR,
  MAX_TOTAL_MINOR,
  parseDate,
  parseMoney,
  periodRange,
  sumMoney,
  today,
  validateEntryDate,
} from '../src/index.ts';

describe('money boundaries', () => {
  it('preserves cents, signs and values above the JS safe integer range', () => {
    expect(parseMoney('0.10')).toBe(10n);
    expect(formatMoney(parseMoney('-1234.5'))).toBe('-1234.50');
    expect(formatMoney(parseMoney('-0.00'))).toBe('0.00');
    expect(parseMoney('999999999999.99')).toBe(MAX_INPUT_MINOR);
    expect(formatMoney(9_007_199_254_740_993n)).toBe('90071992547409.93');
  });
  it.each(['1e3', '0.001', '', ' 1', '+1', 'NaN', 'Infinity', '01.00', 12, null])(
    'rejects ambiguous money %s',
    (value) => {
      expect(() => parseMoney(value)).toThrow();
    },
  );
  it('enforces individual and aggregate limits', () => {
    expect(() => parseMoney('1000000000000')).toThrow();
    expect(() => parseMoney('-1', 'balance', false)).toThrow();
    expect(sumMoney([MAX_TOTAL_MINOR, -1n])).toBe(MAX_TOTAL_MINOR - 1n);
    expect(() => sumMoney([MAX_TOTAL_MINOR, 1n])).toThrow();
    expect(() => formatMoney(-MAX_TOTAL_MINOR - 1n)).toThrow();
  });
});

describe('business dates', () => {
  it('uses Shanghai dates independently of the machine timezone', () => {
    expect(today(new Date('2026-12-31T15:59:00Z'))).toBe('2026-12-31');
    expect(today(new Date('2026-12-31T16:00:00Z'))).toBe('2027-01-01');
  });
  it('handles leap days and year boundaries', () => {
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect([...datesBetween('2024-02-28', '2024-03-01')]).toEqual([
      '2024-02-28',
      '2024-02-29',
      '2024-03-01',
    ]);
    expect(parseDate('0001-01-01').getUTCFullYear()).toBe(1);
  });
  it.each([
    '2025-02-29',
    '2026-04-31',
    '2026-13-01',
    '0000-01-01',
    '2026-9-01',
    '2026-01-01T00:00:00Z',
  ])('rejects invalid date %s', (date) => {
    expect(() => parseDate(date)).toThrow();
  });
  it('uses calendar periods and clips ongoing periods', () => {
    expect(periodRange('week', '2026-01-01', '2026-02-01')).toEqual({
      from: '2025-12-29',
      to: '2026-01-04',
    });
    expect(periodRange('month', '2024-02-15', '2026-09-13')).toEqual({
      from: '2024-02-01',
      to: '2024-02-29',
    });
    expect(periodRange('month', '2026-09-13', '2026-09-13')).toEqual({
      from: '2026-09-01',
      to: '2026-09-13',
    });
    expect(periodRange('year', '2026-09-13', '2026-09-13')).toEqual({
      from: '2026-01-01',
      to: '2026-09-13',
    });
    expect(periodRange('day', '2026-09-12', '2026-09-13')).toEqual({
      from: '2026-09-12',
      to: '2026-09-12',
    });
    expect(() => validateEntryDate('2026-09-14', '2026-09-13')).toThrow();
    expect(() => [...datesBetween('2026-09-02', '2026-09-01')]).toThrow();
  });
});
