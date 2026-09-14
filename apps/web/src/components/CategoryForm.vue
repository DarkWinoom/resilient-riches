<script setup lang="ts">
import type { CategoryValues } from '@resilient-riches/core';
import AppField from './ui/AppField.vue';
import DateField from './ui/DateField.vue';
defineProps<{
  modelValue: CategoryValues;
  errors: Record<string, string>;
  disabled: boolean;
  today: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: CategoryValues] }>();
const palette = ['#b69a60', '#7c9a8a', '#8c9eae', '#be8f81', '#978bb0', '#c3b477'];
function update(values: CategoryValues, key: keyof CategoryValues, value: string) {
  emit('update:modelValue', { ...values, [key]: value });
}
</script>
<template>
  <div class="form-stack">
    <AppField
      id="category-name"
      label="分类名称"
      :model-value="modelValue.name"
      required
      :disabled="disabled"
      :error="errors.name"
      :maxlength="40"
      @update:model-value="update(modelValue, 'name', $event)"
    />
    <div class="color-options" aria-label="分类配色">
      <button
        v-for="color in palette"
        :key="color"
        type="button"
        :style="{ background: color }"
        :aria-label="`使用颜色 ${color}`"
        :aria-pressed="modelValue.color === color"
        :disabled="disabled"
        :data-disabled-reason="disabled ? '正在保存，请稍候再选择颜色' : undefined"
        @click="update(modelValue, 'color', color)"
      ></button>
    </div>
    <AppField
      id="category-color"
      label="自定义颜色"
      :model-value="modelValue.color"
      :disabled="disabled"
      :error="errors.color"
      @update:model-value="update(modelValue, 'color', $event)"
    />
    <DateField
      id="category-date"
      label="启用日期"
      :today="today"
      :model-value="modelValue.openingDate"
      :disabled="disabled"
      :error="errors.openingDate"
      @update:model-value="update(modelValue, 'openingDate', $event)"
    />
    <div class="form-pair">
      <AppField
        id="category-balance"
        label="初始资金"
        money
        :model-value="modelValue.openingBalance"
        :disabled="disabled"
        :error="errors.openingBalance"
        @update:model-value="update(modelValue, 'openingBalance', $event)"
      /><AppField
        id="category-history"
        label="历史盈亏"
        money
        signed
        :model-value="modelValue.historicalPnl"
        :disabled="disabled"
        :error="errors.historicalPnl"
        @update:model-value="update(modelValue, 'historicalPnl', $event)"
      />
    </div>
    <AppField
      id="category-note"
      label="备注"
      multiline
      :model-value="modelValue.note"
      :disabled="disabled"
      :error="errors.note"
      @update:model-value="update(modelValue, 'note', $event)"
    />
  </div>
</template>
