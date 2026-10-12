<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useId, useTemplateRef, watch } from 'vue';
import type { ReturnHistoryPoint } from '@resilient-riches/core';
import { candleRateReason, createReturnTimeline } from '../../utils/return-candles.ts';
import type { CandlePeriod, ReturnCandle } from '../../utils/return-candles.ts';
import { amountTone, moneyLabel, rateLabel, signedMoney } from '../../utils/format.ts';
import AppIcon from '../ui/AppIcon.vue';
import ReturnRate from '../ui/ReturnRate.vue';

const props = withDefaults(
  defineProps<{
    points: readonly ReturnHistoryPoint[];
    today: string;
    loading: boolean;
    privateMode?: boolean;
  }>(),
  { privateMode: false },
);
const period = ref<CandlePeriod>('day');
const periods: { value: CandlePeriod; label: string; count: number }[] = [
  { value: 'day', label: '日', count: 90 },
  { value: 'week', label: '周', count: 52 },
  { value: 'month', label: '月', count: 48 },
  { value: 'year', label: '年', count: 36 },
];
const plot = useTemplateRef<HTMLDivElement>('plot');
const width = ref(800),
  height = ref(236),
  offset = ref(0),
  active = ref<number | null>(null),
  pinned = ref(false),
  dragging = ref(false),
  announcement = ref('');
const chartId = useId();
const label = computed(() => periods.find((item) => item.value === period.value)!.label);
const timeline = computed(() => createReturnTimeline(props.points, period.value, props.today));
const capacity = computed(() => periods.find((item) => item.value === period.value)!.count);
const maxOffset = computed(() => Math.max(0, timeline.value.length - capacity.value));
const end = computed(() => timeline.value.length - Math.min(offset.value, maxOffset.value));
const start = computed(() => Math.max(0, end.value - capacity.value));
const candles = computed(() => timeline.value.candles(start.value, end.value - start.value));
const available = computed(() => candles.value.length > 0);
const selected = computed(() => candles.value[(active.value ?? end.value - 1) - start.value]);
const drawable = (candle: ReturnCandle) =>
  candle.direction !== 'missing' &&
  [candle.open, candle.close, candle.high, candle.low].every(
    (value) => value !== null && Number.isFinite(Number(value) * 100),
  );
