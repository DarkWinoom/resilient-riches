import { describe, expect, it } from 'vitest';
import { calculateLedger } from '@resilient-riches/core';
import { loadLedgerInput } from '../src/database/ledger-input.ts';
import { databaseFixture, insertCategory, insertEntry } from './fixtures.ts';

describe('database-to-calculator boundary', () => {
  const fixture = databaseFixture();
  it('reads integer cents as decimal money and preserves recorded dates', () => {
    const database = fixture.open();
    insertCategory(database);
    database.prepare('UPDATE categories SET historical_pnl_minor = 20000').run();
    insertEntry(database);
    const input = loadLedgerInput(database);
    expect(input.categories[0]?.openingBalance).toBe('10000.00');
    expect(input.entries[0]?.closingBalance).toBe('10100.00');
    const result = calculateLedger({ ...input, through: '2026-09-03' });
    expect(result.portfolio.summary).toMatchObject({
      closingBalance: '10100.00',
      periodPnl: '100.00',
      cumulativePnl: '300.00',
      returnRate: '0.01',
      lastRecordedDate: '2026-09-01',
    });
  });
  it('recalculates from current rows after an edit or deletion', () => {
    const database = fixture.open();
    insertCategory(database);
    insertEntry(database);
    const calculate = () =>
      calculateLedger({ ...loadLedgerInput(database), through: '2026-09-03' });
    database.prepare('UPDATE daily_entries SET closing_balance_minor = 1020100').run();
    expect(calculate().portfolio.summary.periodPnl).toBe('201.00');
    database.prepare('DELETE FROM daily_entries').run();
    expect(calculate().portfolio.summary).toMatchObject({
      closingBalance: '10000.00',
      periodPnl: '0.00',
      returnRate: '0',
      lastRecordedDate: null,
    });
  });
});
