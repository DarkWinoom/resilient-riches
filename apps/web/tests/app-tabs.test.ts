// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import AppTabs from '../src/components/ui/AppTabs.vue';
import PeriodPicker from '../src/components/dashboard/PeriodPicker.vue';

let wrapper: VueWrapper | undefined;
beforeEach(() => {
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.open = true;
  });
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.restoreAllMocks();
});
const items = Array.from({ length: 12 }, (_, index) => ({
  id: String(index),
  label: `分类${index + 1}`,
  badge: index === 0 ? '未保存' : '已录入',
}));

describe('responsive category switching', () => {
  it('uses a searchable selector when tabs overflow and retains recording badges', async () => {
    wrapper = mount(AppTabs, {
      props: { items, modelValue: '0', label: '选择分类', panelId: 'entry-panel' },
      global: { stubs: { teleport: true } },
    });
    const tabs = wrapper.get('.tabs').element;
    let width = 300;
    Object.defineProperty(tabs, 'clientWidth', { configurable: true, get: () => width });
    Object.defineProperty(tabs, 'scrollWidth', { configurable: true, get: () => 1200 });
    await wrapper.setProps({ items: [...items] });
    await flushPromises();
    expect(wrapper.get('.tabs').attributes('aria-hidden')).toBe('true');
    expect(wrapper.get('.category-selector').text()).toContain('分类1');
    expect(wrapper.get('.category-selector').text()).toContain('未保存');
    await wrapper.get('.category-selector').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('[role="option"]')).toHaveLength(12);
    await wrapper.get('#entry-panel-search').setValue('分类12');
    expect(wrapper.findAll('[role="option"]')).toHaveLength(1);
    await wrapper.get('[role="option"]').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['11']);
    expect(wrapper.find('dialog').exists()).toBe(false);
    width = 1400;
    await wrapper.setProps({ modelValue: '11' });
    await flushPromises();
    expect(wrapper.find('.category-selector').exists()).toBe(false);
    expect(wrapper.get('.tabs').attributes('aria-hidden')).toBeUndefined();
    expect(wrapper.get('[aria-selected="true"]').text()).toContain('分类12');
  });
  it('does not open the selector while data is loading or saving', async () => {
    wrapper = mount(AppTabs, {
      props: { items, modelValue: '0', label: '选择分类', panelId: 'entry-panel', disabled: true },
      global: { stubs: { teleport: true } },
    });
    Object.defineProperty(wrapper.get('.tabs').element, 'scrollWidth', {
      configurable: true,
      value: 1200,
    });
    await wrapper.setProps({ items: [...items] });
    await flushPromises();
    expect(wrapper.get('.category-selector').attributes('disabled')).toBeDefined();
    await wrapper.get('.category-selector').trigger('click');
    expect(wrapper.find('dialog').exists()).toBe(false);
  });
  it('preserves both disabled arrows and both dates for the total period', async () => {
    wrapper = mount(PeriodPicker, {
      props: {
        period: 'all',
        anchor: '2026-09-21',
        today: '2026-09-21',
        range: { from: '2026-09-21', to: '2026-09-21' },
        disabled: false,
      },
    });
    expect(wrapper.get('[aria-label="上一期间"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[aria-label="下一期间"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('.range-label').text()).toBe('2026-09-21 ~ 2026-09-21');
    await wrapper.get('[aria-label="上一期间"]').trigger('click');
    await wrapper.get('[aria-label="下一期间"]').trigger('click');
    expect(wrapper.emitted('change')).toBeUndefined();
  });
});