const plotted = computed(() => candles.value.filter(drawable));
const bounds = computed(() => {
  const values = plotted.value.flatMap((candle) => [
    Number(candle.low) * 100,
    Number(candle.high) * 100,
  ]);
  const low = Math.min(...values),
    high = Math.max(...values);
  if (!values.length) return { low: -1, high: 1 };
  const padding = Math.max((high - low) * 0.15, Math.abs(high) * 0.01, 0.1);
  return { low: low - padding, high: high + padding };
});
const ticks = computed(() =>
  Array.from(
    { length: 5 },
    (_, index) => bounds.value.low + ((bounds.value.high - bounds.value.low) * index) / 4,
  ),
);
function axisRate(value: number) {
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(1)}万%`;
  return `${value > 0 ? '+' : ''}${value.toFixed(Math.abs(value) >= 100 ? 1 : 2)}%`;
}
const left = computed(() =>
  Math.max(66, ...ticks.value.map((value) => axisRate(value).length * 7 + 14)),
);
const right = computed(() => Math.max(left.value + 30, width.value - 12));
const top = 16;
const bottom = computed(() => height.value - 30);
const step = computed(() => (right.value - left.value) / Math.max(1, candles.value.length));
const bodyWidth = computed(() => Math.max(0.6, Math.min(25, step.value * 0.64)));
const bodyStroke = computed(() => Math.min(1.5, bodyWidth.value * 0.3));
const x = (index: number) => left.value + (index + 0.5) * step.value;
const y = (value: number) =>
  top +
  ((bounds.value.high - value) / (bounds.value.high - bounds.value.low)) * (bottom.value - top);
const percent = (value: string | null) => Number(value) * 100;
const latest = computed(() => {
  const candle = candles.value.at(-1);
  return candle && drawable(candle) ? candle : null;
});
const selectedX = computed(() => x((active.value ?? end.value - 1) - start.value));
const selectedY = computed(() =>
  selected.value && drawable(selected.value) ? y(percent(selected.value.close)) : null,
);
const rangeLabel = computed(() =>
  available.value
    ? `${candles.value[0]!.from.replaceAll('-', '.')} — ${candles.value.at(-1)!.to.replaceAll('-', '.')}`
    : '暂无录入记录',
);
const emptyLabel = computed(() => (available.value ? '暂无可计算的收益率' : '暂无录入记录'));
function dateLabel(candle: ReturnCandle) {
  if (period.value === 'year') return candle.date.slice(0, 4);
  if (period.value === 'month') return candle.date.slice(0, 7).replace('-', '.');
  if (candle.from.slice(0, 4) !== props.today.slice(0, 4))
    return width.value < 460 ? candle.from.slice(0, 4) : candle.from.replaceAll('-', '.');
  return candle.from.slice(5).replace('-', '.');
}
function candleLabel(candle: ReturnCandle) {
  return period.value === 'year'
    ? candle.date.slice(0, 4) + '年'
    : period.value === 'month'
      ? candle.date.slice(0, 7)
      : period.value === 'week'
        ? `${candle.from} ~ ${candle.to}`
        : candle.from;
}
const dateTicks = computed(() => {
  if (!candles.value.length) return [];
  const count = width.value < 460 ? 3 : 5;
  return [
    ...new Set(
      Array.from({ length: count }, (_, index) =>
        Math.round((index * (candles.value.length - 1)) / (count - 1)),
      ),
    ),
  ]
    .filter((index) => index >= 0)
    .map((index) => ({ index, label: dateLabel(candles.value[index]!) }));
});
function describe(candle: ReturnCandle) {
  const values = `${candleLabel(candle)}，总资产${balanceLabel(candle.closingBalance)}，${label.value}收益${profitLabel(candle.pnl)}，${label.value}收益率${rateLabel(candle.returnRate)}`;
  return candle.direction === 'missing'
    ? `${values}，${candleRateReason(candle.rateReason)}`
    : values;
}
function balanceLabel(value: string | null) {
  return value === null ? '—' : props.privateMode ? '••••••' : `¥ ${moneyLabel(value)}`;
}
function profitLabel(value: string | null) {
  return value === null ? '—' : props.privateMode ? '••••••' : signedMoney(value);
}
function reset() {
  offset.value = 0;
  active.value = null;
  pinned.value = false;
  dragging.value = false;
  drag = undefined;
}
watch(() => [props.points, props.today], reset);
watch(
  () => props.privateMode,
  () => {
    announcement.value = '';
  },
);
watch(period, () => {
  reset();
  announcement.value = `已切换${label.value}K，每根柱代表一${label.value}，${period.value === 'day' ? '不显示上下影线' : '影线显示期内累计收益率高低值'}。`;
});
watch(capacity, () => {
  offset.value = Math.min(offset.value, maxOffset.value);
  active.value = null;
  pinned.value = false;
});
let observer: ResizeObserver | undefined;
let drag: { x: number; offset: number; pointer: number } | undefined;
onMounted(() => {
  observer = new ResizeObserver((entries) => {
    const size = entries[0]?.contentRect;
    if (size && size.width > 0 && size.height > 0) {
      width.value = size.width;
      height.value = size.height;
    }
  });
  if (plot.value) observer.observe(plot.value);
});
onUnmounted(() => observer?.disconnect());
function pointAt(event: PointerEvent) {
  const rect = plot.value?.getBoundingClientRect();
  if (!rect || !available.value) return null;
  return (
    start.value +
    Math.max(
      0,
      Math.min(
        candles.value.length - 1,
        Math.floor((event.clientX - rect.left - left.value) / step.value),
      ),
    )
  );
}
function pointerDown(event: PointerEvent) {
  if (event.button !== 0 || !available.value) return;
  drag = { x: event.clientX, offset: offset.value, pointer: event.pointerId };
  plot.value?.setPointerCapture?.(event.pointerId);
}
function pointerMove(event: PointerEvent) {
  if (drag) {
    if (event.pointerId !== drag.pointer) return;
    const distance = event.clientX - drag.x;
    if (Math.abs(distance) < 6 && !dragging.value) return;
    dragging.value = true;
    active.value = null;
    pinned.value = false;
    offset.value = Math.max(
      0,
      Math.min(maxOffset.value, drag.offset + Math.round(distance / step.value)),
    );
  } else if (!pinned.value) active.value = pointAt(event);
}
function pointerUp(event: PointerEvent) {
  if (!drag || drag.pointer !== event.pointerId) return;
  if (dragging.value) announcement.value = `显示 ${rangeLabel.value}。`;
  else {
    const index = pointAt(event);
    pinned.value = !(pinned.value && active.value === index);
    active.value = index;
  }
  cancelDrag();
  if (plot.value?.hasPointerCapture?.(event.pointerId))
    plot.value.releasePointerCapture(event.pointerId);
}
function cancelDrag() {
  drag = undefined;
  dragging.value = false;
}
function pointerLeave() {
  if (!pinned.value && !drag) active.value = null;
}
function pan(direction: number) {
  offset.value = Math.max(
    0,
    Math.min(maxOffset.value, offset.value + direction * Math.max(1, capacity.value - 1)),
  );
  active.value = null;
  pinned.value = false;
  announcement.value = `显示 ${rangeLabel.value}。`;
}
function key(event: KeyboardEvent) {
  if (
    !available.value ||
    !['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Escape'].includes(event.key)
  )
    return;
  event.preventDefault();
  if (event.key === 'Escape') {
    active.value = null;
    pinned.value = false;
    return;
  }
  if (event.key === 'PageUp' || event.key === 'PageDown') {
    pan(event.key === 'PageUp' ? 1 : -1);
    return;
  }
  const index =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? timeline.value.length - 1
        : Math.max(
            0,
            Math.min(
              timeline.value.length - 1,
              (active.value ?? end.value - 1) + (event.key === 'ArrowLeft' ? -1 : 1),
            ),
          );
  if (index < start.value)
    offset.value = Math.min(maxOffset.value, timeline.value.length - index - capacity.value);
  else if (index >= end.value) offset.value = timeline.value.length - index - 1;
  active.value = index;
  pinned.value = true;
  if (selected.value) announcement.value = describe(selected.value);
}
</script>
<template>
  <section class="return-panel chart-panel candlestick-panel" :aria-busy="loading">
    <header class="chart-heading candlestick-heading">
      <div class="candlestick-title">
        <h2>资产走势</h2>
        <span class="muted">累计收益率</span>
      </div>
      <div class="candlestick-periods" role="group" aria-label="K线周期">
        <button
          v-for="item in periods"
          :key="item.value"
          type="button"
          :aria-pressed="period === item.value"
          :disabled="loading"
          @click="period = item.value"
        >
          {{ item.label }}
        </button>
      </div>
    </header>
    <div class="candlestick-readout">
      <template v-if="selected">
        <span class="candlestick-date" :class="{ 'candlestick-date--daily': period === 'day' }">{{
          candleLabel(selected)
        }}</span
        ><span
          v-if="period !== 'day'"
          class="candlestick-partial"
          :class="{ 'candlestick-partial--hidden': !selected.partial }"
          :aria-hidden="!selected.partial"
          >进行中</span
        >
        <span class="candlestick-balance-field"
          >总资产
          <b class="candlestick-balance">{{ balanceLabel(selected.closingBalance) }}</b></span
        >
        <span class="candlestick-profit-field"
          >{{ label }}收益
          <b :class="amountTone(selected.pnl ?? '0')">{{ profitLabel(selected.pnl) }}</b></span
        >
        <span class="candlestick-rate-field"
          >{{ label }}收益率 <ReturnRate as="b" :value="selected.returnRate"
        /></span>
        <span
          v-if="selected.direction === 'missing' || selected.returnRate === null"
          class="candlestick-reason"
          >{{ candleRateReason(selected.rateReason) }}</span
        >
      </template>
      <span v-else class="muted">{{ emptyLabel }}</span>
    </div>
    <div
      ref="plot"
      class="candlestick-plot"
      :class="{ 'candlestick-plot--dragging': dragging }"
      :tabindex="available ? 0 : -1"
      role="group"
      aria-label="累计收益率K线，左右方向键查看，Home和End到首尾，PageUp和PageDown翻页，也可拖动查看历史"
      @pointerdown="pointerDown"
      @pointermove="pointerMove"
      @pointerup="pointerUp"
      @pointercancel="cancelDrag"
      @lostpointercapture="cancelDrag"
      @pointerleave="pointerLeave"
      @keydown="key"
    >
      <svg
        v-if="plotted.length"
        :viewBox="`0 0 ${width} ${height}`"
        width="100%"
        height="100%"
        role="img"
        :aria-label="`${label}K · 累计收益率（%）`"
        :aria-describedby="`${chartId}-description`"
      >
        <desc :id="`${chartId}-description`">
          {{ rangeLabel }}；空心红柱上涨、实心绿柱下跌、横线持平。{{
            period === 'day' ? '日K没有上下影线。' : '影线显示期内累计收益率的波动范围。'
          }}
        </desc>
        <g v-for="value in ticks" :key="value">
          <line
            :x1="left"
            :x2="right"
            :y1="y(value)"
            :y2="y(value)"
            class="chart-gridline candlestick-grid"
          />
          <text
            v-if="!latest || Math.abs(y(value) - y(percent(latest.close))) > 16"
            :x="left - 10"
            :y="y(value) + 4"
            text-anchor="end"
          >
            {{ axisRate(value) }}
          </text>
        </g>
        <line
          v-if="bounds.low <= 0 && bounds.high >= 0"
          :x1="left"
          :x2="right"
          :y1="y(0)"
          :y2="y(0)"
          class="chart-zero"
        />
        <rect
          v-if="active !== null"
          :x="selectedX - step / 2"
          :y="top"
          :width="step"
          :height="bottom - top"
          class="candlestick-selection"
        />
        <g
          v-for="(candle, index) in candles"
          :key="candle.date"
          :class="['candlestick-candle', `candlestick-candle--${candle.direction}`]"
          :data-candle-date="candle.date"
        >
          <template v-if="drawable(candle)">
            <line
              v-if="period !== 'day'"
              :x1="x(index)"
              :x2="x(index)"
              :y1="y(percent(candle.high))"
              :y2="y(percent(candle.low))"
              class="candlestick-wick"
            />
            <line
              v-if="candle.direction === 'flat'"
              :x1="x(index) - bodyWidth / 2"
              :x2="x(index) + bodyWidth / 2"
              :y1="y(percent(candle.close))"
              :y2="y(percent(candle.close))"
              class="candlestick-flat"
            />
            <rect
              v-else
              :x="x(index) - bodyWidth / 2"
              :y="Math.min(y(percent(candle.open)), y(percent(candle.close)))"
              :width="bodyWidth"
              :height="Math.max(1.5, Math.abs(y(percent(candle.open)) - y(percent(candle.close))))"
              class="candlestick-body"
              :style="{ strokeWidth: bodyStroke }"
            />
          </template>
          <path
            v-else
            :d="`M${x(index) - 3},${bottom - 12}l6,6m-6,0l6,-6`"
            class="candlestick-missing"
          />
        </g>
        <template v-if="latest">
          <line
            :x1="left"
            :x2="right"
            :y1="y(percent(latest.close))"
            :y2="y(percent(latest.close))"
            :class="['candlestick-latest-line', `candlestick-candle--${latest.direction}`]"
          />
          <rect
            x="0"
            :y="y(percent(latest.close)) - 10"
            :width="left - 5"
            height="20"
            rx="2"
            :class="['candlestick-axis-badge', `candlestick-candle--${latest.direction}`]"
          />
          <text
            :x="(left - 5) / 2"
            :y="y(percent(latest.close)) + 4"
            text-anchor="middle"
            class="candlestick-axis-value"
          >
            {{ axisRate(percent(latest.close)) }}
          </text>
        </template>
        <text
          v-for="item in dateTicks"
          :key="item.index"
          :x="x(item.index)"
          :y="height - 8"
          :text-anchor="
            item.index === 0 ? 'start' : item.index === candles.length - 1 ? 'end' : 'middle'
          "
        >
          {{ item.label }}
        </text>
        <template v-if="active !== null && selected">
          <line :x1="selectedX" :x2="selectedX" :y1="top" :y2="bottom" class="chart-crosshair" />
          <line
            v-if="selectedY !== null"
            :x1="left"
            :x2="right"
            :y1="selectedY"
            :y2="selectedY"
            class="chart-crosshair"
          />
          <rect
            :x="Math.max(left, Math.min(right - 68, selectedX - 34))"
            :y="height - 25"
            width="68"
            height="21"
            rx="2"
            class="candlestick-date-badge"
          />
          <text
            :x="Math.max(left, Math.min(right - 68, selectedX - 34)) + 34"
            :y="height - 10"
            text-anchor="middle"
            class="candlestick-axis-value"
          >
            {{ dateLabel(selected) }}
          </text>
        </template>
      </svg>
      <div v-else class="chart-empty">{{ emptyLabel }}</div>
    </div>
    <footer class="candlestick-footer">
      <div class="candlestick-navigation" aria-label="K线历史区间">
        <button
          type="button"
          class="icon-button"
          aria-label="查看更早K线"
          :disabled="offset >= maxOffset || loading"
          @click="pan(1)"
        >
          <AppIcon name="caret-left" />
        </button>
        <span>{{ rangeLabel }} · {{ label }}K</span>
        <button
          type="button"
          class="icon-button"
          aria-label="查看更新K线"
          :disabled="offset <= 0 || loading"
          @click="pan(-1)"
        >
          <AppIcon name="caret-right" />
        </button>
      </div>
      <div class="candlestick-legend" aria-label="空心红柱上涨、实心绿柱下跌、横线持平、叉号缺失">
        <span><i class="candlestick-key-up"></i>上涨</span
        ><span><i class="candlestick-key-down"></i>下跌</span
        ><span><i class="candlestick-key-flat"></i>持平</span
        ><span v-if="candles.some((candle) => !drawable(candle))">× 缺失</span>
      </div>
    </footer>
    <span class="sr-only" role="status" aria-live="polite">{{ announcement }}</span>
  </section>
</template>
<style scoped>
.candlestick-panel {
  height: auto;
  min-height: 360px;
}
.candlestick-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.candlestick-title > span {
  font-size: 12px;
  white-space: nowrap;
}
.candlestick-periods {
  display: flex;
  gap: 4px;
}
.candlestick-periods button {
  width: 38px;
  min-height: 36px;
  padding: 5px 0;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--muted);
  transition:
    background 0.16s,
    color 0.16s,
    border-color 0.16s;
}
.candlestick-periods button:hover:not(:disabled) {
  background: #f4f0e7;
  color: var(--gold);
}
.candlestick-periods button[aria-pressed='true'] {
  color: var(--gold);
  border-bottom-color: var(--gold);
  font-weight: 600;
}
.candlestick-readout {
  display: flex;
  align-items: center;
  gap: 5px 12px;
  flex-wrap: wrap;
  padding: 0 var(--panel-inset) 5px;
  min-height: 32px;
  color: var(--muted);
  font-size: 12px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}
.candlestick-readout > span {
  white-space: nowrap;
}
.candlestick-readout b {
  font-weight: 500;
}
.candlestick-balance {
  color: #302d27;
}
.candlestick-balance-field {
  min-width: 108px;
}
.candlestick-profit-field,
.candlestick-rate-field {
  min-width: 100px;
}
.candlestick-date {
  color: #51493b;
}
.candlestick-date--daily {
  margin-inline-end: 8px;
}
.candlestick-partial {
  display: inline-flex;
  align-items: center;
  height: 16px;
  line-height: 16px;
  background: #f4eedf;
  color: var(--gold);
  padding: 0 5px;
  border-radius: 3px;
}
.candlestick-partial--hidden {
  visibility: hidden;
}
.candlestick-readout .candlestick-reason {
  white-space: normal;
  width: 100%;
}
.candlestick-plot {
  position: relative;
  height: 236px;
  margin: 3px var(--panel-inset) 0;
  flex-shrink: 0;
  touch-action: pan-y;
  user-select: none;
  outline-offset: 3px;
  cursor: crosshair;
}
.candlestick-plot--dragging {
  cursor: grabbing;
}
.candlestick-plot svg {
  display: block;
  overflow: visible;
}
.candlestick-plot text {
  font-size: 12px;
  fill: var(--muted);
  font-variant-numeric: tabular-nums;
}
.candlestick-plot > .chart-empty {
  height: 100%;
}
.candlestick-grid {
  stroke: #eee9df;
  stroke-dasharray: none;
}
.candlestick-selection {
  fill: #f4eedf;
  opacity: 0.6;
}
.candlestick-candle--up {
  color: var(--profit);
}
.candlestick-candle--down {
  color: var(--loss);
}
.candlestick-candle--flat {
  color: var(--muted);
}
.candlestick-wick {
  stroke: currentColor;
  stroke-width: 1.2;
}
.candlestick-body {
  fill: currentColor;
}
.candlestick-candle--up .candlestick-body {
  fill: white;
  stroke: currentColor;
  stroke-width: 1.5;
}
.candlestick-flat {
  stroke: currentColor;
  stroke-width: 1.5;
}
.candlestick-missing {
  fill: none;
  stroke: var(--muted);
  stroke-width: 1.2;
}
.candlestick-latest-line {
  stroke: currentColor;
  stroke-dasharray: 3 4;
  stroke-width: 1;
  opacity: 0.45;
}
.candlestick-axis-badge {
  fill: currentColor;
}
.candlestick-date-badge {
  fill: var(--gold);
}
.candlestick-plot .candlestick-axis-value {
  fill: white;
}
.candlestick-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 5px 10px;
  padding: 6px 0 10px;
  margin: 0 var(--panel-inset);
  border-top: 1px solid #eee9df;
  color: var(--muted);
  font-size: 12px;
}
.candlestick-navigation {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.candlestick-navigation > span {
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.candlestick-navigation .icon-button {
  width: 26px;
  height: 28px;
  flex-shrink: 0;
}
.candlestick-navigation .ph-light {
  font-size: 14px;
}
.candlestick-legend {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}
.candlestick-legend > span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.candlestick-legend i {
  width: 7px;
  height: 10px;
  display: inline-block;
}
.candlestick-key-up {
  border: 1.5px solid var(--profit);
}
.candlestick-key-down {
  background: var(--loss);
}
.candlestick-legend .candlestick-key-flat {
  height: 2px;
  background: var(--muted);
}
@media (max-width: 680px) {
  .candlestick-heading {
    gap: 8px;
    flex-wrap: wrap;
    padding-top: 12px;
    padding-bottom: 8px;
  }
  .candlestick-title > span {
    display: none;
  }
  .candlestick-periods {
    margin-left: auto;
  }
  .candlestick-periods button {
    width: 34px;
    min-height: 40px;
  }
  .candlestick-readout {
    min-height: 46px;
    gap: 5px 10px;
  }
  .candlestick-plot {
    height: 225px;
  }
}
@media (pointer: coarse) {
  .candlestick-periods button {
    min-height: 44px;
  }
  .candlestick-navigation .icon-button {
    width: 34px;
    height: 44px;
  }
}
</style>
