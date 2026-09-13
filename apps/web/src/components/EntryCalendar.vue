<script setup lang="ts">
import { computed, ref } from 'vue';
import { parseDate } from '@resilient-riches/core';
import type { CalendarResponse } from '@resilient-riches/core';
import AppIcon from './ui/AppIcon.vue';
import AppField from './ui/AppField.vue';
const props = defineProps<{
  month: string;
  date: string;
  today: string;
  calendar: CalendarResponse | null;
  loading: boolean;
  disabled: boolean;
  error: string;
}>();
const emit = defineEmits<{ date: [value: string]; month: [value: string]; retry: [] }>();
const choosing = ref(false),
  year = ref(props.month.slice(0, 4));
const yearValid = computed(
  () => /^\d{4}$/.test(year.value) && +year.value >= 1 && +year.value <= +props.today.slice(0, 4),
);
const days = computed(() => {
  const first = parseDate(`${props.month}-01`);
  const offset = (first.getUTCDay() + 6) % 7;
  const last = new Date(first);
  last.setUTCMonth(first.getUTCMonth() + 1, 0);
  return Array.from({ length: 42 }, (_, index) => {
    const day = index - offset + 1;
    return day > 0 && day <= last.getUTCDate()
      ? `${props.month}-${String(day).padStart(2, '0')}`
      : null;
  });
});
function adjacent(delta: number) {
  const value = parseDate(`${props.month}-01`);
  value.setUTCMonth(value.getUTCMonth() + delta);
  return `${String(value.getUTCFullYear()).padStart(4, '0')}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
}
function count(date: string) {
  return props.calendar?.month === props.month
    ? (props.calendar.days.find((item) => item.date === date)?.count ?? 0)
    : 0;
}
function pickMonth(value: number) {
  emit('month', `${year.value}-${String(value).padStart(2, '0')}`);
  choosing.value = false;
}
</script>
<template>
  <aside class="entry-calendar">
    <div class="calendar-heading">
      <button
        class="icon-button"
        aria-label="上个月"
        :disabled="disabled || month === '0001-01'"
        @click="emit('month', adjacent(-1))"
      >
        <AppIcon name="caret-left" /></button
      ><button
        class="calendar-title"
        :disabled="disabled"
        @click="
          year = month.slice(0, 4);
          choosing = !choosing;
        "
      >
        {{ month.replace('-', ' 年 ') }} 月<AppIcon name="caret-down" /></button
      ><button
        class="icon-button"
        aria-label="下个月"
        :disabled="disabled || month >= today.slice(0, 7)"
        @click="emit('month', adjacent(1))"
      >
        <AppIcon name="caret-right" />
      </button>
    </div>
    <div v-if="choosing" class="month-picker">
      <AppField
        id="calendar-year"
        label="年份"
        :model-value="year"
        :maxlength="4"
        @update:model-value="year = $event"
      />
      <div class="month-grid">
        <button
          v-for="value in 12"
          :key="value"
          :disabled="!yearValid || `${year}-${String(value).padStart(2, '0')}` > today.slice(0, 7)"
          @click="pickMonth(value)"
        >
          {{ value }} 月
        </button>
      </div>
    </div>
    <template v-else
      ><div class="calendar-grid weekdays">
        <span v-for="day in ['一', '二', '三', '四', '五', '六', '日']" :key="day">{{ day }}</span>
      </div>
      <div class="calendar-grid" :aria-busy="loading">
        <template v-for="(value, index) in days" :key="index"
          ><button
            v-if="value"
            :class="['calendar-day', { active: value === date, today: value === today }]"
            :disabled="disabled || value > today"
            :aria-label="`${value}${loading ? '' : count(value) ? `，${count(value)}个分类有记录` : '，无记录'}`"
            :aria-pressed="value === date"
            @click="emit('date', value)"
          >
            {{ Number(value.slice(-2))
            }}<span v-if="!loading && count(value)" class="record-dot"></span></button
          ><span v-else></span
        ></template></div
    ></template>
    <div class="calendar-legend">
      <span class="record-dot"></span>有记录<button
        class="text-button"
        :disabled="disabled"
        @click="emit('date', today)"
      >
        回到今天
      </button>
    </div>
    <p v-if="loading" class="muted" role="status">读取日历中…</p>
    <p v-if="error" class="field-error" role="alert">
      {{ error }}<button class="text-button" @click="emit('retry')">重试</button>
    </p>
  </aside>
</template>
