import { expect, it } from 'vitest';
import { calculateLedger } from '../src/index.ts';

it('event calculations match daily results without materializing every carried day', () => {
  const input = {
    categories: [
      {
        id: 'a',
        name: '理财',
        color: '#b69a60',
        openingDate: '2026-01-01',
        openingBalance: '10000',
        historicalPnl: '100',
      },
    ],
    entries: [
      { categoryId: 'a', date: '2026-03-04', closingBalance: '12120', buy: '2000', sell: '0' },
      { categoryId: 'a', date: '2026-08-20', closingBalance: '11000', buy: '0', sell: '1000' },
    ],
    from: '2026-05-01',
    through: '2026-09-13',
  };
  const daily = calculateLedger(input);
  const events = calculateLedger({ ...input, timeline: 'events' });
  expect(events.portfolio.summary).toEqual(daily.portfolio.summary);
  expect(events.categories[0]?.summary).toEqual(daily.categories[0]?.summary);
  expect(events.portfolio.days.length).toBeLessThan(5);
  expect(events.portfolio.days.at(-1)).toEqual(daily.portfolio.days.at(-1));
});

it('validates very old opening dates using a bounded number of event points', () => {
  const result = calculateLedger({
    categories: [
      {
        id: 'a',
        name: '理财',
        color: '#b69a60',
        openingDate: '0001-01-01',
        openingBalance: '100',
        historicalPnl: '0',
      },
    ],
    entries: [],
    through: '2026-09-13',
    timeline: 'events',
  });
  expect(result.portfolio.days).toHaveLength(2);
  expect(result.portfolio.summary.closingBalance).toBe('100.00');
});
