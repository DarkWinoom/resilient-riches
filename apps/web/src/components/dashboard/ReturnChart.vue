<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useId, useTemplateRef, watch } from 'vue';
import type { CurvePoint } from '@resilient-riches/core';
import { amountTone, moneyLabel, rateLabel, signedMoney } from '../../utils/format.ts';
const props = defineProps<{
  points: readonly CurvePoint[];
  privateMode: boolean;
  loading: boolean;
}>();
const mode = ref<'rate' | 'amount'>('rate');
const shownMode = computed(() => (props.privateMode ? 'rate' : mode.value));
const plot = useTemplateRef<HTMLDivElement>('plot');
const width = ref(800),
  height = ref(280),
  active = ref<number | null>(null);
const clip = useId();
let observer: ResizeObserver | undefined;
onMounted(() => {
  observer = new ResizeObserver((entries) => {
    const size = entries[0]?.contentRect;
    if (size) {
      width.value = size.width;
      height.value = size.height;
    }
  });
  if (plot.value) observer.observe(plot.value);
});
onUnmounted(() => observer?.disconnect());
watch(
  () => [props.points, shownMode.value],
  () => {
    active.value = null;
  },
);
const values = computed(() =>
  props.points.map((point) =>
    shownMode.value === 'rate'
      ? point.returnRate === null
        ? null
        : Number(point.returnRate) * 100
      : Number(point.cumulativePnl),
  ),
);
const samples = computed(() => [0, ...values.value]);
const available = computed(() => values.value.some((value) => value !== null));
const flat = computed(() => values.value.every((value) => value === null || value === 0));
const lastValue = computed(() => values.value.at(-1) ?? null);
const bounds = computed(() => {
  const finite = samples.value.filter((value): value is number => value !== null);
  let low = Math.min(0, ...finite),
    high = Math.max(0, ...finite);
  const padding = (high - low || 1) * 0.13;
  low = low < 0 ? low - padding : 0;
  high = high > 0 ? high + padding : 0;
  if (low === high) {
    low = -1;
    high = 1;
  }
  return { low, high };
});
const x = (index: number) =>
  66 + (index / Math.max(1, samples.value.length - 1)) * (width.value - 88);
const y = (value: number) =>
  20 + ((bounds.value.high - value) / (bounds.value.high - bounds.value.low)) * (height.value - 56);
