<script setup lang="ts">
import { ref } from 'vue';
import BaseOverlay from './BaseOverlay.vue';
import AppIcon from './AppIcon.vue';
import PeriodCalendar from '../dashboard/PeriodCalendar.vue';
defineProps<{
  id: string;
  label: string;
  modelValue: string;
  today: string;
  disabled: boolean;
  error?: string | undefined;
}>();
const emit = defineEmits<{ 'update:modelValue': [date: string] }>();
const open = ref(false);
function select(date: string) {
  emit('update:modelValue', date);
  open.value = false;
}
</script>
<template>
  <div class="field">
    <label :for="id">{{ label }} <span class="required" aria-hidden="true">*</span></label>
    <button
      :id="id"
      type="button"
      class="date-field-control"
      :disabled="disabled"
      data-disabled-reason="正在保存，请稍候再选择日期"
      :aria-invalid="!!error"
      @click="open = true"
    >
      <span>{{ modelValue }}</span
      ><AppIcon name="calendar-blank" />
    </button>
    <p v-if="error" class="field-error" role="alert">{{ error }}</p>
  </div>
  <BaseOverlay
    v-if="open"
    :title="`选择${label}`"
    class="date-overlay"
    @request-close="open = false"
    ><div class="date-form">
      <PeriodCalendar period="day" :anchor="modelValue" :today="today" @select="select" /></div
  ></BaseOverlay>
</template>
