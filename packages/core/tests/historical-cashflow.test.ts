import { describe, expect, it } from 'vitest';
import { calculateLedger, FinancialDecimal as D, formatMoney } from '../src/index.ts';

describe('historical baseline and external cash flows', () => {
  it.each(['-15000', '15000', '999999999999.99'])(
    'never attaches unsupported history %s to a later deposit',
    (history) => {
      for (const first of ['0.01', '10000', '1000000']) {
        const result = calculateLedger({
          categories: [
            {
              id: 'a',
              name: '理财',
              color: '#b69a60',
              openingDate: '2026-09-01',
              openingBalance: '0',
              historicalPnl: history,
            },
          ],
          entries: [
            { categoryId: 'a', date: '2026-09-02', closingBalance: first, buy: first, sell: '0' },
            {
              categoryId: 'a',
              date: '2026-09-03',
              closingBalance: '1000000',
              buy: new D(1000000).minus(first).toFixed(2),
              sell: '0',
            },
          ],
          through: '2026-09-03',
          includeOpeningHistory: true,
          includeCurve: true,
        });
        expect(result.portfolio.curve?.[0]?.returnRate).toBeNull();
        expect(result.portfolio.historicalPerformance!.returnRate).toBe('0');
        expect(result.portfolio.summary.cumulativePnl).toBe(new D(history).toFixed(2));
      }
    },
  );
  it('matches independent geometric linking for opening-day and later cash flows', () => {
    let cases = 0;
    for (const opening of [1n, 100n, 10000n, 1000000n, 100000000n, 100000000000n]) {
      for (const history of new Set([
        -10n * opening,
        -opening,
        -opening / 2n,
        0n,
        opening / 2n,
        (opening * 9n) / 10n,
        opening - 1n,
      ])) {
        for (const flow of new Set([0n, opening, 100n * opening, -opening / 2n, -(opening - 1n)])) {
          const capital = opening + flow;
          if (capital <= 0n) continue;
          for (const gain of new Set([0n, capital / 100n, -capital / 100n])) {
            const expected = new D(opening.toString())
              .div((opening - history).toString())
              .mul(new D((capital + gain).toString()).div(capital.toString()))
              .minus(1);
            for (const date of ['2026-09-01', '2026-09-02']) {
              const result = calculateLedger({
                categories: [
                  {
                    id: 'a',
                    name: '理财',
                    color: '#b69a60',
                    openingDate: '2026-09-01',
                    openingBalance: formatMoney(opening),
                    historicalPnl: formatMoney(history),
                  },
                ],
                entries: [
                  {
                    categoryId: 'a',
                    date,
                    closingBalance: formatMoney(capital + gain),
                    buy: formatMoney(flow > 0n ? flow : 0n),
                    sell: formatMoney(flow < 0n ? -flow : 0n),
                  },
                ],
                through: '2026-09-03',
                includeOpeningHistory: true,
                includeCurve: true,
              });
              const rate = result.portfolio.historicalPerformance!.returnRate;
              expect(rate, `${opening}/${history}/${flow}/${gain}/${date}`).not.toBeNull();
              expect(new D(rate!).minus(expected).abs().lt('1e-25')).toBe(true);
              expect(result.portfolio.curve!.at(-1)!.returnRate).toBe(rate);
              expect(result.categories[0]!.historicalPerformance!.returnRate).toBe(rate);
              expect(result.portfolio.summary.cumulativePnl).toBe(formatMoney(history + gain));
              cases++;
            }
          }
        }
      }
    }
    expect(cases).toBe(912);
  });

  it.each(['-10000', '0', '5000', '9999'])(
    'preserves history %s through repeated maximum-size flows',
    (history) => {
      let balance = 1000000n;
      const entries = Array.from({ length: 100 }, (_, i) => {
        const closing = i % 2 === 0 ? 99999999999999n : 1n;
        const flow = closing - balance;
        balance = closing;
        return {
          categoryId: 'a',
          date: new Date(Date.UTC(2026, 8, 2 + i)).toISOString().slice(0, 10),
          closingBalance: formatMoney(closing),
          buy: formatMoney(flow > 0n ? flow : 0n),
          sell: formatMoney(flow < 0n ? -flow : 0n),
        };
      });
      const result = calculateLedger({
        categories: [
          {
            id: 'a',
            name: '理财',
            color: '#b69a60',
            openingDate: '2026-09-01',
            openingBalance: '10000',
            historicalPnl: history,
          },
        ],
        entries,
        through: entries.at(-1)!.date,
        includeOpeningHistory: true,
      });
      const expected = new D(10000).div(new D(10000).minus(history)).minus(1);
      expect(
        new D(result.portfolio.historicalPerformance!.returnRate!)
          .minus(expected)
          .abs()
          .lt('1e-25'),
      ).toBe(true);
      expect(result.portfolio.summary.cumulativePnl).toBe(new D(history).toFixed(2));
    },
  );

  it.each(['2026-09-01', '2026-09-02'])(
    'retains the opening factor when fully withdrawn on %s',
    (date) => {
      const result = calculateLedger({
        categories: [
          {
            id: 'a',
            name: '理财',
            color: '#b69a60',
            openingDate: '2026-09-01',
            openingBalance: '10000',
            historicalPnl: '5000',
          },
        ],
        entries: [{ categoryId: 'a', date, closingBalance: '0', buy: '0', sell: '10000' }],
        through: '2026-09-03',
        includeOpeningHistory: true,
      });
      expect(result.portfolio.historicalPerformance!.returnRate).toBe('1');
      expect(result.portfolio.summary.closingBalance).toBe('0.00');
    },
  );
});
