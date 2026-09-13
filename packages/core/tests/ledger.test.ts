import { describe, expect, it } from 'vitest';
import { calculateDay, calculateLedger, validateCategory } from '../src/index.ts';
import type { Category, DailyEntry } from '../src/index.ts';

const category = (overrides: Partial<Category> = {}): Category => ({
  id: 'a',
  name: '稳健理财',
  color: '#b69a60',
  openingDate: '2026-09-01',
  openingBalance: '10000.00',
  historicalPnl: '0.00',
  ...overrides,
});
const entry = (
  date: string,
  closingBalance: string,
  overrides: Partial<DailyEntry> = {},
): DailyEntry => ({
  categoryId: 'a',
  date,
  closingBalance,
  buy: '0.00',
  sell: '0.00',
  ...overrides,
});
const run = (
  entries: DailyEntry[],
  overrides: Partial<Category> = {},
  through = '2026-09-03',
  from?: string,
) =>
  calculateLedger({
    categories: [category(overrides)],
    entries,
    through,
    ...(from ? { from } : {}),
  });

describe('daily cash-flow convention', () => {
  it.each([
    ['10000', '2000', '0', '12120', '120.00', '0.01'],
    ['10000', '0', '2000', '8080', '80.00', '0.01'],
    ['10000', '2000', '0', '12000', '0.00', '0'],
    ['0.10', '0', '0', '0.11', '0.01', '0.1'],
    ['100', '0', '0', '0', '-100.00', '-1'],
  ])('computes %s + %s - %s → %s', (openingBalance, buy, sell, closingBalance, pnl, rate) => {
    expect(calculateDay({ openingBalance, buy, sell, closingBalance })).toEqual({
      pnl,
      returnRate: rate,
      rateReason: null,
    });
  });
  it('handles full redemption and residual gains without dividing by zero', () => {
    expect(
      calculateDay({ openingBalance: '100', buy: '0', sell: '100', closingBalance: '0' }),
    ).toEqual({ pnl: '0.00', returnRate: null, rateReason: 'no_capital' });
    expect(
      calculateDay({ openingBalance: '100', buy: '0', sell: '100', closingBalance: '1' }),
    ).toEqual({ pnl: '1.00', returnRate: null, rateReason: 'zero_capital_gain' });
    expect(() =>
      calculateDay({ openingBalance: '100', buy: '0', sell: '101', closingBalance: '0' }),
    ).toThrow('卖出');
  });
});

