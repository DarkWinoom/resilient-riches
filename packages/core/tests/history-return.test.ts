import { describe, expect, it } from 'vitest';
import { calculateLedger } from '../src/ledger.ts';
import type { Category } from '../src/types.ts';
describe('historical return baseline', () => {
  const category: Category = {
    id: 'a',
    name: '长期成长',
    color: '#b69a60',
    openingDate: '2026-09-01',
    openingBalance: '500000',
    historicalPnl: '-500000',
  };
  function result(categories: Category[], closing?: string, buy = '0') {
    const ledger = calculateLedger({
      categories,
      entries: closing
        ? [{ categoryId: 'a', date: '2026-09-02', closingBalance: closing, buy, sell: '0' }]
        : [],
      through: '2026-09-02',
      includeOpeningHistory: true,
    });
    return ledger.portfolio.historicalPerformance!;
  }
  it('starts at minus fifty percent and compounds later gains', () => {
    expect(result([category]).returnRate).toBe('-0.5');
    expect(result([category], '550000').returnRate).toBe('-0.45');
    expect(result([category], '660000', '100000').returnRate).toBe('-0.45');
  });
  it('weights history by restored capital across categories', () => {
    expect(result([category, { ...category, id: 'b', historicalPnl: '0' }]).returnRate).toBe(
      '-0.333333333333333333333333333333',
    );
  });
  it('supports past profits and distinguishes invalid or wiped capital', () => {
    expect(
      result([{ ...category, openingBalance: '150000', historicalPnl: '50000' }]).returnRate,
    ).toBe('0.5');
    expect(result([{ ...category, historicalPnl: '500000' }])).toMatchObject({
      returnRate: '1',
    });
    expect(result([{ ...category, openingBalance: '0' }]).returnRate).toBe('-1');
    expect(result([{ ...category, openingBalance: '0' }], '1000', '1000').rateReason).toBe(
      'capital_reset',
    );
  });

  it('defers history until funding, then includes it once and compounds later returns', () => {
    const input = {
      categories: [{ ...category, openingBalance: '0', historicalPnl: '15000' }],
      entries: [
        { categoryId: 'a', date: '2026-10-01', closingBalance: '9800', buy: '10000', sell: '0' },
        { categoryId: 'a', date: '2026-10-02', closingBalance: '9898', buy: '0', sell: '0' },
      ],
      through: '2026-10-03',
      includeOpeningHistory: true,
      includeCurve: true,
    } as const;
    const ledger = calculateLedger(input);
    const curve = ledger.portfolio.curve!;
    expect(curve[0]).toMatchObject({ returnRate: null, cumulativePnl: '15000.00' });
    expect(curve.find((point) => point.date === '2026-09-30')?.returnRate).toBeNull();
    expect(curve.find((point) => point.date === '2026-10-01')).toMatchObject({
      returnRate: '1.48',
      cumulativePnl: '14800.00',
      pnl: '-200.00',
    });
    expect(curve.at(-1)).toMatchObject({ returnRate: '1.5048', cumulativePnl: '14898.00' });
    expect(ledger.portfolio.historicalPerformance?.returnRate).toBe('1.5048');
    expect(ledger.categories[0]?.historicalPerformance?.returnRate).toBe('1.5048');
    expect(
      calculateLedger({ ...input, timeline: 'events' }).portfolio.historicalPerformance,
    ).toEqual(ledger.portfolio.historicalPerformance);
    const later = calculateLedger({ ...input, from: '2026-10-02' });
    expect(later.portfolio.historicalPerformance?.returnRate).toBe('0.01');
    expect(later.portfolio.summary.periodPnl).toBe('98.00');
  });

  it('waits for the category own capital instead of using another category balance', () => {
    const ledger = calculateLedger({
      categories: [
        { ...category, openingBalance: '0', historicalPnl: '500' },
        { ...category, id: 'b', openingBalance: '1000', historicalPnl: '0' },
      ],
      entries: [
        { categoryId: 'a', date: '2026-09-03', closingBalance: '500', buy: '500', sell: '0' },
      ],
      through: '2026-09-03',
      includeOpeningHistory: true,
      includeCurve: true,
    });
    expect(ledger.portfolio.curve?.[0]?.returnRate).toBe('0');
    expect(ledger.categories[0]?.historicalPerformance?.returnRate).toBe('1');
    expect(ledger.portfolio.historicalPerformance?.returnRate).toBe(
      '0.333333333333333333333333333333',
    );
  });

  it('recovers after a zero-capital node and supports history above the opening balance', () => {
    expect(
      result([{ ...category, openingBalance: '1000', historicalPnl: '1500' }]).returnRate,
    ).toBe('1.5');
    const ledger = calculateLedger({
      categories: [{ ...category, openingBalance: '0', historicalPnl: '150' }],
      entries: [
        { categoryId: 'a', date: '2026-09-01', closingBalance: '100', buy: '0', sell: '0' },
        { categoryId: 'a', date: '2026-09-02', closingBalance: '110', buy: '0', sell: '0' },
      ],
      through: '2026-09-02',
      includeOpeningHistory: true,
      includeCurve: true,
    });
    expect(ledger.portfolio.curve?.[0]?.returnRate).toBeNull();
    expect(ledger.portfolio.historicalPerformance?.returnRate).toBe('1.6');
    expect(ledger.portfolio.summary.returnRate).toBe('0.1');
  });
});
