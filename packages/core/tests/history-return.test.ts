import { describe, expect, it } from 'vitest';
import { calculateLedger, includeHistoricalReturn } from '../src/ledger.ts';
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
    });
    return includeHistoricalReturn(ledger.portfolio.summary, categories);
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
      returnRate: '0',
      historicalRateIncluded: false,
    });
    expect(result([{ ...category, openingBalance: '0' }]).returnRate).toBe('-1');
    expect(result([{ ...category, openingBalance: '0' }], '1000', '1000').rateReason).toBe(
      'capital_reset',
    );
  });
});
