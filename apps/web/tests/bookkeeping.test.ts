// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { createApp } from '../../server/src/app.ts';
import { openDatabase } from '../../server/src/database/database.ts';
import { api } from '../src/api.ts';
import BookkeepingPage from '../src/BookkeepingPage.vue';
import CategoryDrawer from '../src/components/CategoryDrawer.vue';
import EntryDialog from '../src/components/EntryDialog.vue';
import EntryCalendar from '../src/components/EntryCalendar.vue';
import BaseOverlay from '../src/components/ui/BaseOverlay.vue';
import { lastEntryLabel } from '../src/utils/format.ts';

let server: Awaited<ReturnType<typeof createApp>>;
let wrapper: VueWrapper | undefined;
const today = '2026-09-13';
let businessDate = today;
const global = { stubs: { teleport: true } };
beforeEach(async () => {
  businessDate = today;
  server = await createApp({ database: openDatabase(':memory:'), clock: () => businessDate });
  vi.stubGlobal('fetch', async (url: string, options: RequestInit = {}) => {
    const response = await server.inject({
      method: (options.method ?? 'GET') as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      url,
      ...(typeof options.body === 'string'
        ? { payload: options.body, headers: { 'content-type': 'application/json' } }
        : {}),
    });
    return {
      ok: response.statusCode < 400,
      status: response.statusCode,
      json: async () => response.json(),
    };
  });
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.open = true;
  });
});
afterEach(async () => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await server.close();
});
async function create(name = '稳健理财') {
  return api.createCategory({
    name,
    color: '#b69a60',
    openingDate: '2026-09-01',
    openingBalance: '1000.00',
    historicalPnl: '50.00',
    note: '',
  });
}
async function settle() {
  await flushPromises();
  await flushPromises();
}
function button(text: string) {
  const found = wrapper?.findAll('button').find((item) => item.text() === text);
  if (!found) throw new Error(`Button not found: ${text}`);
  return found;
}

