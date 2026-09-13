<script setup lang="ts">
import { computed } from 'vue';
import { VueDatePicker } from '@vuepic/vue-datepicker';
import type { ModelValue, AriaLabelsConfig } from '@vuepic/vue-datepicker';
import { zhCN } from 'date-fns/locale';
import { addDays, periodRange } from '@resilient-riches/core';
import type { Period } from '@resilient-riches/core';
import AppIcon from '../ui/AppIcon.vue';

const props = defineProps<{ period: Period; anchor: string; today: string }>();
const emit = defineEmits<{ select: [date: string] }>();
function localDate(value: string) {
  const [year = 1, month = 1, day = 1] = value.split('-').map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(12, 0, 0, 0);
  return date;
}
function iso(date: Date) {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
const model = computed<ModelValue>(() => {
  const date = localDate(props.anchor);
  if (props.period === 'year') return date.getFullYear();
  if (props.period === 'month') return { year: date.getFullYear(), month: date.getMonth() };
  if (props.period === 'week') {
    const from = periodRange('week', props.anchor, props.today).from;
    return [localDate(from), localDate(addDays(from, 6))];
  }
  return date;
});
const maximum = computed(() =>
  localDate(
    props.period === 'week'
      ? addDays(periodRange('week', props.today, props.today).from, 6)
      : props.today,
  ),
);
const aria: Partial<AriaLabelsConfig> = {
  menu: '选择收益期间',
  input: '选择日期',
  nextMonth: '下个月',
  prevMonth: '上个月',
  nextYear: '下一年',
  prevYear: '上一年',
  openYearsOverlay: '选择年份',
  openMonthsOverlay: '选择月份',
  toggleOverlay: '切换日期选择视图',
  yearPicker: () => '选择年份',
  monthPicker: () => '选择月份',
  day: (day) => iso(day.value),
};
function select(value: ModelValue) {
  let date: string | undefined;
  if (props.period === 'year' && typeof value === 'number')
    date = `${String(value).padStart(4, '0')}-01-01`;
  else if (
    props.period === 'month' &&
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'month' in value &&
    'year' in value
  )
    date = `${String(value.year).padStart(4, '0')}-${String(Number(value.month) + 1).padStart(2, '0')}-01`;
  else {
    const selected = Array.isArray(value) ? value[0] : value;
    if (selected instanceof Date && !Number.isNaN(selected.getTime())) date = iso(selected);
  }
  if (date && date <= props.today) {
    periodRange(props.period, date, props.today);
    emit('select', date);
  }
}
</script>
<template>
  <div class="period-calendar" data-disabled-default="超出可选日期范围，不能选择未来期间">
    <VueDatePicker
      :key="period"
      :model-value="model"
      inline
      auto-apply
      :time-config="{ enableTimePicker: false }"
      :week-picker="period === 'week'"
      :month-picker="period === 'month'"
      :year-picker="period === 'year'"
      :week-start="1"
      :locale="zhCN"
      :day-names="['一', '二', '三', '四', '五', '六', '日']"
      :aria-labels="aria"
      :min-date="localDate('0001-01-01')"
      :max-date="maximum"
      :year-range="[1, Number(today.slice(0, 4))]"
      prevent-min-max-navigation
      :transitions="false"
      :action-row="{ showSelect: false, showCancel: false, showPreview: false }"
      @update:model-value="select"
      ><template #arrow-left><AppIcon name="caret-left" /></template
      ><template #arrow-right><AppIcon name="caret-right" /></template
    ></VueDatePicker>
    <p v-if="period === 'week'" class="calendar-instruction">
      点击日期选择所在周，周一为一周起始。
    </p>
  </div>
</template>
