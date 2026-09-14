// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { createApp } from '../../server/src/app.ts';
import { openDatabase } from '../../server/src/database/database.ts';
import { api } from '../src/api.ts';
import BookkeepingPage from '../src/BookkeepingPage.vue';
import CategoryDrawer from '../src/components/CategoryDrawer.vue';
import CategoryDetail from '../src/components/dashboard/CategoryDetail.vue';
import EntryDialog from '../src/components/EntryDialog.vue';
import EntryCalendar from '../src/components/EntryCalendar.vue';
import BaseOverlay from '../src/components/ui/BaseOverlay.vue';
import ReportDrawer from '../src/components/reports/ReportDrawer.vue';
import ShareDialog from '../src/components/reports/ShareDialog.vue';
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
  it('separates list actions, read-only details and a single-category editor', async () => {
    await create();
    wrapper = mount(BookkeepingPage, { global });
    await settle();
    expect(wrapper.get('.topbar-actions').text()).not.toContain('分类管理');
    await wrapper.get('[aria-label="查看稳健理财"]').trigger('click');
    await settle();
    expect(wrapper.findComponent(CategoryDrawer).exists()).toBe(false);
    expect(wrapper.find('dialog input').exists()).toBe(false);
    await wrapper.get('[aria-label="关闭稳健理财"]').trigger('click');
    await wrapper.get('[aria-label="编辑稳健理财"]').trigger('click');
    expect((wrapper.get('#category-name').element as HTMLInputElement).value).toBe('稳健理财');
    expect(wrapper.find('.category-picker').exists()).toBe(false);
    await wrapper.get('#category-name').setValue('新名称');
    await button('保存修改').trigger('click');
    await settle();
    expect(wrapper.findAll('dialog')).toHaveLength(0);
    expect(wrapper.get('tbody').text()).toContain('新名称');
  });

  it('opens the matching daily report and closes changed report filters without confirmation', async () => {
    await create();
    wrapper = mount(BookkeepingPage, { global });
    await settle();
    await button('日').trigger('click');
    await settle();
    await button('收益报表').trigger('click');
    await settle();
    expect(wrapper.get('.report-title').text()).toContain('收益日报');
    const report = wrapper.getComponent(ReportDrawer);
    await report.findAll('.period-segment button')[3]!.trigger('click');
    await settle();
    expect(report.get('.report-title').text()).toContain('收益年报');
    await report.get('[aria-label="关闭收益报表"]').trigger('click');
    expect(wrapper.findAll('dialog')).toHaveLength(0);
  });
  it('updates share privacy in the preview and closes it directly while retaining the report', async () => {
    const category = await create();
    await api.saveEntries(today, [
      {
        categoryId: category.id,
        categoryRevision: 1,
        revision: null,
        closingBalance: '1100',
        buy: '0',
        sell: '0',
        note: '不应出现在分享图',
      },
    ]);
    wrapper = mount(ReportDrawer, {
      props: { initialPeriod: 'month', initialAnchor: today, today, privateMode: false },
      global,
    });
    await settle();
    await button('分享收益').trigger('click');
    const share = wrapper.getComponent(ShareDialog);
    let svg = decodeURIComponent(share.get('img').attributes('src')!.split(',').slice(1).join(','));
    expect(svg).toContain('+100.00');
    expect(svg).not.toContain('1,100.00');
    expect(svg).not.toContain('不应出现在分享图');
    await share.findAll('[role="switch"]')[0]!.trigger('click');
    await share.findAll('[role="switch"]')[1]!.trigger('click');
    svg = decodeURIComponent(share.get('img').attributes('src')!.split(',').slice(1).join(','));
    expect(svg).not.toContain('1,100.00');
    expect(svg).not.toContain('稳健理财');
    expect(svg).toContain('+10.00%');
    await share.get('[aria-label="关闭分享收益"]').trigger('click');
    expect(wrapper.findAll('dialog')).toHaveLength(1);
    expect(wrapper.find('.confirmation-overlay').exists()).toBe(false);
  });
  it('keeps sharing options after export failure and allows a direct close', async () => {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: Promise.resolve() },
    });
    const category = await create();
    await api.saveEntries(today, [
      {
        categoryId: category.id,
        categoryRevision: 1,
        revision: null,
        closingBalance: '1000',
        buy: '0',
        sell: '0',
        note: '',
      },
    ]);
    const report = await api.report('month', today);
    wrapper = mount(ShareDialog, { props: { report, initialPrivate: false }, global });
    await wrapper.findAll('[role="switch"]')[0]!.trigger('click');
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      throw new Error('图片生成失败，请重试。');
    });
    await button('保存 PNG').trigger('click');
    await settle();
    expect(wrapper.get('[role="alert"]').text()).toContain('图片生成失败');
    expect(wrapper.findAll('[role="switch"]')[0]!.attributes('aria-checked')).toBe('true');
    await wrapper.get('[aria-label="关闭分享收益"]').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(wrapper.find('.confirmation-overlay').exists()).toBe(false);
  });
  it('disables sharing for a period without actual records but permits an explicit unchanged record', async () => {
    const category = await create();
    wrapper = mount(ReportDrawer, {
      props: { initialPeriod: 'day', initialAnchor: today, today, privateMode: false },
      global,
    });
    await settle();
    expect(button('分享收益').attributes('disabled')).toBeDefined();
    await button('分享收益').trigger('click');
    expect(wrapper.findComponent(ShareDialog).exists()).toBe(false);
    await api.saveEntries(today, [
      {
        categoryId: category.id,
        categoryRevision: 1,
        revision: null,
        closingBalance: '1000',
        buy: '0',
        sell: '0',
        note: '',
      },
    ]);
    await button('月').trigger('click');
    await settle();
    expect(button('分享收益').attributes('disabled')).toBeUndefined();
  });
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
    expect(wrapper.find('.detail-record').exists()).toBe(false);
    expect(wrapper.find('.detail-chart').exists()).toBe(true);
    await wrapper
      .getComponent(CategoryDetail)
      .findAll('button')
      .find((item) => item.text() === '记录盈亏')!
      .trigger('click');
    await settle();
    await wrapper.get('[aria-label^="2026-09-11，"]').trigger('click');
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
    await button('记录盈亏').trigger('click');
    await settle();
    expect(wrapper.get('.calendar-day.active').attributes('aria-label')).toContain('2026-09-14');
  });
  it('archives and restores a cleared category and closes after each confirmed mutation', async () => {
    const category = await api.createCategory({
      name: '已清空',
      color: '#b69a60',
      openingDate: '2026-09-01',
      openingBalance: '0',
      historicalPnl: '0',
      note: '',
    });
    wrapper = mount(CategoryDrawer, {
      props: { items: [category], today, initialId: category.id },
      global,
    });
    await button('归档分类').trigger('click');
    await settle();
    await wrapper.get('.confirmation-actions .button--primary').trigger('click');
    await settle();
    expect((await api.categories()).items[0]?.archivedOn).toBe(today);
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
    wrapper = mount(CategoryDrawer, {
      props: { items: (await api.categories()).items, today, initialId: category.id },
      global,
    });
    await button('恢复分类').trigger('click');
    await settle();
    await wrapper.get('.confirmation-actions .button--primary').trigger('click');
    await settle();
    expect((await api.categories()).items[0]?.archivedOn).toBeNull();
    expect(wrapper.emitted('close')).toHaveLength(1);
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
  it('creates a category and closes immediately without a second confirmation', async () => {
    wrapper = mount(BookkeepingPage, { global });
    await settle();
    await wrapper.get('.panel-actions .button').trigger('click');
    await wrapper.get('#category-name').setValue('稳健理财');
    await wrapper.get('#category-balance').setValue('1000');
    await wrapper.get('#category-history').setValue('-50');
    await wrapper.get('#category-form').trigger('submit');
    await settle();
    expect(wrapper.findAll('dialog')).toHaveLength(0);
    expect(wrapper.get('tbody').text()).toContain('稳健理财');
    expect((await api.categories()).items[0]).toMatchObject({
      balance: '1000.00',
      totalPnl: '-50.00',
    });
  });

  it('blocks invalid amounts and confirms only unsaved category changes on close', async () => {
    wrapper = mount(CategoryDrawer, {
      props: { items: [], today, initialId: null },
      attachTo: document.body,
    });
    const body = new DOMWrapper(document.body);
    await body.get('#category-name').setValue('新分类');
    await body.get('#category-balance').setValue('-1');
    expect((body.get('#category-balance').element as HTMLInputElement).value).toBe('0.00');
    expect(body.text()).toContain('不能为负数');
    expect((body.get('#category-balance').element as HTMLInputElement).validity.valid).toBe(false);
    await body.get('#category-form').trigger('submit');
    await settle();
    expect(body.text()).toContain('不能为负数');
    expect((await api.categories()).items).toHaveLength(0);
    await body.get('[aria-label="关闭新增分类"]').trigger('click');
    await settle();
    expect(body.text()).toContain('放弃未保存的修改');
    await body
      .findAll('button')
      .find((item) => item.text() === '取消')!
      .trigger('click');
    expect((body.get('#category-name').element as HTMLInputElement).value).toBe('新分类');
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
    await wrapper.get('[aria-label="查看灵活现金"]').trigger('click');
    await settle();
    await wrapper
      .getComponent(CategoryDetail)
      .findAll('button')
      .find((item) => item.text() === '记录盈亏')!
      .trigger('click');
    await settle();
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toContain('灵活现金');
    expect(wrapper.get('.calendar-day.active').attributes('aria-label')).toContain(today);
    expect((wrapper.get('#entry-balance').element as HTMLInputElement).value).toBe('1050.00');
    expect(wrapper.text()).toContain('已录入');
  });
  it('protects unsaved day changes and saves all modified categories of the current date', async () => {
    const category = await create();
    await create('灵活现金');
    wrapper = mount(EntryDialog, { props: { today, initialId: category.id }, global });
    await settle();
    await wrapper.get('#entry-balance').setValue('1100');
    await wrapper.findAll('[role="tab"]')[1]!.trigger('click');
    await wrapper.get('#entry-balance').setValue('1020');
    await wrapper.get('[aria-label^="2026-09-12，"]').trigger('click');
    await settle();
    expect(wrapper.text()).toContain('放弃当前日期');
    await button('取消').trigger('click');
    expect(wrapper.get('.calendar-day.active').attributes('aria-label')).toContain(today);
    await button('保存当日记录').trigger('click');
    await settle();
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect((await api.day(today)).items.map((item) => item.entry?.closingBalance)).toEqual([
      '1100.00',
      '1020.00',
    ]);
    expect((await api.day('2026-09-12')).items.every((item) => !item.entry)).toBe(true);
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
  it('deletes an entry while keeping the dialog and other category drafts', async () => {
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
    expect(wrapper.text()).toContain('其他分类未保存的草稿将保留');
    expect((await api.day(today)).items[0]?.entry).not.toBeNull();
    await button('删除记录').trigger('click');
    await settle();
    expect((await api.day(today)).items[0]?.entry).toBeNull();
    expect(wrapper.emitted('close')).toBeUndefined();
    await wrapper.findAll('[role="tab"]')[1]!.trigger('click');
    expect((wrapper.get('#entry-balance').element as HTMLInputElement).value).toBe('1080');
    expect(wrapper.emitted('changed')).toHaveLength(1);
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
        calendar: { today, month: '2026-09', days: [{ date: '2026-09-11', count: 2, total: 2 }] },
        loading: false,
        disabled: false,
        error: '',
      },
    });
    expect(wrapper.find('[aria-label="2026-09-11，2个分类有记录，全部录入"]').exists()).toBe(true);
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