describe('bookkeeping UI with real ledger API', () => {
  it('keeps summary cards fixed across periods and hides monetary details in privacy mode', async () => {
    const category = await create();
    await api.saveEntries(today, [
      {
        categoryId: category.id,
        categoryRevision: 1,
        revision: null,
        closingBalance: '1100',
        buy: '0',
        sell: '0',
        note: '',
      },
    ]);
    wrapper = mount(BookkeepingPage, { global });
    await settle();
    const cards = wrapper.get('.summary-grid').text();
    await button('日').trigger('click');
    await settle();
    expect(wrapper.get('.summary-grid').text()).toBe(cards);
    expect(wrapper.get('thead').text()).toContain('当日收益');
    await button('年').trigger('click');
    await settle();
    expect(wrapper.get('.summary-grid').text()).toBe(cards);
    await button('收益金额').trigger('click');
    expect(wrapper.get('.return-plot').attributes('aria-label')).toContain('收益金额');
    await wrapper.get('[aria-label="隐藏金额"]').trigger('click');
    expect(wrapper.get('.summary-grid').text()).not.toContain('1,100.00');
    expect(wrapper.get('.allocation-panel').text()).not.toContain('1,100.00');
    expect(wrapper.get('.holdings-table').text()).not.toContain('1,100.00');
    expect(wrapper.get('.return-plot').attributes('aria-label')).toContain('收益率');
    await wrapper.get('.return-plot').trigger('keydown', { key: 'End' });
    expect(wrapper.get('.chart-tooltip').text()).toContain('10.00%');
    expect(wrapper.get('.chart-tooltip').text()).not.toContain('当日余额');
  });
  it('opens a real historical entry from details and refreshes the dashboard after editing', async () => {
    const category = await create();
    await api.saveEntries('2026-09-11', [
      {
        categoryId: category.id,
        categoryRevision: 1,
        revision: null,
        closingBalance: '1050',
        buy: '0',
        sell: '0',
        note: '',
      },
    ]);
    wrapper = mount(BookkeepingPage, { global });
    await settle();
    await wrapper.get('.holding-name').trigger('click');
    await settle();
    expect(wrapper.get('.detail-record').text()).toContain('2026-09-11');
    await button('修改记录').trigger('click');
    await settle();
    expect(wrapper.get('.calendar-day.active').attributes('aria-label')).toContain('2026-09-11');
    await wrapper.get('#entry-balance').setValue('1075');
    await button('保存当日记录').trigger('click');
    await settle();
    expect(wrapper.get('.asset-card').text()).toContain('1,075.00');
    expect(wrapper.get('.summary-grid').text()).toContain('+125.00');
    expect(wrapper.get('.holdings-table').text()).toContain('+75.00');
  });
  it('sorts by category profit and returns to saved category order', async () => {
    const a = await create('稳健理财'),
      b = await create('长期成长');
    await api.saveEntries(today, [
      {
        categoryId: a.id,
        categoryRevision: 1,
        revision: null,
        closingBalance: '1010',
        buy: '0',
        sell: '0',
        note: '',
      },
      {
        categoryId: b.id,
        categoryRevision: 1,
        revision: null,
        closingBalance: '1100',
        buy: '0',
        sell: '0',
        note: '',
      },
    ]);
    wrapper = mount(BookkeepingPage, { global });
    await settle();
    await button('本月收益').trigger('click');
    expect(wrapper.findAll('tbody tr')[0]?.text()).toContain('长期成长');
    await button('本月收益').trigger('click');
    expect(wrapper.findAll('tbody tr')[0]?.text()).toContain('稳健理财');
    await button('本月收益').trigger('click');
    expect(wrapper.findAll('thead th')[2]?.attributes('aria-sort')).toBe('none');
    expect(wrapper.findAll('tbody tr')[0]?.text()).toContain('稳健理财');
  });
  it('preserves the shown period with a visible retry message when a filter request fails', async () => {
    await create();
    wrapper = mount(BookkeepingPage, { global });
    await settle();
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'));
    await button('周').trigger('click');
    await settle();
    expect(wrapper.get('[role="alert"]').text()).toContain('当前仍显示 2026-09-01 — 2026-09-13');
    expect(wrapper.get('thead').text()).toContain('本月收益');
    await button('重试').trigger('click');
    await settle();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.get('thead').text()).toContain('本周收益');
  });
  it('refreshes the business date before opening a record from an overnight page', async () => {
    await create();
    wrapper = mount(BookkeepingPage, { global });
    await settle();
    businessDate = '2026-09-14';
    await wrapper.get('[aria-label="为稳健理财记录今天"]').trigger('click');
    await settle();
    expect(wrapper.get('.calendar-day.active').attributes('aria-label')).toContain('2026-09-14');
  });
  it('reorders categories without making its own editor stale, then archives and restores a cleared category', async () => {
    const category = await api.createCategory({
      name: '已清空',
      color: '#b69a60',
      openingDate: '2026-09-01',
      openingBalance: '0',
      historicalPnl: '0',
      note: '',
    });
    await create();
    wrapper = mount(CategoryDrawer, {
      props: { items: (await api.categories()).items, today, initialId: category.id },
      global,
    });
    await wrapper.get('#category-note').setValue('排序中保留编辑');
    await wrapper.get('[aria-label="下移已清空"]').trigger('click');
    await settle();
    expect((wrapper.get('#category-note').element as HTMLTextAreaElement).value).toBe(
      '排序中保留编辑',
    );
    await wrapper.get('#category-form').trigger('submit');
    await settle();
    expect((await api.categories()).items[1]).toMatchObject({
      id: category.id,
      note: '排序中保留编辑',
    });
    await button('归档分类').trigger('click');
    await settle();
    await wrapper.get('.confirmation-actions .button--primary').trigger('click');
    await settle();
    expect((await api.categories()).items[1]?.archivedOn).toBe(today);
    await button('恢复分类').trigger('click');
    await settle();
    await wrapper.get('.confirmation-actions .button--primary').trigger('click');
    await settle();
    expect((await api.categories()).items[1]?.archivedOn).toBeNull();
  });
  it('changes category tabs with the keyboard while retaining draft values', async () => {
    const category = await create();
    await create('灵活现金');
    wrapper = mount(EntryDialog, { props: { today, initialId: category.id }, global });
    await settle();
    await wrapper.get('#entry-note').setValue('保留备注');
    await wrapper.get('[role="tablist"]').trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.get('[aria-selected="true"]').text()).toContain('灵活现金');
    await wrapper.get('[role="tablist"]').trigger('keydown', { key: 'Home' });
    expect((wrapper.get('#entry-note').element as HTMLTextAreaElement).value).toBe('保留备注');
  });
  it('creates a category from the drawer and requires a close confirmation after saving', async () => {
    wrapper = mount(CategoryDrawer, { props: { items: [], today, initialId: null }, global });
    await wrapper.get('#category-name').setValue('稳健理财');
    await wrapper.get('#category-balance').setValue('1000');
    await wrapper.get('#category-history').setValue('50');
    await wrapper.get('#category-form').trigger('submit');
    await settle();
    expect(wrapper.text()).toContain('分类已保存');
    expect((await api.categories()).items[0]).toMatchObject({
      name: '稳健理财',
      balance: '1000.00',
      totalPnl: '50.00',
    });
    await wrapper.get('[aria-label="关闭分类管理"]').trigger('click');
    await settle();
    expect(wrapper.findAll('dialog')).toHaveLength(2);
    expect(wrapper.emitted('close')).toBeUndefined();
    await button('取消').trigger('click');
    expect(wrapper.findAll('dialog')).toHaveLength(1);
  });
  it('keeps invalid amounts unsaved and protects edited category drafts on switch', async () => {
    const category = await create();
    wrapper = mount(CategoryDrawer, {
      props: { items: [category], today, initialId: null },
      global,
    });
    await wrapper.get('#category-name').setValue('新分类');
    await wrapper.get('#category-balance').setValue('-1');
    await wrapper.get('#category-form').trigger('submit');
    expect(wrapper.text()).toContain('请输入有效金额');
    expect((await api.categories()).items).toHaveLength(1);
    await button('稳健理财').trigger('click');
    await settle();
    expect(wrapper.text()).toContain('放弃当前修改？');
    await button('取消').trigger('click');
    expect((wrapper.get('#category-name').element as HTMLInputElement).value).toBe('新分类');
  });
  it('confirms category deletion with record impact, supports cancellation and then deletion', async () => {
    const category = await create();
    await api.saveEntries(today, [
      {
        categoryId: category.id,
        categoryRevision: category.revision,
        revision: null,
        closingBalance: '1010',
        buy: '0',
        sell: '0',
        note: '',
      },
    ]);
    wrapper = mount(CategoryDrawer, {
      props: { items: (await api.categories()).items, today, initialId: category.id },
      global,
    });
    await button('删除分类').trigger('click');
    await settle();
    expect(wrapper.text()).toContain('1 条记录');
    expect((await api.categories()).items).toHaveLength(1);
    await button('取消').trigger('click');
    await settle();
    await button('删除分类').trigger('click');
    await settle();
    await button('删除分类和记录').trigger('click');
    await settle();
    expect((await api.categories()).items).toHaveLength(0);
    expect((await api.calendar('2026-09')).days).toHaveLength(0);
  });
  it('opens the clicked category on today and prefills an existing record', async () => {
    await create();
    const category = await create('灵活现金');
    await api.saveEntries(today, [
      {
        categoryId: category.id,
        categoryRevision: category.revision,
        revision: null,
        closingBalance: '1050',
        buy: '0',
        sell: '0',
        note: '已核对',
      },
    ]);
    wrapper = mount(BookkeepingPage, { global });
    await settle();
    await wrapper.get('[aria-label="为灵活现金记录今天"]').trigger('click');
    await settle();
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toContain('灵活现金');
    expect(wrapper.get('.calendar-day.active').attributes('aria-label')).toContain(today);
    expect((wrapper.get('#entry-balance').element as HTMLInputElement).value).toBe('1050.00');
    expect(wrapper.text()).toContain('今日已录入');
  });
  it('preserves tabs and date drafts, submits only the selected date and refreshes the next baseline', async () => {
    const category = await create();
    await create('灵活现金');
    wrapper = mount(EntryDialog, { props: { today, initialId: category.id }, global });
    await settle();
    await wrapper.get('#entry-balance').setValue('1100');
    await wrapper.findAll('[role="tab"]')[1]!.trigger('click');
    await wrapper.get('#entry-balance').setValue('1020');
    await wrapper.findAll('[role="tab"]')[0]!.trigger('click');
    expect((wrapper.get('#entry-balance').element as HTMLInputElement).value).toBe('1100');
    await wrapper.get('[aria-label^="2026-09-12，"]').trigger('click');
    await settle();
    await wrapper.get('#entry-balance').setValue('1050');
    await button('保存当日记录').trigger('click');
    await settle();
    expect((await api.day(today)).items.every((item) => !item.entry)).toBe(true);
    expect(wrapper.text()).toContain('2 个草稿待保存');
    await wrapper.get('[aria-label^="2026-09-13，"]').trigger('click');
    await settle();
    expect((wrapper.get('#entry-balance').element as HTMLInputElement).value).toBe('1100');
    expect(wrapper.get('.entry-reference').text()).toContain('1,050.00');
    expect(wrapper.get('.entry-preview').text()).toContain('+50.00');
    await button('保存当日记录').trigger('click');
    await settle();
    expect(wrapper.text()).toContain('已保存 2 个分类的记录');
    expect((await api.calendar('2026-09')).days).toEqual([
      { date: '2026-09-12', count: 1 },
      { date: today, count: 2 },
    ]);
  });
  it('retains a conflicted draft and reloads only after explicit confirmation', async () => {
    const category = await create();
    wrapper = mount(EntryDialog, { props: { today, initialId: category.id }, global });
    await settle();
    await wrapper.get('#entry-balance').setValue('1100');
    await api.saveEntries('2026-09-12', [
      {
        categoryId: category.id,
        categoryRevision: category.revision,
        revision: null,
        closingBalance: '1200',
        buy: '0',
        sell: '0',
        note: '',
      },
    ]);
    await button('保存当日记录').trigger('click');
    await settle();
    expect(wrapper.text()).toContain('数据已在其他页面更新');
    expect((wrapper.get('#entry-balance').element as HTMLInputElement).value).toBe('1100');
    await button('重新载入').trigger('click');
    await settle();
    expect(wrapper.text()).toContain('当前日期的草稿将被清除');
    await wrapper.get('.confirmation-actions .button--danger').trigger('click');
    await settle();
    expect((wrapper.get('#entry-balance').element as HTMLInputElement).value).toBe('1200.00');
  });
  it('deletes a daily entry only after confirmation and keeps other category drafts', async () => {
    const category = await create();
    await create('灵活现金');
    await api.saveEntries(today, [
      {
        categoryId: category.id,
        categoryRevision: 1,
        revision: null,
        closingBalance: '1010',
        buy: '0',
        sell: '0',
        note: '',
      },
    ]);
    wrapper = mount(EntryDialog, { props: { today, initialId: category.id }, global });
    await settle();
    await wrapper.findAll('[role="tab"]')[1]!.trigger('click');
    await wrapper.get('#entry-balance').setValue('1080');
    await wrapper.findAll('[role="tab"]')[0]!.trigger('click');
    await button('删除本条记录').trigger('click');
    await settle();
    expect((await api.day(today)).items[0]?.entry).not.toBeNull();
    await button('删除记录').trigger('click');
    await settle();
    expect((await api.day(today)).items[0]?.entry).toBeNull();
    await wrapper.findAll('[role="tab"]')[1]!.trigger('click');
    expect((wrapper.get('#entry-balance').element as HTMLInputElement).value).toBe('1080');
  });
  it('leaves a fresh overlay immediately but confirms all edited-date drafts on Escape', async () => {
    const category = await create();
    wrapper = mount(EntryDialog, { props: { today, initialId: category.id }, global });
    await settle();
    await wrapper.get('dialog').trigger('cancel');
    expect(wrapper.emitted('close')).toHaveLength(1);
    await wrapper.get('#entry-note').setValue('草稿');
    await wrapper.get('dialog').trigger('cancel');
    await settle();
    expect(wrapper.text()).toContain('1 个分类草稿未保存');
    await button('放弃并关闭').trigger('click');
    await settle();
    expect(wrapper.emitted('close')).toHaveLength(2);
  });
  it('uses real record indicators and allows month selection without marking empty days overdue', async () => {
    wrapper = mount(EntryCalendar, {
      props: {
        today,
        date: today,
        month: '2026-09',
        calendar: { today, month: '2026-09', days: [{ date: '2026-09-11', count: 2 }] },
        loading: false,
        disabled: false,
        error: '',
      },
    });
    expect(wrapper.find('[aria-label="2026-09-11，2个分类有记录"]').exists()).toBe(true);
    expect(wrapper.get('[aria-label="2026-09-14，无记录"]').attributes('disabled')).toBeDefined();
    await wrapper.get('.calendar-title').trigger('click');
    await wrapper.get('#calendar-year').setValue('2025');
    await button('8 月').trigger('click');
    expect(wrapper.emitted('month')?.[0]).toEqual(['2025-08']);
  });
  it('requests outside close only when both pointer down and click are outside', async () => {
    wrapper = mount(BaseOverlay, { props: { title: '测试窗口' }, global });
    const dialog = wrapper.get('dialog');
    vi.spyOn(dialog.element, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      right: 400,
      top: 100,
      bottom: 400,
    } as DOMRect);
    await dialog.trigger('pointerdown', { clientX: 200, clientY: 200 });
    await dialog.trigger('click', { clientX: 20, clientY: 20 });
    expect(wrapper.emitted('request-close')).toBeUndefined();
    await dialog.trigger('pointerdown', { clientX: 20, clientY: 20 });
    await dialog.trigger('click', { clientX: 20, clientY: 20 });
    expect(wrapper.emitted('request-close')).toHaveLength(1);
  });
  it('formats recording recency without requiring daily entries', () => {
    expect(lastEntryLabel(today, today)).toBe('今日已录入');
    expect(lastEntryLabel('2026-09-12', today)).toBe('上次录入：昨天');
    expect(lastEntryLabel('2025-08-13', today)).toBe('上次录入：2025-08-13');
    expect(lastEntryLabel(null, today)).toBe('尚无录入');
  });
});
