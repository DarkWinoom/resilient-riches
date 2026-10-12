import { describe, expect, it } from 'vitest';
import { calculateLedger, FinancialDecimal } from '@resilient-riches/core';
import type { ReturnHistoryPoint } from '@resilient-riches/core';
import { createReturnTimeline } from '../src/utils/return-candles.ts';

const point = (
  date: string,
  returnRate: string | null,
  rateReason: ReturnHistoryPoint['rateReason'] = null,
): ReturnHistoryPoint => ({ date, returnRate, rateReason });
const history = [
  point('2025-12-28', '0'),
  point('2025-12-29', '0.1'),
  point('2025-12-31', '0.05'),
  point('2026-01-01', '0.2'),
  point('2026-01-02', '0.15'),
  point('2026-01-04', '0.12'),
  point('2026-01-05', '0.18'),
];

describe('homepage return candles', () => {
  it('skips unrecorded calendar dates and calculates recorded-day returns by compounding', () => {
    const timeline = createReturnTimeline(history, 'day', '2026-01-07');
    expect(timeline.length).toBe(7);
    expect(timeline.candles(0, 7).map((candle) => candle.from)).not.toContain('2026-01-03');
    const recovered = timeline.candles(6, 1)[0]!;
    expect(recovered).toMatchObject({
      from: '2026-01-05',
      open: '0.12',
      close: '0.18',
      direction: 'up',
    });
    expect(new FinancialDecimal(recovered.returnRate!).toNumber()).toBeCloseTo(1.18 / 1.12 - 1, 12);
    expect(recovered.returnRate).not.toBe('0.06');
  });
  it('keeps explicitly recorded zero returns and undefined rates but excludes opening and carried dates', () => {
    const timeline = createReturnTimeline(
      [
        { ...point('2026-09-01', null, 'no_capital'), recorded: false },
        { ...point('2026-09-03', null, 'no_capital'), recorded: true },
        { ...point('2026-09-05', '0'), recorded: true },
        { ...point('2026-09-06', '0'), recorded: false },
      ],
      'day',
      '2026-09-06',
    );
    expect(timeline.candles(0, 10).map((candle) => candle.from)).toEqual([
      '2026-09-03',
      '2026-09-05',
    ]);
    expect(timeline.candles(1, 1)[0]?.direction).toBe('flat');
    expect(
      createReturnTimeline([{ ...point('2026-09-01', '0'), recorded: false }], 'day', '2026-09-06')
        .length,
    ).toBe(0);
  });
  it('groups weeks from Monday across year boundaries and includes the opening level in extrema', () => {
    const timeline = createReturnTimeline(history, 'week', '2026-01-07');
    expect(timeline.length).toBe(3);
    expect(timeline.candles(1, 2)).toMatchObject([
      {
        date: '2025-12-29',
        from: '2025-12-29',
        to: '2026-01-04',
        open: '0',
        close: '0.12',
        high: '0.2',
        low: '0',
        returnRate: '0.12',
        partial: false,
      },
      {
        date: '2026-01-05',
        to: '2026-01-07',
        open: '0.12',
        close: '0.18',
        high: '0.18',
        low: '0.12',
        partial: true,
      },
    ]);
  });
  it.each(['month', 'year'] as const)(
    'preserves cumulative levels when switching to %s candles',
    (period) => {
      const timeline = createReturnTimeline(history, period, '2026-01-07');
      expect(timeline.candles(1, 1)[0]).toMatchObject({
        from: '2026-01-01',
        to: '2026-01-07',
        open: '0.05',
        close: '0.18',
        high: '0.2',
        low: '0.05',
        partial: true,
      });
    },
  );
  it('finishes leap months, Sunday weeks and calendar years without a partial badge', () => {
    for (const [period, today] of [
      ['month', '2024-02-29'],
      ['week', '2024-03-03'],
      ['year', '2024-12-31'],
    ] as const) {
      const timeline = createReturnTimeline([point('2024-02-01', '0')], period, today);
      expect(timeline.candles(timeline.length - 1, 1)[0]?.partial).toBe(false);
    }
  });
  it('preserves restored history and ignores deposits and withdrawals when drawing returns', () => {
    const ledger = calculateLedger({
      categories: [
        {
          id: 'a',
          name: 'A',
          color: '#b69a60',
          openingDate: '2026-01-01',
          openingBalance: '1000',
          historicalPnl: '500',
        },
      ],
      entries: [
        { categoryId: 'a', date: '2026-01-02', closingBalance: '2100', buy: '1000', sell: '0' },
        { categoryId: 'a', date: '2026-01-03', closingBalance: '1050', buy: '0', sell: '1050' },
      ],
      through: '2026-01-04',
      timeline: 'events',
      includeCurve: true,
      includeOpeningHistory: true,
    });
    const points = ledger.portfolio.curve!.map((item) => ({
      ...item,
      recorded: ledger.portfolio.days.find((day) => day.date === item.date)?.source === 'recorded',
      ...(item.date === '2026-01-01'
        ? { openingReturnRate: '1', dailyReturnRate: '0', openingBalance: '1000.00' }
        : {}),
    }));
    const daily = createReturnTimeline(points, 'day', '2026-01-04').candles(0, 4);
    expect(daily).toHaveLength(2);
    expect(daily[0]).toMatchObject({
      open: '1',
      close: '1.1',
      returnRate: '0.05',
      openingBalance: '1000.00',
      closingBalance: '2100.00',
      pnl: '100.00',
    });
    expect(daily[1]).toMatchObject({
      open: '1.1',
      close: '1.1',
      returnRate: '0',
      direction: 'flat',
      openingBalance: '2100.00',
      closingBalance: '1050.00',
      pnl: '0.00',
    });
    expect(daily.at(-1)?.close).toBe(ledger.portfolio.historicalPerformance?.returnRate);
    const monthly = createReturnTimeline(points, 'month', '2026-01-04').candles(0, 1)[0]!;
    expect(monthly).toMatchObject({
      openingBalance: '1000.00',
      closingBalance: '1050.00',
      pnl: '100.00',
      open: '1',
    });
  });
  it.each(['day', 'week', 'month', 'year'] as const)(
    'keeps a withdrawn portfolio level flat without fabricating measurable %s returns',
    (period) => {
      const timeline = createReturnTimeline(
        [
          {
            ...point('2026-09-01', '0.2'),
            openingReturnRate: '0.2',
            dailyReturnRate: null,
            carriedReturnRate: null,
          },
        ],
        period,
        '2026-09-03',
      );
      const candles = timeline.candles(0, timeline.length);
      expect(candles.length).toBeGreaterThan(0);
      for (const candle of candles)
        expect(candle).toMatchObject({
          open: '0.2',
          close: '0.2',
          direction: 'flat',
          returnRate: null,
        });
    },
  );
  it('distinguishes an undefined rate from a valid zero and does not bridge a missing return', () => {
    const points = [
      point('2026-09-01', '0'),
      point('2026-09-02', null, 'zero_capital_gain'),
      point('2026-09-03', '0.1'),
      point('2026-09-04', '0.21'),
    ];
    const candles = createReturnTimeline(points, 'day', '2026-09-04').candles(0, 4);
    expect(candles[0]).toMatchObject({ open: '0', close: '0', direction: 'flat' });
    expect(candles[1]).toMatchObject({
      close: null,
      high: null,
      low: null,
      direction: 'missing',
      rateReason: 'zero_capital_gain',
    });
    expect(candles[2]).toMatchObject({
      open: null,
      close: '0.1',
      direction: 'missing',
      returnRate: null,
    });
    expect(candles[3]).toMatchObject({
      open: '0.1',
      close: '0.21',
      direction: 'up',
      returnRate: '0.1',
    });
    expect(createReturnTimeline(points, 'month', '2026-09-04').candles(0, 1)[0]).toMatchObject({
      high: null,
      low: null,
      direction: 'missing',
      returnRate: null,
    });
  });
  it('includes known daily opening levels when aggregating shadows after a history restoration', () => {
    const timeline = createReturnTimeline(
      [
        {
          ...point('2026-09-01', '0'),
          openingReturnRate: '0',
          dailyReturnRate: '0',
          carriedReturnRate: '0',
        },
        {
          ...point('2026-09-02', '-1'),
          openingReturnRate: '1',
          dailyReturnRate: '-1',
          carriedReturnRate: null,
        },
      ],
      'week',
      '2026-09-02',
    );
    expect(timeline.candles(0, 1)[0]).toMatchObject({
      open: '0',
      close: '-1',
      high: '1',
      low: '-1',
      direction: 'down',
    });
  });
  it('starts at the first measurable investment without turning earlier no-capital days into zero', () => {
    const timeline = createReturnTimeline(
      [point('2026-09-01', null, 'no_capital'), point('2026-09-05', '-0.02')],
      'day',
      '2026-09-06',
    );
    expect(timeline.candles(0, 1)[0]).toMatchObject({
      open: null,
      close: null,
      direction: 'missing',
    });
    expect(timeline.candles(1, 1)).toMatchObject([
      { open: '0', close: '-0.02', returnRate: '-0.02', direction: 'down' },
    ]);
  });
  it('uses candle direction even below zero and never caps returns at 100%', () => {
    const candles = createReturnTimeline(
      [point('2026-09-01', '-0.1'), point('2026-09-02', '-0.05'), point('2026-09-03', '1.48')],
      'day',
      '2026-09-03',
    ).candles(0, 3);
    expect(candles[1]).toMatchObject({ direction: 'up', close: '-0.05' });
    expect(candles[2]).toMatchObject({ direction: 'up', close: '1.48', high: '1.48' });
  });
  it('does not divide by a wiped-out factor or invent a new continuous capital baseline', () => {
    const candles = createReturnTimeline(
      [
        point('2026-09-01', '-1'),
        point('2026-09-02', '-1'),
        point('2026-09-03', null, 'capital_reset'),
      ],
      'day',
      '2026-09-03',
    ).candles(0, 3);
    expect(candles[0]).toMatchObject({ returnRate: '-1', direction: 'down' });
    expect(candles[1]).toMatchObject({
      open: '-1',
      close: '-1',
      returnRate: null,
      direction: 'flat',
    });
    expect(candles[2]).toMatchObject({
      returnRate: null,
      direction: 'missing',
      rateReason: 'capital_reset',
    });
  });
  it('expands only the requested candles for histories beginning centuries ago and omits future events', () => {
    const timeline = createReturnTimeline(
      [point('0001-01-01', '0'), point('2027-01-01', '0.5')],
      'week',
      '2026-10-12',
    );
    expect(timeline.length).toBeGreaterThan(100000);
    expect(
      timeline.candles(timeline.length - 1, 1).map((candle) => [candle.from, candle.close]),
    ).toEqual([['2026-10-12', '0']]);
    expect(createReturnTimeline([], 'day', '2026-10-12').length).toBe(0);
  });
});
