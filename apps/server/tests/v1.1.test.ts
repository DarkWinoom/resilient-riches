import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { calculateLedger } from '@resilient-riches/core';
import { createApp } from '../src/app.ts';
import { openDatabase } from '../src/database/database.ts';
import { migrations } from '../src/database/migrations.ts';
import { loadLedgerInput } from '../src/database/ledger-input.ts';
import { createLedgerService } from '../src/services/ledger-service.ts';
import { createDashboardService } from '../src/services/dashboard-service.ts';
import { databaseFixture, insertCategory, insertEntry } from './fixtures.ts';

describe('v1.1 settlements, cycles and curves', () => {
  const fixture = databaseFixture();
  const apps: Awaited<ReturnType<typeof createApp>>[] = [];
  afterEach(async () => {
    for (const app of apps) await app.close();
    apps.length = 0;
  });
  function setup() {
    const database = fixture.open();
    const clock = () => '2026-09-16';
    const service = createLedgerService(database, clock);
    const dashboard = createDashboardService(database, clock);
    const create = (name = '理财', balance = '10500', history = '500') =>
      service.createCategory({
        name,
        color: '#b69a60',
        openingDate: '2026-09-01',
        openingBalance: balance,
        historicalPnl: history,
        note: '',
      });
    const write = (id: string, date: string, balance: string, buy = '0', sell = '0') => {
      const item = service.readDay(date).items.find((item) => item.category.id === id)!;
      return service.saveEntries(date, [
        {
          categoryId: id,
          categoryRevision: item.category.revision,
          revision: item.entry?.revision ?? null,
          closingBalance: balance,
          buy,
          sell,
          note: '',
        },
      ]);
    };
    return { database, clock, service, dashboard, create, write };
  }
  it('places historical profit on the opening date and compounds subsequent changes', () => {
    const { create, write, dashboard } = setup();
    const item = create();
    write(item.id, '2026-09-02', '10605');
    const data = dashboard.dashboard('month', '2026-09-16');
    expect(data.curve[0]).toMatchObject({
      date: '2026-09-01',
      cumulativePnl: '500.00',
      returnRate: '0.05',
      closingBalance: '10500.00',
    });
    expect(data.curve[1]).toMatchObject({ cumulativePnl: '605.00', returnRate: '0.0605' });
    expect(data.overview.current.cumulativePnl).toBe('605.00');
    expect(dashboard.dashboard('week', '2026-09-16').curve[0]?.cumulativePnl).toBe('0.00');
    expect(dashboard.detail(item.id, 'week', '2026-09-16').days.map((day) => day.date)).toEqual([
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
    ]);
  });
  it('settles exactly the entered final profit and recomputes history without changing that settlement', () => {
    const { database, create, write, service, dashboard } = setup();
    const item = create('理财', '1000', '0');
    write(item.id, '2026-09-02', '1100');
    write(item.id, '2026-09-16', '1200');
    const closed = service.liquidate(item.id, service.listCategories().items[0]!.revision, '300.');
    expect(closed).toMatchObject({ balance: '0.00', totalPnl: '300.00', archivedOn: '2026-09-16' });
    expect(dashboard.dashboard('month', '2026-09-16').performance.returnRate).toBe('0.3');
    expect(service.readDay('2026-09-16').items[0]?.entry).toMatchObject({
      closingBalance: '1200.00',
      liquidationPnl: '300.00',
    });
    write(item.id, '2026-09-02', '1050');
    expect(service.listCategories().items[0]?.totalPnl).toBe('300.00');
    expect(dashboard.detail(item.id, 'day', '2026-09-16').days[0]?.pnl).toBe('250.00');
    const input = loadLedgerInput(database);
    expect(
      calculateLedger({ ...input, through: '2026-09-16', timeline: 'events' }).portfolio.summary,
    ).toEqual(
      calculateLedger({ ...input, through: '2026-09-16', timeline: 'daily' }).portfolio.summary,
    );
  });
  it('starts a new holding using the entered history as its only cumulative baseline', () => {
    const { create, service, dashboard, write } = setup();
    const old = create('理财', '1000', '50');
    service.liquidate(old.id, old.revision, '300');
    const next = service.createCategory({
      name: old.name,
      color: old.color,
      note: '',
      previousCycleId: old.id,
      openingDate: '2026-09-16',
      openingBalance: '2000',
      historicalPnl: '300',
    });
    write(next.id, '2026-09-16', '2200');
    const data = dashboard.dashboard('year', '2026-09-16');
    expect(data.overview.current).toMatchObject({
      closingBalance: '2200.00',
      cumulativePnl: '500.00',
    });
    expect(data.categories.find((item) => item.id === next.id)).toMatchObject({
      totalPnl: '500.00',
      returnRate: '0.1',
    });
    expect(() =>
      service.createCategory({
        name: old.name,
        color: old.color,
        note: '',
        previousCycleId: old.id,
        openingDate: '2026-09-16',
        openingBalance: '1',
        historicalPnl: '0',
      }),
    ).toThrow('分类不存在或已被删除');
    expect(service.listCategories().items).toHaveLength(1);
    service.updateCategory(next.id, {
      revision: service.listCategories().items[0]!.revision,
      historicalPnl: '100',
    });
    expect(dashboard.dashboard('year', '2026-09-16').overview.current.cumulativePnl).toBe('300.00');
    const impact = service.deletionImpact(next.id);
    expect(impact.entryCount).toBe(2);
    service.deleteCategory(next.id, impact.category.revision);
    expect(service.listCategories().items).toHaveLength(0);
  });
  it('requires explicit settlement confirmation and rejects stale revisions without partial writes', async () => {
    const { database, clock, create, service } = setup();
    const app = await createApp({ database, clock });
    apps.push(app);
    const item = create('理财', '1000', '0');
    const url = '/api/v1/categories/' + item.id + '/liquidate';
    expect(
      (await app.inject({ method: 'POST', url, payload: { revision: item.revision, pnl: '300' } }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url,
          payload: { revision: item.revision + 1, pnl: '300', confirm: true },
        })
      ).statusCode,
    ).toBe(409);
    expect(service.listCategories().items[0]?.balance).toBe('1000.00');
    expect(service.readDay(clock()).items[0]?.entry).toBeNull();
    expect(
      (
        await app.inject({
          method: 'POST',
          url,
          payload: { revision: item.revision, pnl: '-1001', confirm: true },
        })
      ).statusCode,
    ).toBe(400);
    expect(service.readDay(clock()).items[0]?.entry).toBeNull();
    expect(
      (
        await app.inject({
          method: 'POST',
          url,
          payload: { revision: item.revision, pnl: '-1000', confirm: true },
        })
      ).statusCode,
    ).toBe(200);
  });
  it('migrates a v1 database preserving original rows, revisions and foreign keys on reopen', () => {
    const path = join(fixture.directory(), 'v1.sqlite');
    const old = openDatabase(path, migrations.slice(0, 1));
    insertCategory(old);
    insertEntry(old);
    const before = loadLedgerInput(old, true);
    old.close();
    const migrated = fixture.open(path);
    expect(loadLedgerInput(migrated)).toEqual(before);
    expect(migrated.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    migrated.close();
    expect(loadLedgerInput(fixture.open(path))).toEqual(before);
  });
});
