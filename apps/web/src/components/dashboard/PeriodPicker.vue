<script setup lang="ts">
import { computed, ref } from 'vue';
import { addDays, parseDate, periodRange } from '@resilient-riches/core';
import type { Period, DateRange } from '@resilient-riches/core';
import AppButton from '../ui/AppButton.vue';
import AppIcon from '../ui/AppIcon.vue';
import BaseOverlay from '../ui/BaseOverlay.vue';
import PeriodCalendar from './PeriodCalendar.vue';
const props = defineProps<{
  period: Period;
  anchor: string;
  today: string;
  range: DateRange;
  disabled: boolean;
}>();
const emit = defineEmits<{ change: [period: Period, anchor: string] }>();
const choosing = ref(false);
const labels: { id: Period; label: string }[] = [
  { id: 'day', label: '日' },
  { id: 'week', label: '周' },
  { id: 'month', label: '月' },
  { id: 'year', label: '年' },
];
const index = computed(() => labels.findIndex((item) => item.id === props.period));
function adjacent(delta: number) {
  const range = periodRange(props.period, props.anchor, props.today);
  if (delta < 0) {
    try {
      return addDays(range.from, -1);
    } catch {
      return null;
    }
  }
  const start = parseDate(range.from);
  if (props.period === 'day') start.setUTCDate(start.getUTCDate() + 1);
  else if (props.period === 'week') start.setUTCDate(start.getUTCDate() + 7);
  else if (props.period === 'month') start.setUTCMonth(start.getUTCMonth() + 1);
  else start.setUTCFullYear(start.getUTCFullYear() + 1);
  const date = start.toISOString().slice(0, 10);
  return date <= props.today ? date : null;
}
function move(delta: number) {
  const value = adjacent(delta);
  if (value) emit('change', props.period, value);
}
function select(date: string) {
  emit('change', props.period, date);
  choosing.value = false;
}
</script>
<template>
  <div class="period-controls">
    <div class="range-controls">
      <button
        class="icon-button"
        aria-label="上一期间"
        :disabled="disabled || !adjacent(-1)"
        :data-disabled-reason="disabled ? '正在读取收益数据，请稍候' : '已到支持的最早期间'"
        @click="move(-1)"
      >
        <AppIcon name="caret-left" /></button
      ><button
        class="range-label"
        :disabled="disabled"
        :data-disabled-reason="disabled ? '正在读取收益数据，请稍候' : undefined"
        @click="choosing = true"
      >
        {{ range.from }}<span v-if="range.to !== range.from"> — {{ range.to }}</span
        ><AppIcon name="calendar-blank" /></button
      ><button
        class="icon-button"
        aria-label="下一期间"
        :disabled="disabled || !adjacent(1)"
        :data-disabled-reason="disabled ? '正在读取收益数据，请稍候' : '不能查看未来期间'"
        @click="move(1)"
      >
        <AppIcon name="caret-right" />
      </button>
    </div>
    <div class="period-segment" role="group" aria-label="收益周期">
      <span class="period-marker" :style="{ transform: `translateX(${index * 100}%)` }"></span
      ><button
        v-for="item in labels"
        :key="item.id"
        :aria-pressed="period === item.id"
        :disabled="disabled"
        :data-disabled-reason="disabled ? '正在读取收益数据，请稍候' : undefined"
        @click="emit('change', item.id, anchor)"
      >
        {{ item.label }}
      </button>
    </div>
  </div>
  <BaseOverlay
    v-if="choosing"
    :title="{ day: '选择日期', week: '选择周', month: '选择月份', year: '选择年份' }[period]"
    class="date-overlay"
    @request-close="choosing = false"
    ><div class="date-form">
      <PeriodCalendar :period="period" :anchor="anchor" :today="today" @select="select" />
      <div class="confirmation-actions">
        <AppButton @click="select(today)">{{
          { day: '今天', week: '本周', month: '本月', year: '本年' }[period]
        }}</AppButton
        ><AppButton @click="choosing = false">关闭</AppButton>
      </div>
    </div></BaseOverlay
  >
</template>
