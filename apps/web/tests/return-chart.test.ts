// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { CurvePoint } from '@resilient-riches/core';
import ReturnChart from '../src/components/dashboard/ReturnChart.vue';

const emptyPoint: CurvePoint = {
  date: '2026-09-13',
  pnl: '0.00',
  cumulativePnl: '0.00',
  closingBalance: '0.00',
  returnRate: null,
  rateReason: 'no_capital',
};
describe('return chart empty interaction', () => {
  it.each([{ points: [] }, { points: [emptyPoint] }])(
    'does not show a tooltip on an empty chart',
    async ({ points }) => {
      const wrapper = mount(ReturnChart, { props: { points, privateMode: false, loading: false } });
      const plot = wrapper.get('.return-plot');
      expect(wrapper.find('svg').exists()).toBe(false);
      await plot.trigger('pointermove', { clientX: 300, clientY: 100 });
      await plot.trigger('keydown', { key: 'End' });
      expect(wrapper.find('.chart-tooltip').exists()).toBe(false);
      expect(plot.attributes('tabindex')).toBe('-1');
      wrapper.unmount();
    },
  );
  it('clears an existing tooltip when the chart becomes empty and keeps valid zero-return data usable', async () => {
    const point = { ...emptyPoint, returnRate: '0', rateReason: null };
    const wrapper = mount(ReturnChart, {
      props: { points: [point], privateMode: false, loading: false },
    });
    await wrapper.get('.return-plot').trigger('keydown', { key: 'End' });
    expect(wrapper.get('.chart-tooltip').text()).toContain('2026-09-13');
    await wrapper.setProps({ points: [emptyPoint] });
    expect(wrapper.find('.chart-tooltip').exists()).toBe(false);
    wrapper.unmount();
  });
});