describe('ledger returns and original records', () => {
  it('compounds two 1% days and carries unchanged balances', () => {
    const result = run([entry('2026-09-01', '10100'), entry('2026-09-02', '10201')]);
    expect(result.portfolio.summary).toMatchObject({
      periodPnl: '201.00',
      cumulativePnl: '201.00',
      closingBalance: '10201.00',
      returnRate: '0.0201',
      netInvested: '10000.00',
      lastRecordedDate: '2026-09-02',
    });
    expect(result.categories[0]?.days[2]).toMatchObject({
      source: 'carried',
      closingBalance: '10201.00',
      pnl: '0.00',
      returnRate: '0',
      lastRecordedDate: '2026-09-02',
    });
  });
  it('does not add +10% and -10%', () => {
    const result = run([entry('2026-09-01', '11000'), entry('2026-09-02', '9900')]);
    expect(result.portfolio.summary.returnRate).toBe('-0.01');
    expect(result.portfolio.summary.periodPnl).toBe('-100.00');
  });
  it('keeps intermediate rates at full precision', () => {
    const result = run([entry('2026-09-01', '4'), entry('2026-09-02', '3')], {
      openingBalance: '3',
    });
    expect(result.portfolio.summary.returnRate).toBe('0');
  });
  it('includes historical P&L only once in lifetime amounts', () => {
    const result = run([entry('2026-09-01', '10605')], {
      openingBalance: '10500',
      historicalPnl: '500',
    });
    expect(result.portfolio.summary).toMatchObject({
      closingBalance: '10605.00',
      periodPnl: '105.00',
      cumulativePnl: '605.00',
      historicalPnl: '500.00',
      netInvested: '10000.00',
      returnRate: '0.01',
    });
    expect(run([], { historicalPnl: '-300' }).portfolio.summary.cumulativePnl).toBe('-300.00');
  });
  it('assigns a later balance change to its recorded date', () => {
    const originals = [entry('2026-09-01', '10000'), entry('2026-09-04', '10300')];
    const before = JSON.stringify(originals);
    const result = run(originals, {}, '2026-09-04');
    expect(result.portfolio.days.map((day) => day.pnl)).toEqual(['0.00', '0.00', '0.00', '300.00']);
    expect(result.portfolio.summary.returnRate).toBe('0.03');
    expect(JSON.stringify(originals)).toBe(before);
  });
  it('carries across weekends without requiring synthetic records', () => {
    const result = run([entry('2026-09-11', '10000')], { openingDate: '2026-09-11' }, '2026-09-13');
    expect(result.categories[0]?.days.map((day) => day.source)).toEqual([
      'recorded',
      'carried',
      'carried',
    ]);
    expect(result.portfolio.summary.lastRecordedDate).toBe('2026-09-11');
    expect(result.portfolio.summary.returnRate).toBe('0');
  });
  it('recomputes subsequent P&L after backfill, edit and removal', () => {
    const original = run([entry('2026-09-01', '10100'), entry('2026-09-02', '10201')]);
    const edited = run([entry('2026-09-01', '10050'), entry('2026-09-02', '10201')]);
    expect(edited.portfolio.days.map((day) => day.pnl)).toEqual(['50.00', '151.00', '0.00']);
    expect(edited.portfolio.summary.returnRate).toBe(original.portfolio.summary.returnRate);
    const removed = run([entry('2026-09-01', '10050')]);
    expect(removed.portfolio.summary.closingBalance).toBe('10050.00');
    expect(removed.portfolio.summary.lastRecordedDate).toBe('2026-09-01');
    const backfill = run(
      [entry('2026-09-01', '10000'), entry('2026-09-02', '10100'), entry('2026-09-04', '10300')],
      {},
      '2026-09-04',
    );
    expect(backfill.portfolio.days.map((day) => day.pnl)).toEqual([
      '0.00',
      '100.00',
      '0.00',
      '200.00',
    ]);
    expect(backfill.portfolio.summary.returnRate).toBe('0.03');
  });
  it('aggregates capital before calculating portfolio returns', () => {
    const result = calculateLedger({
      categories: [category(), category({ id: 'b', openingBalance: '30000' })],
      entries: [entry('2026-09-01', '10100')],
      through: '2026-09-01',
    });
    expect(result.portfolio.summary.returnRate).toBe('0.0025');
    expect(result.portfolio.summary.periodPnl).toBe('100.00');
  });
  it('cancels paired transfers in the overall portfolio', () => {
    const result = calculateLedger({
      categories: [category(), category({ id: 'b', openingBalance: '5000' })],
      entries: [
        entry('2026-09-01', '8000', { sell: '2000' }),
        entry('2026-09-01', '7000', { categoryId: 'b', buy: '2000' }),
      ],
      through: '2026-09-01',
    });
    expect(result.portfolio.summary).toMatchObject({
      closingBalance: '15000.00',
      periodPnl: '0.00',
      returnRate: '0',
      netInvested: '15000.00',
    });
  });
  it('treats a new category opening balance as added capital', () => {
    const result = calculateLedger({
      categories: [
        category(),
        category({
          id: 'b',
          openingDate: '2026-09-02',
          openingBalance: '5000',
          historicalPnl: '500',
        }),
      ],
      entries: [],
      through: '2026-09-03',
    });
    expect(result.portfolio.days[1]).toMatchObject({
      buy: '5000.00',
      openingBalance: '10000.00',
      pnl: '0.00',
    });
    expect(result.portfolio.summary).toMatchObject({
      returnRate: '0',
      cumulativePnl: '500.00',
      netInvested: '14500.00',
    });
  });
  it('separates wiped-out capital from a later new investment', () => {
    const entries = [entry('2026-09-01', '0'), entry('2026-09-02', '110', { buy: '100' })];
    const result = run(entries, { openingBalance: '100' });
    expect(result.portfolio.summary).toMatchObject({
      periodPnl: '-90.00',
      returnRate: null,
      rateReason: 'capital_reset',
    });
    expect(result.portfolio.summary.segments.map((segment) => segment.returnRate)).toEqual([
      '-1',
      '0.1',
    ]);
    expect(
      run(entries, { openingBalance: '100' }, '2026-09-03', '2026-09-02').portfolio.summary
        .returnRate,
    ).toBe('0.1');
  });
  it('does not treat a normal exit and re-entry as capital being wiped out', () => {
    const result = run(
      [
        entry('2026-09-01', '110'),
        entry('2026-09-02', '0', { sell: '110' }),
        entry('2026-09-03', '105', { buy: '100' }),
      ],
      { openingBalance: '100' },
    );
    expect(result.portfolio.summary.returnRate).toBe('0.155');
  });
  it('propagates undefined zero-capital gains, while empty capital is neutral', () => {
    const result = run([entry('2026-09-01', '1', { sell: '100' })], { openingBalance: '100' });
    expect(result.portfolio.summary).toMatchObject({
      periodPnl: '1.00',
      returnRate: null,
      rateReason: 'zero_capital_gain',
    });
    expect(run([], { openingBalance: '0' }).portfolio.summary).toMatchObject({
      returnRate: null,
      rateReason: 'no_capital',
    });
  });
  it('preserves archived history and never reinjects the opening capital on restoration', () => {
    const records = [entry('2026-09-01', '110'), entry('2026-09-02', '0', { sell: '110' })];
    const archived = run(records, {
      openingBalance: '100',
      historicalPnl: '5',
      archivedOn: '2026-09-02',
    });
    expect(archived.categories[0]?.days.at(-1)?.source).toBe('archived');
    expect(archived.portfolio.summary.cumulativePnl).toBe('15.00');
    const restored = run([...records, entry('2026-09-03', '55', { buy: '50' })], {
      openingBalance: '100',
      historicalPnl: '5',
    });
    expect(restored.portfolio.days.at(-1)?.buy).toBe('50.00');
    expect(restored.portfolio.summary).toMatchObject({
      closingBalance: '55.00',
      cumulativePnl: '20.00',
      returnRate: '0.21',
    });
  });
  it('excludes unopened categories and ignores later records for historical reports', () => {
    const result = calculateLedger({
      categories: [category({ openingDate: '2026-10-01', historicalPnl: '500' })],
      entries: [],
      through: '2026-09-13',
    });
    expect(result.portfolio.summary).toMatchObject({
      closingBalance: '0.00',
      historicalPnl: '0.00',
      cumulativePnl: '0.00',
      lastRecordedDate: null,
    });
    expect(
      run([entry('2026-09-03', '10500')], {}, '2026-09-02').portfolio.summary.lastRecordedDate,
    ).toBeNull();
  });
  it('aggregates amounts above Number.MAX_SAFE_INTEGER in cents exactly', () => {
    const categories = Array.from({ length: 100 }, (_, index) =>
      category({ id: `c${index}`, openingBalance: '999999999999.99' }),
    );
    expect(
      calculateLedger({ categories, entries: [], through: '2026-09-01' }).portfolio.summary
        .closingBalance,
    ).toBe('99999999999999.00');
  });
  it('rejects invalid relationships and category state', () => {
    expect(() => run([entry('2026-09-01', '10', { categoryId: 'unknown' })])).toThrow();
    expect(() => run([entry('2026-09-01', '10'), entry('2026-09-01', '20')])).toThrow();
    expect(() => run([entry('2026-08-31', '10')])).toThrow();
    expect(() => run([], { archivedOn: '2026-09-02' })).toThrow('清空');
    expect(() => run([entry('2026-09-03', '0')], { archivedOn: '2026-09-02' })).toThrow();
    expect(() =>
      calculateLedger({ categories: [category(), category()], entries: [], through: '2026-09-01' }),
    ).toThrow();
    expect(() => validateCategory(category({ color: 'red' }))).toThrow();
    expect(() => validateCategory(category({ name: '' }))).toThrow();
  });
});
