import { afterEach, describe, expect, it } from 'vitest';
import { FinancialDecimal } from '@resilient-riches/core';
import type { DashboardResponse, CategoryDetailResponse } from '@resilient-riches/core';
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
      returnRate: '0.21',
    });
    expect(current.overview.today).toMatchObject({ periodPnl: '0.00', returnRate: '0' });
    expect(current.overview.month).toMatchObject({ periodPnl: '110.00', returnRate: '0.1' });
    expect(past.performance.periodPnl).toBe('100.00');
    expect(past.categories[0]).toMatchObject({
      balance: '1210.00',
      periodClosingBalance: '1100.00',
      periodPnl: '100.00',
    });
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
        .reduce((sum, row) => sum.plus(row.periodPnl), new FinancialDecimal(0))
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
    expect(detail.records).toHaveLength(1);
    expect(detail.records[0]).toMatchObject({
      date: '2026-09-11',
      pnl: '20.00',
      returnRate: '0.02',
    });
  });
  it('returns empty historical periods and keeps archived profits in totals', async () => {
    const { service, category, write, get } = await setup();
    const a = category('A', '2026-09-01', '1000', '50');
    write(a.id, '2026-09-02', '1100');
    write(a.id, '2026-09-03', '0', '0', '1100');
    const updated = service.listCategories().items[0]!;
    service.updateCategory(a.id, { revision: updated.revision, archivedOn: '2026-09-03' });
    const data = await get();
    expect(data.overview.current).toMatchObject({
      closingBalance: '0.00',
      cumulativePnl: '150.00',
    });
    expect(data.categories[0]).toMatchObject({ archivedOn: '2026-09-03', periodPnl: '100.00' });
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
      'period=all&anchor=2026-09-13',
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
