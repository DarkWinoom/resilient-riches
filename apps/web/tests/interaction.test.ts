// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import PeriodCalendar from '../src/components/dashboard/PeriodCalendar.vue';
import AppHeader from '../src/components/dashboard/AppHeader.vue';
import AppButton from '../src/components/ui/AppButton.vue';
import DisabledActionHint from '../src/components/ui/DisabledActionHint.vue';

let wrapper: VueWrapper | undefined;
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, 'showPopover');
});
const props = { anchor: '2026-09-09', today: '2026-09-09' };
describe('period calendar and disabled explanations', () => {
  it('pages the year grid in groups of twelve without a long year list', async () => {
    wrapper = mount(PeriodCalendar, { props: { ...props, period: 'year' } });
    await flushPromises();
    expect(wrapper.findAll('[role="option"]')).toHaveLength(12);
    expect(wrapper.get('[aria-label="后12年"]').attributes('disabled')).toBeDefined();
    await wrapper.get('[aria-label="前12年"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('.year-page-controls').text()).toContain('2005 — 2016');
    const year = wrapper.findAll('[role="option"]').find((item) => item.text() === '2015')!;
    await year.find('.dp--overlay-cell').trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual(['2015-01-01']);
  });
  it('uses the paged year overlay when selecting a month in an older year', async () => {
    wrapper = mount(PeriodCalendar, { props: { ...props, period: 'month' } });
    await flushPromises();
    await wrapper.get('[aria-label="2026-选择年份"]').trigger('click');
    await flushPromises();
    await wrapper.get('[aria-label="前12年"]').trigger('click');
    await flushPromises();
    const year = wrapper.findAll('[role="option"]').find((item) => item.text() === '2015')!;
    await year.find('.dp--overlay-cell').trigger('click');
    await flushPromises();
    const month = wrapper.findAll('[role="option"]').find((item) => item.text() === '8月')!;
    await month.find('.dp--overlay-cell').trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual(['2015-08-01']);
  });
  it('selects a calendar day without text input and prevents future dates', async () => {
    wrapper = mount(PeriodCalendar, { props: { ...props, period: 'day' } });
    await flushPromises();
    expect(wrapper.find('input').exists()).toBe(false);
    const disabled = wrapper.get('[aria-label="2026-09-10"]');
    expect(disabled.attributes('aria-disabled')).toBe('true');
    await wrapper.get('[aria-label="2026-09-08"] .dp--cell-inner').trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual(['2026-09-08']);
  });
  it('selects the current week even when its remaining days are in the future', async () => {
    wrapper = mount(PeriodCalendar, { props: { ...props, period: 'week' } });
    await flushPromises();
    await wrapper.get('[aria-label="2026-09-09"] .dp--cell-inner').trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual(['2026-09-07']);
    expect(wrapper.get('[aria-label="2026-09-14"]').attributes('aria-disabled')).toBe('true');
  });
  it('uses month and year grids with normalized period anchors', async () => {
    wrapper = mount(PeriodCalendar, { props: { ...props, period: 'month' } });
    await flushPromises();
    const august = wrapper.findAll('[role="option"]').find((item) => item.text() === '8月')!;
    await august.find('.dp--overlay-cell').trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual(['2026-08-01']);
    await wrapper.setProps({ period: 'year' });
    await flushPromises();
    const year = wrapper.findAll('[role="option"]').find((item) => item.text() === '2025')!;
    await year.find('.dp--overlay-cell').trigger('click');
    expect(wrapper.emitted('select')?.[1]).toEqual(['2025-01-01']);
  });
  it('explains the missing category and loading states while keeping the action disabled', async () => {
    wrapper = mount(AppHeader, { props: { disabled: false, hasCategories: false } });
    const record = wrapper.findAll('button').find((item) => item.text() === '记录今日')!;
    expect(record.attributes('data-disabled-reason')).toBe('请先在分类管理中新增分类');
    expect(record.attributes('aria-description')).toContain('新增分类');
    await record.trigger('click');
    expect(wrapper.emitted('record')).toBeUndefined();
    await wrapper.setProps({ disabled: true });
    expect(record.attributes('data-disabled-reason')).toContain('账本暂未就绪');
  });
  it('shows the declared reason on pointer interaction without invoking a disabled action', async () => {
    const show = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'showPopover', {
      configurable: true,
      value: show,
    });
    wrapper = mount(
      {
        components: { AppButton, DisabledActionHint },
        template:
          '<AppButton disabled disabled-reason="请先新增分类">记录今日</AppButton><DisabledActionHint />',
      },
      { attachTo: document.body },
    );
    wrapper.get('button').element.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    await flushPromises();
    expect(show).toHaveBeenCalled();
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('请先新增分类');
    const button = wrapper.get('button').element;
    const matches = button.matches.bind(button);
    vi.spyOn(button, 'matches').mockImplementation(
      (selector) => selector === ':hover' || matches(selector),
    );
    document.body.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await flushPromises();
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('请先新增分类');
    wrapper.get('button').element.dispatchEvent(new PointerEvent('pointerout', { bubbles: true }));
    await flushPromises();
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('');
  });
});
