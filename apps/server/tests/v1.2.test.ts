import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { FinancialDecimal } from '@resilient-riches/core';
import { createApp } from '../src/app.ts';
import { openDatabase } from '../src/database/database.ts';
import { migrations } from '../src/database/migrations.ts';
import { loadLedgerInput } from '../src/database/ledger-input.ts';
import { createLedgerService } from '../src/services/ledger-service.ts';
import { createDashboardService } from '../src/services/dashboard-service.ts';
import { createReportService } from '../src/services/report-service.ts';
import { databaseFixture, insertCategory } from './fixtures.ts';

describe('v1.2 statistics and asset history', () => {
  const fixture = databaseFixture();
  const apps: Awaited<ReturnType<typeof createApp>>[] = [];
  afterEach(async () => {
    for (const app of apps) await app.close();
    apps.length = 0;
  });
  function setup(today = '2026-09-21') {
    const database = fixture.open();
    const service = createLedgerService(database, () => today);
    const dashboard = createDashboardService(database, () => today);
    const report = createReportService(database, () => today);
    const create = (name: string, extra = {}) =>
      service.createCategory({
        name,
        color: '#b69a60',
        openingDate: '2026-09-01',
        openingBalance: '1000',
        historicalPnl: '0',
        note: '',
        ...extra,
      });
    const write = (id: string, date: string, closingBalance: string, buy = '0', sell = '0') => {
      const item = service.readDay(date).items.find((item) => item.category.id === id)!;
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
    return { database, service, dashboard, report, create, write, today };
  }
  it('keeps holding metrics fixed and excluded categories recordable without leaking into statistics', () => {
    const { create, write, dashboard, report, service, today } = setup();
    const a = create('统计分类');
    const b = create('独立分类', { includeInStats: false, openingDate: '2026-08-01' });
    write(a.id, today, '1100');
    write(b.id, today, '2000');
    const weekly = dashboard.dashboard('week', today);
    const all = dashboard.dashboard('all', today);
    expect(weekly.categories).toEqual(all.categories);
    expect(all.range.from).toBe('2026-09-01');
    expect(all.overview.current.closingBalance).toBe('1100.00');
    expect(all.categories.find((item) => item.id === b.id)).toMatchObject({
      balance: '2000.00',
      weekPnl: '1000.00',
      monthPnl: '1000.00',
      totalReturnRate: '1',
    });
    expect(report('all', today).categories.map((item) => item.id)).toEqual([a.id]);
    expect(dashboard.detail(b.id, 'all', today).performance.periodPnl).toBe('1000.00');
    service.updateCategory(b.id, {
      revision: service.listCategories().items.find((item) => item.id === b.id)!.revision,
      includeInStats: true,
    });
    expect(dashboard.dashboard('all', today).overview.current.closingBalance).toBe('3100.00');
  });
  it('clips only the chart before activation, preserves missing natural days, and includes asset flows', () => {
    const { create, write, dashboard, today } = setup('2026-10-01');
    const a = create('八月启用', { openingDate: '2026-08-01' });
    write(a.id, '2026-09-01', '1210', '200');
    const year = dashboard.dashboard('year', today);
    expect(year.range).toEqual({ from: '2026-01-01', to: today });
    expect(year.curve[0]?.date).toBe('2026-08-01');
    expect(year.curve.at(-1)?.date).toBe(today);
    expect(year.curve).toHaveLength(62);
    expect(year.curve.find((point) => point.date === '2026-09-01')).toMatchObject({
      closingBalance: '1210.00',
      buy: '200.00',
      sell: '0.00',
      pnl: '10.00',
    });
    expect(dashboard.dashboard('all', today).range).toEqual({ from: '2026-08-01', to: today });
  });
  it('retains valid returns when an initial zero balance has standalone historical profit', () => {
    const { create, write, dashboard, today } = setup();
    const a = create('历史盈利示例', { openingBalance: '0', historicalPnl: '15000' });
    write(a.id, '2026-09-01', '1002', '1000');
    write(a.id, '2026-09-02', '9800', '9000');
    const result = dashboard.detail(a.id, 'all', today);
    const rate = new FinancialDecimal('1.002')
      .mul(new FinancialDecimal(9800).div(10002))
      .minus(1)
      .toDecimalPlaces(30)
      .toFixed();
    expect(result.performance).toMatchObject({
      cumulativePnl: '14800.00',
      returnRate: rate,
    });
    expect(result.curve.at(-1)).toMatchObject({
      returnRate: rate,
      cumulativePnl: '14800.00',
    });
    expect(result.curve[0]).toMatchObject({ pnl: '2.00', buy: '1000.00' });
    const b = create('超过百分之百', { openingBalance: '1000', historicalPnl: '750' });
    expect(dashboard.detail(b.id, 'all', today).performance.returnRate).toBe('3');
  });
  it('keeps unknown history in amounts and shows measurable returns consistently', () => {
    const { create, write, dashboard, report, today } = setup();
    const a = create('延后本金', { openingBalance: '0', historicalPnl: '15000' });
    expect(dashboard.dashboard('all', today).overview.current.returnRate).toBeNull();
    write(a.id, '2026-09-15', '9800', '10000');
    const data = dashboard.dashboard('all', today);
    expect(data.overview.current.returnRate).toBe('-0.02');
    expect(data.categories[0]?.totalReturnRate).toBe('-0.02');
    expect(data.performance.returnRate).toBe('-0.02');
    expect(data.curve[0]?.returnRate).toBeNull();
    expect(data.curve.at(-1)?.returnRate).toBe('-0.02');
    expect(dashboard.detail(a.id, 'all', today).performance.returnRate).toBe('-0.02');
    const totalReport = report('all', today);
    expect(totalReport.summary.returnRate).toBe('-0.02');
    expect(totalReport.categories[0]?.returnRate).toBe('-0.02');
    expect(totalReport.commentary.join('')).not.toMatch(/历史本金|无法|启用后/);
    expect(dashboard.dashboard('month', today).categories).toEqual(data.categories);
    expect(data.categories[0]?.monthReturnRate).toBe('-0.02');
  });
  it('uses the same historical scope for report totals and chart endpoints in every period', () => {
    const { create, write, dashboard, report } = setup('2026-09-22');
    const a = create('历史与当期分开', { openingBalance: '10000', historicalPnl: '5000' });
    write(a.id, '2026-09-15', '11000');
    for (const period of ['week', 'month', 'year', 'all'] as const) {
      const expected = period === 'all' ? '1.2' : '0.1';
      const detail = dashboard.detail(a.id, period, '2026-09-16');
      const result = report(period, '2026-09-16');
      expect(detail.performance.returnRate).toBe(expected);
      expect(detail.curve.at(-1)?.returnRate).toBe(expected);
      expect(result.summary.returnRate).toBe(expected);
      expect(result.curve.at(-1)?.returnRate).toBe(expected);
      expect(result.categories[0]?.returnRate).toBe(expected);
      expect(result.summary.periodPnl).toBe(period === 'all' ? '6000.00' : '1000.00');
    }
  });
  it('preserves old settlement records during migration and allows subsequent recording', () => {
    const path = join(fixture.directory(), 'old.sqlite');
    const old = openDatabase(path, migrations.slice(0, 2));
    insertCategory(old);
    old
      .prepare(
        "INSERT INTO daily_entries(id,category_id,date,closing_balance_minor,buy_minor,sell_minor,liquidation_pnl_minor) VALUES('close','a','2026-09-01',1000000,0,0,12300)",
      )
      .run();
    old.prepare("UPDATE categories SET archived_on='2026-09-01' WHERE id='a'").run();
    const entries = loadLedgerInput(old, true).entries;
    old.close();
    const upgraded = fixture.open(path);
    expect(loadLedgerInput(upgraded, true).entries).toEqual(entries);
    const service = createLedgerService(upgraded, () => '2026-09-21');
    const category = service.listCategories().items[0]!;
    expect(category).toMatchObject({
      includeInStats: true,
      archivedOn: null,
      balance: '0.00',
      totalPnl: '123.00',
    });
    service.saveEntries('2026-09-21', [
      {
        categoryId: category.id,
        categoryRevision: category.revision,
        revision: null,
        closingBalance: '100',
        buy: '100',
        sell: '0',
        note: '',
      },
    ]);
    expect(service.listCategories().items[0]?.balance).toBe('100.00');
    expect(upgraded.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
  it('removes the liquidation API and validates the participation flag', async () => {
    const { database, create } = setup();
    const app = await createApp({ database, clock: () => '2026-09-21' });
    apps.push(app);
    const a = create('分类');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/categories/' + a.id + '/liquidate',
          payload: { revision: a.revision, pnl: '100', confirm: true },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: '/api/v1/categories/' + a.id,
          payload: { revision: a.revision, includeInStats: 'maybe' },
        })
      ).statusCode,
    ).toBe(400);
  });
});
