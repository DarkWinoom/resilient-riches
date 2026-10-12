// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { addDays } from '@resilient-riches/core';
import CandlestickChart from '../src/components/dashboard/CandlestickChart.vue';

const props = {
  points: Array.from({ length: 150 }, (_, index) => {
    const rate = (index / 149) * 0.2;
    const prior = (Math.max(0, index - 1) / 149) * 0.2;
    const openingBalance = (1000 * (1 + prior)).toFixed(2);
    const closingBalance = (1000 * (1 + rate)).toFixed(2);
    return {
      date: addDays('2026-04-19', index),
      returnRate: rate.toFixed(6),
      openingReturnRate: prior.toFixed(6),
      rateReason: null,
      recorded: true,
      openingBalance,
      closingBalance,
      pnl: (Number(closingBalance) - Number(openingBalance)).toFixed(2),
    };
  }),
  today: '2026-09-15',
  loading: false,
};
let wrapper: VueWrapper;
afterEach(() => wrapper?.unmount());

describe('homepage candlestick chart', () => {
  it('shows the percentage scale on the left, defaults to daily bodies and switches all four granularities', async () => {
    wrapper = mount(CandlestickChart, { props });
    const buttons = wrapper.findAll('.candlestick-periods button');
    expect(buttons.map((button) => button.text())).toEqual(['日', '周', '月', '年']);
    expect(buttons[0]!.attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('.candlestick-wick').exists()).toBe(false);
    expect(wrapper.findAll('.candlestick-candle')).toHaveLength(90);
    expect(wrapper.get('.candlestick-navigation').text()).toContain('2026.06.18');
    const axis = wrapper.findAll('svg text').filter((text) => text.text().includes('%'));
    const firstBody = wrapper.get('.candlestick-body');
    expect(
      axis.every((text) => Number(text.attributes('x')) < Number(firstBody.attributes('x'))),
    ).toBe(true);
    for (const button of buttons.slice(1)) {
      await button.trigger('click');
      expect(button.attributes('aria-pressed')).toBe('true');
      expect(wrapper.find('.candlestick-wick').exists()).toBe(true);
      expect(wrapper.get('.candlestick-plot').text()).toContain('+20.00%');
      const readout = wrapper.get('.candlestick-readout').text();
      expect(readout).toContain(`${button.text()}收益`);
      expect(readout).toContain('总资产 ¥ 1,200.00');
      expect(readout).not.toMatch(
        /期初|期末|最高|最低|最底|收益率仅统计可计算部分|本[日周月年]收益率/,
      );
    }
    expect(wrapper.text()).not.toContain('资产轨迹');
    expect(wrapper.find('svg title').exists()).toBe(false);
    expect(wrapper.get('svg').attributes('aria-label')).toContain('累计收益率');
  });
  it('supports older windows, keyboard navigation across their edges and restoring the latest candle', async () => {
    wrapper = mount(CandlestickChart, { props });
    const plot = wrapper.get('.candlestick-plot');
    await wrapper.get('[aria-label="查看更早K线"]').trigger('click');
    expect(wrapper.get('.candlestick-navigation').text()).toContain('2026.07.17');
    expect(wrapper.get('[aria-label="查看更新K线"]').attributes('disabled')).toBeUndefined();
    await plot.trigger('keydown', { key: 'Home' });
    expect(wrapper.get('.candlestick-readout').text()).toContain('2026-04-19');
    await plot.trigger('keydown', { key: 'End' });
    expect(wrapper.get('.candlestick-readout').text()).toContain('2026-09-15');
    expect(wrapper.get('[aria-label="查看更新K线"]').attributes('disabled')).toBeDefined();
    for (let index = 0; index < 91; index++) await plot.trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.get('.candlestick-readout').text()).toContain('2026-06-16');
    expect(wrapper.get('.candlestick-navigation').text()).not.toContain('2026.09.15');
  });
  it('distinguishes dragging from selecting a candle and retains a clicked readout after pointer leave', async () => {
    wrapper = mount(CandlestickChart, { props });
    const plot = wrapper.get('.candlestick-plot');
    const originalRange = wrapper.get('.candlestick-navigation').text();
    await plot.trigger('pointerdown', { button: 0, pointerId: 1, clientX: 300 });
    await plot.trigger('pointermove', { pointerId: 1, clientX: 460 });
    await plot.trigger('pointerup', { pointerId: 1, clientX: 460 });
    expect(wrapper.get('.candlestick-navigation').text()).not.toBe(originalRange);
    expect(wrapper.find('.candlestick-plot--dragging').exists()).toBe(false);
    await plot.trigger('pointerdown', { button: 0, pointerId: 1, clientX: 500 });
    await plot.trigger('pointerup', { pointerId: 1, clientX: 500 });
    const readout = wrapper.get('.candlestick-readout').text();
    await plot.trigger('pointerleave');
    expect(wrapper.get('.candlestick-readout').text()).toBe(readout);
  });
  it('reports missing rates without plotting a zero candle and clears selection when history disappears', async () => {
    wrapper = mount(CandlestickChart, {
      props: {
        ...props,
        points: [{ date: props.today, returnRate: null, rateReason: 'no_capital' }],
      },
    });
    expect(wrapper.find('svg').exists()).toBe(false);
    expect(wrapper.get('.candlestick-readout').text()).toContain('无可计算的本金');
    expect(wrapper.get('.candlestick-readout').text()).not.toContain('0.00%');
    await wrapper.setProps(props);
    await wrapper.get('.candlestick-plot').trigger('keydown', { key: 'Home' });
    await wrapper.setProps({ points: [] });
    expect(wrapper.get('.candlestick-plot').attributes('tabindex')).toBe('-1');
    expect(wrapper.find('svg').exists()).toBe(false);
    expect(wrapper.get('.candlestick-readout').text()).toBe('暂无录入记录');
  });
  it('hides monetary readouts and clears previously announced money in privacy mode', async () => {
    wrapper = mount(CandlestickChart, { props });
    const plot = wrapper.get('.candlestick-plot');
    await plot.trigger('keydown', { key: 'End' });
    expect(wrapper.get('[role="status"]').text()).toContain('1,200.00');
    expect(wrapper.get('.candlestick-readout').text()).toContain('日收益 +1.34');
    await wrapper.setProps({ privateMode: true });
    expect(wrapper.get('.candlestick-readout').text()).not.toMatch(/1,200\.00|1,198\.66|1\.34/);
    expect(wrapper.get('.candlestick-readout').text()).toContain('••••••');
    expect(wrapper.get('[role="status"]').text()).toBe('');
    await plot.trigger('keydown', { key: 'End' });
    expect(wrapper.get('[role="status"]').text()).not.toContain('1,200.00');
    expect(wrapper.get('.candlestick-readout').text()).toContain('日收益率');
  });
});
