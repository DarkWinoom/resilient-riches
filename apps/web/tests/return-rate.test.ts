// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ReturnRate from '../src/components/ui/ReturnRate.vue';
import DisabledActionHint from '../src/components/ui/DisabledActionHint.vue';
afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, 'showPopover');
});
it.each([
  { pnl: '14800', value: '-0.02', tone: 'loss' },
  { pnl: '-14800', value: '0.02', tone: 'profit' },
])('colors the rate independently of P&L ($pnl)', ({ pnl, value, tone }) => {
  const wrapper = mount(ReturnRate, { props: { pnl, value, historicalRateIncluded: false } });
  expect(wrapper.classes()).toContain(tone);
  expect(wrapper.attributes('data-tooltip')).toBe('盈亏含历史金额，收益率仅统计可计算部分。');
  wrapper.unmount();
});
it.each([
  { value: '0.02', pnl: '14800', historicalRateIncluded: false },
  { value: '-0.02', pnl: '14800', historicalRateIncluded: true },
  { value: '-0.02', pnl: '14800', historicalRateIncluded: false, privateMode: true },
  { value: null, pnl: '14800', historicalRateIncluded: false },
])('does not add an unrelated or private explanation', (props) => {
  const wrapper = mount(ReturnRate, {
    props: {
      value: props.value,
      pnl: props.pnl,
      historicalRateIncluded: props.historicalRateIncluded,
      privateMode: props.privateMode ?? false,
    },
  });
  expect(wrapper.attributes('data-tooltip')).toBeUndefined();
  wrapper.unmount();
});
it('shows the shared floating explanation on hover and hides it on leave', async () => {
  const show = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'showPopover', { configurable: true, value: show });
  const wrapper = mount(
    {
      components: { ReturnRate, DisabledActionHint },
      template:
        '<ReturnRate value="-0.02" pnl="14800" :historical-rate-included="false" /><DisabledActionHint />',
    },
    { attachTo: document.body },
  );
  const rate = wrapper.get('[data-tooltip]');
  await rate.trigger('pointerover');
  await flushPromises();
  expect(show).toHaveBeenCalled();
  expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('盈亏含历史金额');
  await rate.trigger('pointerout');
  await flushPromises();
  expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('');
  wrapper.unmount();
});
