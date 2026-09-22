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
  it('plots assets and shows the balance, cash flows and profit without a rate', async () => {
    const wrapper = mount(ReturnChart, {
      props: {
        points: [
          {
            ...emptyPoint,
            closingBalance: '1000.00',
            buy: '1000.00',
            sell: '0.00',
            pnl: '0.00',
            returnRate: '0',
          },
          {
            ...emptyPoint,
            date: '2026-09-14',
            closingBalance: '1205.00',
            buy: '250.00',
            sell: '50.00',
            pnl: '5.00',
            returnRate: '0.004',
          },
        ],
        privateMode: false,
        loading: false,
      },
    });
    expect(wrapper.get('h2').text()).toBe('资产走势');
    await wrapper.findAll('.chart-modes button')[1]!.trigger('click');
    await wrapper.get('.return-plot').trigger('keydown', { key: 'End' });
    const tip = wrapper.get('.chart-tooltip').text();
    expect(tip).toContain('总金额 1,205.00');
    expect(tip).toContain('当日转入 250.00');
    expect(tip).toContain('当日转出 50.00');
    expect(tip).toContain('收益金额 +5.00');
    expect(tip).not.toMatch(/%|收益率/);
    expect(wrapper.get('.return-plot').attributes('aria-label')).toContain('每日总资产');
    await wrapper.setProps({ privateMode: true });
    expect(wrapper.findAll('.chart-modes button')).toHaveLength(1);
    expect(wrapper.get('.return-plot').attributes('aria-label')).toContain('收益率');
    wrapper.unmount();
  });
  it.each([{ points: [] }])('does not show a tooltip on an empty chart', async ({ points }) => {
    const wrapper = mount(ReturnChart, { props: { points, privateMode: false, loading: false } });
    const plot = wrapper.get('.return-plot');
    expect(wrapper.find('svg').exists()).toBe(false);
    await plot.trigger('pointermove', { clientX: 300, clientY: 100 });
    await plot.trigger('keydown', { key: 'End' });
    expect(wrapper.find('.chart-tooltip').exists()).toBe(false);
    expect(plot.attributes('tabindex')).toBe('-1');
    wrapper.unmount();
  });
  it('plots undefined nodes at zero without reporting a fabricated rate, then displays rates above 100%', async () => {
    const wrapper = mount(ReturnChart, {
      props: {
        points: [
          emptyPoint,
          { ...emptyPoint, date: '2026-09-14', returnRate: '1.48', rateReason: null },
        ],
        privateMode: false,
        loading: false,
      },
    });
    expect(wrapper.find('svg').exists()).toBe(true);
    const zeroY = wrapper.get('.chart-zero').attributes('y1');
    expect(wrapper.get('.chart-line').attributes('d')).toContain(`M66,${zeroY}`);
    await wrapper.get('.return-plot').trigger('keydown', { key: 'Home' });
    expect(wrapper.get('.chart-tooltip').text()).toContain('累计收益率 —');
    expect(wrapper.text()).not.toMatch(/历史本金|启用后收益率|无法连续/);
    await wrapper.get('.return-plot').trigger('keydown', { key: 'End' });
    expect(wrapper.get('.chart-tooltip').text()).toContain('+148.00%');
    wrapper.unmount();
  });
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