const paths = computed(() => {
  const result: string[] = [];
  let path = '';
  samples.value.forEach((value, index) => {
    if (value === null) {
      if (path) result.push(path);
      path = '';
      return;
    }
    path += `${path ? ' L' : 'M'}${x(index)},${y(value)}`;
  });
  if (path) result.push(path);
  return result;
});
const ticks = computed(() =>
  Array.from(
    { length: 5 },
    (_, index) => bounds.value.low + ((bounds.value.high - bounds.value.low) * index) / 4,
  ),
);
function tick(value: number) {
  if (shownMode.value === 'rate') return `${value.toFixed(Math.abs(value) < 1 ? 2 : 1)}%`;
  const absolute = Math.abs(value);
  return absolute >= 1e8
    ? `${(value / 1e8).toFixed(1)}亿`
    : absolute >= 1e4
      ? `${(value / 1e4).toFixed(1)}万`
      : value.toFixed(absolute < 10 ? 1 : 0);
}
const tooltip = computed(() => (active.value === null ? null : props.points[active.value]));
function pointAt(event: PointerEvent) {
  const rect = plot.value?.getBoundingClientRect();
  if (!rect) return;
  const index =
    Math.round(
      ((event.clientX - rect.left - 66) / (width.value - 88)) * (samples.value.length - 1),
    ) - 1;
  active.value = Math.max(0, Math.min(props.points.length - 1, index));
}
function key(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) return;
  event.preventDefault();
  if (event.key === 'Escape') {
    active.value = null;
    return;
  }
  active.value =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? props.points.length - 1
        : Math.max(
            0,
            Math.min(
              props.points.length - 1,
              (active.value ?? 0) + (event.key === 'ArrowRight' ? 1 : -1),
            ),
          );
}
const dateLabels = computed(() => {
  if (!props.points.length) return [];
  return [...new Set([0, Math.floor((props.points.length - 1) / 2), props.points.length - 1])].map(
    (index) => ({ index, label: props.points[index]!.date.slice(5).replace('-', '.') }),
  );
});
</script>
<template>
  <section class="return-panel chart-panel" :aria-busy="loading">
    <header class="chart-heading">
      <h2>收益曲线</h2>
      <div class="chart-modes" role="group" aria-label="曲线指标">
        <button :aria-pressed="shownMode === 'rate'" @click="mode = 'rate'">收益率</button
        ><button
          v-if="!privateMode"
          :aria-pressed="shownMode === 'amount'"
          @click="mode = 'amount'"
        >
          收益金额
        </button>
      </div>
    </header>
    <div
      ref="plot"
      class="return-plot"
      tabindex="0"
      :aria-label="`累计${shownMode === 'rate' ? '收益率' : '收益金额'}曲线，使用左右方向键查看日期`"
      @pointermove="pointAt"
      @pointerleave="active = null"
      @keydown="key"
    >
      <svg
        v-if="available"
        :viewBox="`0 0 ${width} ${height}`"
        width="100%"
        height="100%"
        aria-hidden="true"
      >
        <defs>
          <clipPath :id="`${clip}-up`"><rect x="0" y="0" :width="width" :height="y(0)" /></clipPath>
          <clipPath :id="`${clip}-down`">
            <rect x="0" :y="y(0)" :width="width" :height="height - y(0)" />
          </clipPath>
        </defs>
        <g v-for="value in ticks" :key="value">
          <line x1="66" :x2="width - 22" :y1="y(value)" :y2="y(value)" class="chart-gridline" />
          <text x="56" :y="y(value) + 5" text-anchor="end">{{ tick(value) }}</text>
        </g>
        <line x1="66" :x2="width - 22" :y1="y(0)" :y2="y(0)" class="chart-zero" />
        <g :key="`${shownMode}-${points[0]?.date}-${points.length}`" class="chart-lines">
          <template v-for="(path, index) in paths" :key="index">
            <path v-if="flat" :d="path" class="chart-line chart-line--flat" />
            <path
              v-else
              :d="path"
              class="chart-line chart-line--up"
              :clip-path="`url(#${clip}-up)`"
            />
            <path
              v-if="!flat"
              :d="path"
              class="chart-line chart-line--down"
              :clip-path="`url(#${clip}-down)`"
            />
          </template>
        </g>
        <circle
          v-if="lastValue !== null"
          :cx="x(samples.length - 1)"
          :cy="y(lastValue)"
          r="3"
          class="chart-dot"
        />
        <text x="66" :y="height - 8">期初</text>
        <text
          v-for="label in dateLabels"
          :key="label.index"
          :x="x(label.index + 1)"
          :y="height - 8"
          :text-anchor="label.index === points.length - 1 ? 'end' : 'middle'"
          :class="{ 'chart-first-date': label.index === 0 && points.length > 4 }"
        >
          {{ label.label }}
        </text>
        <template v-if="tooltip && active !== null">
          <line
            :x1="x(active + 1)"
            :x2="x(active + 1)"
            y1="16"
            :y2="height - 34"
            class="chart-crosshair"
          />
          <circle
            v-if="values[active] !== null"
            :cx="x(active + 1)"
            :cy="y(values[active] ?? 0)"
            r="4"
            class="chart-dot"
          />
        </template>
      </svg>
      <div v-else class="chart-empty">
        {{ shownMode === 'rate' ? '暂无可计算的收益率' : '暂无收益数据' }}
      </div>
      <div
        v-if="tooltip"
        class="chart-tooltip"
        role="status"
        :style="{ left: `${Math.max(0, Math.min(width - 220, x((active ?? 0) + 1) - 100))}px` }"
      >
        <strong>{{ tooltip.date }}</strong
        ><span
          >累计收益率
          <b :class="amountTone(tooltip.returnRate ?? '0')">{{
            rateLabel(tooltip.returnRate)
          }}</b></span
        ><template v-if="!privateMode"
          ><span
            >本期累计收益
            <b :class="amountTone(tooltip.cumulativePnl)">{{
              signedMoney(tooltip.cumulativePnl)
            }}</b></span
          ><span
            >当日收益 <b :class="amountTone(tooltip.pnl)">{{ signedMoney(tooltip.pnl) }}</b></span
          ><span
            >当日余额 <b>{{ moneyLabel(tooltip.closingBalance) }}</b></span
          ></template
        ><span v-if="tooltip.rateReason && tooltip.rateReason !== 'no_capital'" class="muted">{{
          tooltip.rateReason === 'capital_reset'
            ? '本金归零后重启，无法连续复利'
            : '存在零本金收益，无法连续复利'
        }}</span>
      </div>
    </div>
  </section>
</template>
