import { afterEach, describe, expect, it } from 'vitest';
import type { CategoryRecord, EntryDayResponse, EntryWrite } from '@resilient-riches/core';
import { createApp } from '../src/app.ts';
import { databaseFixture } from './fixtures.ts';

describe('ledger write API', () => {
  const fixture = databaseFixture();
  const apps: Awaited<ReturnType<typeof createApp>>[] = [];
  afterEach(async () => {
    for (const app of apps) await app.close();
    apps.length = 0;
  });
  const setup = async () => {
    const app = await createApp({ database: fixture.open(), clock: () => '2026-09-13' });
    apps.push(app);
    return app;
  };
  type App = Awaited<ReturnType<typeof setup>>;
  const create = async (app: App, name = '稳健理财', extra = {}) => {
    const result = await app.inject({
      method: 'POST',
      url: '/api/v1/categories',
      payload: {
        name,
        color: '#b69a60',
        openingDate: '2026-09-01',
        openingBalance: '10000',
        historicalPnl: '200',
        note: '',
        ...extra,
      },
    });
    expect(result.statusCode).toBe(201);
    return result.json<CategoryRecord>();
  };
  const day = async (app: App, date: string) =>
    (
      await app.inject({ method: 'GET', url: `/api/v1/entries?date=${date}` })
    ).json<EntryDayResponse>();
  const write = (
    view: EntryDayResponse,
    index: number,
    changes: Partial<EntryWrite> = {},
  ): EntryWrite => {
    const item = view.items[index]!;
    return {
      categoryId: item.category.id,
      categoryRevision: item.category.revision,
      revision: item.entry?.revision ?? null,
      closingBalance: item.entry?.closingBalance ?? item.openingBalance,
      buy: item.entry?.buy ?? '0',
      sell: item.entry?.sell ?? '0',
      note: item.entry?.note ?? '',
      ...changes,
    };
  };
  const save = (app: App, date: string, entries: EntryWrite[]) =>
    app.inject({ method: 'PUT', url: '/api/v1/entries/batch', payload: { date, entries } });

  it('counts complete days against categories active on that date', async () => {
    const app = await setup();
    const a = await create(app, '不参与统计', { openingBalance: '0', historicalPnl: '0' });
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/categories/${a.id}`,
      payload: { revision: a.revision, includeInStats: false },
    });
    await create(app, '后来启用', { openingDate: '2026-09-06' });
    await create(app, '持续持有');
    await save(app, '2026-09-04', [write(await day(app, '2026-09-04'), 0)]);
    const calendar = async () =>
      (await app.inject({ url: '/api/v1/calendar?month=2026-09' })).json();
    expect((await calendar()).days).toEqual([{ date: '2026-09-04', count: 1, total: 2 }]);
    await save(app, '2026-09-04', [write(await day(app, '2026-09-04'), 1)]);
    await save(app, '2026-09-06', [write(await day(app, '2026-09-06'), 0)]);
    expect((await calendar()).days).toEqual([
      { date: '2026-09-04', count: 2, total: 2 },
      { date: '2026-09-06', count: 1, total: 3 },
    ]);
  });
  it('creates, lists, edits and rejects duplicate category names', async () => {
    const app = await setup();
    const item = await create(app, '  稳健理财  ');
    expect(item).toMatchObject({
      name: '稳健理财',
      openingBalance: '10000.00',
      historicalPnl: '200.00',
      revision: 1,
    });
    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/v1/categories',
      payload: {
        name: '稳健理财',
        color: '#b69a60',
        openingDate: '2026-09-01',
        openingBalance: '0',
        historicalPnl: '0',
        note: '',
      },
    });
    expect(duplicate.statusCode).toBe(409);
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/categories/${item.id}`,
      payload: { revision: 1, name: '现金管理', note: '私人备注' },
    });
    expect(updated.json()).toMatchObject({ name: '现金管理', revision: 2 });
    const list = await app.inject({ method: 'GET', url: '/api/v1/categories' });
    expect(list.json().items[0]).toMatchObject({
      balance: '10000.00',
      totalPnl: '200.00',
      lastRecordedDate: null,
    });
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/v1/categories/${item.id}`,
          payload: { revision: 1, name: '旧页面' },
        })
      ).statusCode,
    ).toBe(409);
  });
  it('carries unrecorded days and updates balances after historical edits', async () => {
    const app = await setup();
    await create(app);
    const first = await day(app, '2026-09-04');
    expect(first.items[0]).toMatchObject({
      openingBalance: '10000.00',
      previousRecordedDate: null,
      entry: null,
    });
    expect(
      (await save(app, first.date, [write(first, 0, { closingBalance: '10300' })])).statusCode,
    ).toBe(200);
    const later = await day(app, '2026-09-13');
    expect(later.items[0]).toMatchObject({
      openingBalance: '10300.00',
      previousRecordedDate: '2026-09-04',
      entry: null,
    });
    const original = await day(app, '2026-09-04');
    expect(
      (await save(app, original.date, [write(original, 0, { closingBalance: '10200' })]))
        .statusCode,
    ).toBe(200);
    expect((await day(app, '2026-09-13')).items[0]?.openingBalance).toBe('10200.00');
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/calendar?month=2026-09' })).json().days,
    ).toEqual([{ date: '2026-09-04', count: 1, total: 1 }]);
  });
  it('rolls back the whole batch, including revisions, on an invalid item', async () => {
    const app = await setup();
    await create(app, 'A');
    await create(app, 'B');
    const view = await day(app, '2026-09-13');
    const failed = await save(app, view.date, [
      write(view, 0, { closingBalance: '10100' }),
      write(view, 1, { sell: '20000', closingBalance: '0' }),
    ]);
    expect(failed.statusCode).toBe(400);
    const after = await day(app, view.date);
    expect(after.items.every((item) => item.entry === null && item.category.revision === 1)).toBe(
      true,
    );
    expect((await save(app, view.date, [write(view, 0), write(view, 0)])).statusCode).toBe(400);
  });
  it('rejects stale creates, updates, deletes and changed historical baselines', async () => {
    const app = await setup();
    await create(app);
    const first = await day(app, '2026-09-10');
    expect(
      (await save(app, first.date, [write(first, 0, { closingBalance: '10100' })])).statusCode,
    ).toBe(200);
    expect((await save(app, first.date, [write(first, 0)])).statusCode).toBe(409);
    const oldToday = await day(app, '2026-09-13');
    const history = await day(app, '2026-09-09');
    await save(app, history.date, [write(history, 0, { closingBalance: '10050' })]);
    expect((await save(app, oldToday.date, [write(oldToday, 0)])).statusCode).toBe(409);
    const current = await day(app, '2026-09-10');
    const record = current.items[0]!.entry!;
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/v1/entries/${record.id}`,
          payload: {
            revision: 9,
            categoryRevision: current.items[0]!.category.revision,
            confirm: true,
          },
        })
      ).statusCode,
    ).toBe(409);
  });
  it('prevents backfill or deletion from making later withdrawals impossible', async () => {
    const app = await setup();
    await create(app);
    const early = await day(app, '2026-09-02');
    await save(app, early.date, [write(early, 0, { closingBalance: '12000' })]);
    const later = await day(app, '2026-09-03');
    await save(app, later.date, [write(later, 0, { sell: '11000', closingBalance: '1000' })]);
    const history = await day(app, early.date);
    const failed = await save(app, early.date, [write(history, 0, { closingBalance: '10000' })]);
    expect(failed.statusCode).toBe(400);
    expect(failed.json().message).toContain('2026-09-03');
    const item = history.items[0]!;
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/v1/entries/${item.entry!.id}`,
          payload: {
            revision: item.entry!.revision,
            categoryRevision: item.category.revision,
            confirm: true,
          },
        })
      ).statusCode,
    ).toBe(400);
    expect((await day(app, early.date)).items[0]?.entry?.closingBalance).toBe('12000.00');
  });
  it('supports atomic paired transfers', async () => {
    const app = await setup();
    await create(app, 'A');
    await create(app, 'B');
    const view = await day(app, '2026-09-13');
    const result = await save(app, view.date, [
      write(view, 0, { sell: '2000', closingBalance: '8000' }),
      write(view, 1, { buy: '2000', closingBalance: '12000' }),
    ]);
    expect(result.statusCode).toBe(200);
    const list = (await app.inject({ method: 'GET', url: '/api/v1/categories' })).json();
    expect(list.items.map((item: { totalPnl: string }) => item.totalPnl)).toEqual([
      '200.00',
      '200.00',
    ]);
  });
  it('checks deletion impact and confirmation, and catches records added after impact was read', async () => {
    const app = await setup();
    const item = await create(app);
    const impact = (
      await app.inject({ method: 'GET', url: `/api/v1/categories/${item.id}/deletion-impact` })
    ).json();
    expect(impact.entryCount).toBe(0);
    const view = await day(app, '2026-09-13');
    await save(app, view.date, [write(view, 0)]);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/v1/categories/${item.id}`,
          payload: { revision: 2 },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/v1/categories/${item.id}`,
          payload: { revision: impact.category.revision, confirm: true },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({ method: 'GET', url: `/api/v1/categories/${item.id}/deletion-impact` })
      ).json().entryCount,
    ).toBe(1);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/v1/categories/${item.id}`,
          payload: { revision: 2, confirm: true },
        })
      ).statusCode,
    ).toBe(200);
    expect((await day(app, view.date)).items).toEqual([]);
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/calendar?month=2026-09' })).json().days,
    ).toEqual([]);
  });
  it('reorders all categories atomically and rejects stale lists', async () => {
    const app = await setup();
    const a = await create(app, 'A');
    const b = await create(app, 'B');
    const order = {
      items: [
        { id: b.id, revision: 1 },
        { id: a.id, revision: 1 },
      ],
    };
    expect(
      (await app.inject({ method: 'PUT', url: '/api/v1/categories/order', payload: order }))
        .statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/categories' }))
        .json()
        .items.map((item: { name: string }) => item.name),
    ).toEqual(['B', 'A']);
    expect(
      (await app.inject({ method: 'PUT', url: '/api/v1/categories/order', payload: order }))
        .statusCode,
    ).toBe(409);
  });
  it('rejects malformed values, unknown fields, future dates and foreign browser writes', async () => {
    const app = await setup();
    const item = await create(app);
    const bad = await app.inject({
      method: 'PATCH',
      url: `/api/v1/categories/${item.id}`,
      payload: { revision: 1, openingBalance: 123, extra: true },
    });
    expect(bad.statusCode).toBe(400);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/v1/categories/${item.id}`,
          payload: { revision: 1, openingDate: '2026-09-14' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/entries?date=2026-02-30' })).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/calendar?month=2026-10' })).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/v1/categories/${item.id}`,
          headers: { origin: 'https://example.com' },
          payload: { revision: 1, name: 'bad' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/v1/categories/${item.id}`,
          headers: { host: 'localhost:8080', origin: 'http://localhost:8080' },
          payload: { revision: 1, name: 'safe' },
        })
      ).statusCode,
    ).toBe(200);
  });
});
