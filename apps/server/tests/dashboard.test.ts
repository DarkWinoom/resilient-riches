import { afterEach, describe, expect, it } from 'vitest';
import { FinancialDecimal } from '@resilient-riches/core';
import type {
  DashboardResponse,
  CategoryDetailResponse,
  ReportResponse,
} from '@resilient-riches/core';
import { createApp } from '../src/app.ts';
import { createLedgerService } from '../src/services/ledger-service.ts';
import { databaseFixture } from './fixtures.ts';

describe('dashboard aggregation', () => {
  const fixture = databaseFixture();
  const apps: Awaited<ReturnType<typeof createApp>>[] = [];
  afterEach(async () => {
    for (const app of apps) await app.close();
    apps.length = 0;
  });
  async function setup(clock = '2026-09-13') {
    const database = fixture.open();
    const app = await createApp({ database, clock: () => clock });
    apps.push(app);
    const service = createLedgerService(database, () => clock);
    const category = (
      name: string,
      openingDate = '2026-09-01',
      openingBalance = '1000',
      historicalPnl = '0',
    ) =>
      service.createCategory({
        name,
        color: '#b69a60',
        openingDate,
        openingBalance,
        historicalPnl,
        note: '',
      });
    const write = (id: string, date: string, closingBalance: string, buy = '0', sell = '0') => {
      const item = service.readDay(date).items.find((row) => row.category.id === id)!;
      return service.saveEntries(date, [
        {
          categoryId: id,
          categoryRevision: item.category.revision,
          revision: item.entry?.revision ?? null,
          closingBalance,
          buy,
          sell,
          note: '',
        },
      ]);
    };
    const get = async (period = 'month', anchor = clock) =>
      (
        await app.inject({ url: `/api/v1/dashboard?period=${period}&anchor=${anchor}` })
      ).json<DashboardResponse>();
    return { app, service, category, write, get };
  }
  it('keeps current, today and month cards independent of historical filters', async () => {
    const { category, write, get } = await setup();
    const a = category('A', '2026-08-01', '1000', '50');
    write(a.id, '2026-08-31', '1100');
    write(a.id, '2026-09-12', '1210');
    const current = await get();
    const past = await get('month', '2026-08-15');
    expect(past.overview).toEqual(current.overview);
    expect(current.overview.current).toMatchObject({
      closingBalance: '1210.00',
      cumulativePnl: '260.00',
      returnRate: '0.273684210526315789473684210526',
    });
    expect(current.overview.today).toMatchObject({ periodPnl: '0.00', returnRate: '0' });
    expect(current.overview.month).toMatchObject({ periodPnl: '110.00', returnRate: '0.1' });
    expect(past.performance.periodPnl).toBe('100.00');
    expect(past.categories[0]).toMatchObject({
      balance: '1210.00',
      monthPnl: '110.00',
      monthReturnRate: '0.1',
    });
  });
  it('uses identical report and dashboard results across all four periods', async () => {
    const { app, category, write, get } = await setup();
    const a = category('稳健理财', '2026-08-01', '1000', '500');
    write(a.id, '2026-08-31', '1100');
    write(a.id, '2026-09-11', '1210');
    for (const period of ['day', 'week', 'month', 'year']) {
      const report = (
        await app.inject({ url: `/api/v1/reports?period=${period}&anchor=2026-09-13` })
      ).json<ReportResponse>();
      const dashboard = await get(period);
      expect(report.summary).toEqual(dashboard.performance);
      expect(report.curve).toEqual(dashboard.curve);
      expect(report.current).toBe(true);
    }
    const past = (
      await app.inject({ url: '/api/v1/reports?period=month&anchor=2026-08-01' })
    ).json<ReportResponse>();
    expect(past.summary.closingBalance).toBe('1100.00');
    expect(past.summary.periodPnl).toBe('100.00');
    expect(past.categories[0]?.endingBalance).toBe('1100.00');
    expect(past.categories[0]?.lastRecordedDate).toBe('2026-08-31');
    expect(past.current).toBe(false);
  });
  it('describes actual positive contribution without fabricating market or ranking claims', async () => {
    const { app, category, write } = await setup();
    const a = category('盈利甲'),
      b = category('盈利乙'),
      c = category('亏损丙');
    write(a.id, '2026-09-11', '1100');
    write(b.id, '2026-09-11', '1050');
    write(c.id, '2026-09-11', '800');
    const report = (
      await app.inject({ url: '/api/v1/reports?period=month&anchor=2026-09-13' })
    ).json<ReportResponse>();
    expect(report.commentary.join('')).toContain('2 个分类盈利，1 个分类亏损');
    expect(report.commentary.join('')).toContain('66.7%');
    expect(report.commentary.join('')).toContain('“亏损丙”是本月主要亏损来源');
    expect(report.commentary.join('')).not.toMatch(/跑赢|排名|市场|指数/);
    expect(report.summary.periodPnl).toBe('-50.00');
  });
  it('includes fully withdrawn historical results and distinguishes a no-record report', async () => {
    const { app, category, write } = await setup();
    const a = category('旧分类', '2026-08-01');
    write(a.id, '2026-08-30', '1100');
    write(a.id, '2026-08-31', '0', '0', '1100');
    const past = (
      await app.inject({ url: '/api/v1/reports?period=month&anchor=2026-08-01' })
    ).json<ReportResponse>();
    expect(past.categories[0]?.pnl).toBe('100.00');
    expect(past.recordCount).toBe(2);
    category('新分类');
    const current = (
      await app.inject({ url: '/api/v1/reports?period=month&anchor=2026-09-13' })
    ).json<ReportResponse>();
    expect(current.categories).toHaveLength(2);
    expect(current.recordCount).toBe(0);
    expect(current.commentary.join('')).toContain('没有录入记录');
  });
  it('sums category profits and compounds the portfolio instead of averaging category returns', async () => {
    const { category, write, get } = await setup();
    const a = category('A'),
      b = category('B');
    write(a.id, '2026-09-01', '1100');
    write(b.id, '2026-09-01', '900');
    write(a.id, '2026-09-02', '900', '0', '200');
    write(b.id, '2026-09-02', '1200', '200');
    const data = await get();
    expect(data.performance).toMatchObject({ periodPnl: '100.00', returnRate: '0.05' });
    expect(
      data.categories
        .reduce((sum, row) => sum.plus(row.monthPnl), new FinancialDecimal(0))
        .toFixed(2),
    ).toBe(data.performance.periodPnl);
    expect(data.curve.at(-1)).toMatchObject({
      cumulativePnl: '100.00',
      returnRate: data.performance.returnRate,
    });
    expect(data.curve[1]).toMatchObject({ pnl: '100.00', returnRate: '0.05' });
    expect(data.curve).toHaveLength(13);
  });
  it('carries missing dates without creating real entries and returns truthful detail rows', async () => {
    const { app, category, write, get } = await setup();
    const a = category('A');
    write(a.id, '2026-09-11', '1020');
    const data = await get();
    expect(data.curve.at(-1)).toMatchObject({
      pnl: '0.00',
      cumulativePnl: '20.00',
      returnRate: '0.02',
    });
    const detail = (
      await app.inject({ url: `/api/v1/categories/${a.id}/detail?period=month&anchor=2026-09-13` })
    ).json<CategoryDetailResponse>();
    expect(detail.days.filter((day) => day.source === 'recorded')).toHaveLength(1);
    expect(detail.days.find((day) => day.date === '2026-09-11')).toMatchObject({
      date: '2026-09-11',
      pnl: '20.00',
      returnRate: '0.02',
    });
  });
  it('returns empty historical periods and keeps withdrawn profits in totals', async () => {
    const { category, write, get } = await setup();
    const a = category('A', '2026-09-01', '1000', '50');
    write(a.id, '2026-09-02', '1100');
    write(a.id, '2026-09-03', '0', '0', '1100');
    const data = await get();
    expect(data.overview.current).toMatchObject({
      closingBalance: '0.00',
      cumulativePnl: '150.00',
    });
    expect(data.categories[0]).toMatchObject({ monthPnl: '100.00' });
    const earlier = await get('month', '2026-08-01');
    expect(earlier.performance.periodPnl).toBe('0.00');
    expect(earlier.curve.every((point) => point.returnRate === null)).toBe(true);
  });
  it('uses the same reset and undefined-capital states for curve and summary', async () => {
    const { category, write, get } = await setup();
    const a = category('A');
    write(a.id, '2026-09-01', '0');
    write(a.id, '2026-09-02', '110', '100');
    const data = await get();
    expect(data.curve[0]?.returnRate).toBe('-1');
    expect(data.curve[1]?.rateReason).toBe('capital_reset');
    expect(data.curve.at(-1)?.returnRate).toBe(data.performance.returnRate);
    expect(data.performance.rateReason).toBe('capital_reset');
  });
  it('recomputes an edited historical day and the following recorded day', async () => {
    const { category, write, get } = await setup();
    const a = category('A');
    write(a.id, '2026-09-01', '1100');
    write(a.id, '2026-09-02', '1210');
    write(a.id, '2026-09-01', '1050');
    const one = await get('day', '2026-09-01'),
      two = await get('day', '2026-09-02');
    expect(one.performance.periodPnl).toBe('50.00');
    expect(two.performance.periodPnl).toBe('160.00');
    expect(two.overview.current.cumulativePnl).toBe('210.00');
  });
  it('densifies only the requested leap year when the ledger begins centuries ago', async () => {
    const { category, get } = await setup('2024-12-31');
    category('A', '0001-01-01', '100', '0');
    const data = await get('year');
    expect(data.curve).toHaveLength(366);
    expect(data.curve[59]?.date).toBe('2024-02-29');
    expect(data.performance.returnRate).toBe('0');
  });
  it('validates periods, dates and missing categories without leaking server errors', async () => {
    const { app, get } = await setup();
    expect((await get()).categories).toEqual([]);
    for (const query of [
      'period=invalid&anchor=2026-09-13',
      'period=month&anchor=2026-02-30',
      'period=day&anchor=2026-09-14',
    ])
      expect((await app.inject({ url: `/api/v1/dashboard?${query}` })).statusCode).toBe(400);
    expect(
      (await app.inject({ url: '/api/v1/categories/missing/detail?period=day&anchor=2026-09-13' }))
        .statusCode,
    ).toBe(404);
  });
});
