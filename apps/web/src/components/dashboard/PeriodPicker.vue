<script setup lang="ts">
import { computed, ref } from 'vue';
import { addDays, parseDate, periodRange } from '@resilient-riches/core';
import type { Period, DateRange } from '@resilient-riches/core';
import AppButton from '../ui/AppButton.vue';
import AppIcon from '../ui/AppIcon.vue';
import AppField from '../ui/AppField.vue';
import BaseOverlay from '../ui/BaseOverlay.vue';
const props = defineProps<{
  period: Period;
  anchor: string;
  today: string;
  range: DateRange;
  disabled: boolean;
}>();
const emit = defineEmits<{ change: [period: Period, anchor: string] }>();
const choosing = ref(false),
  draft = ref(''),
  error = ref('');
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
function submit() {
  try {
    periodRange(props.period, draft.value, props.today);
    emit('change', props.period, draft.value);
    choosing.value = false;
  } catch {
    error.value = '请输入有效日期，且不能晚于今天';
  }
}
</script>
<template>
  <div class="period-controls">
    <div class="range-controls">
      <button
        class="icon-button"
        aria-label="上一期间"
        :disabled="disabled || !adjacent(-1)"
        @click="move(-1)"
      >
        <AppIcon name="caret-left" /></button
      ><button
        class="range-label"
        :disabled="disabled"
        @click="
          draft = anchor;
          error = '';
          choosing = true;
        "
      >
        {{ range.from }}<span v-if="range.to !== range.from"> — {{ range.to }}</span
        ><AppIcon name="calendar-blank" /></button
      ><button
        class="icon-button"
        aria-label="下一期间"
        :disabled="disabled || !adjacent(1)"
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
        @click="emit('change', item.id, anchor)"
      >
        {{ item.label }}
      </button>
    </div>
  </div>
  <BaseOverlay
    v-if="choosing"
    title="选择日期"
    class="date-overlay"
    @request-close="choosing = false"
    ><form class="date-form" @submit.prevent="submit">
      <AppField
        id="period-date"
        v-model="draft"
        label="查看日期所在期间"
        placeholder="YYYY-MM-DD"
        :error="error"
      />
      <div class="confirmation-actions">
        <AppButton @click="draft = today">今天</AppButton
        ><AppButton type="submit" variant="primary">查看</AppButton>
      </div>
    </form></BaseOverlay
  >
</template>
