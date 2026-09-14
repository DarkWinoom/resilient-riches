<script setup lang="ts">
import { computed, ref, useTemplateRef, watchEffect } from 'vue';
import { FinancialDecimal } from '@resilient-riches/core';
import { moneyDraftError, normalizeMoneyDraft } from '../../utils/money-input.ts';
const props = withDefaults(
  defineProps<{
    id: string;
    label: string;
    modelValue: string;
    money?: boolean;
    signed?: boolean;
    multiline?: boolean;
    required?: boolean;
    disabled?: boolean;
    disabledReason?: string;
    error?: string | undefined;
    hint?: string;
    placeholder?: string;
    maxlength?: number;
    large?: boolean;
  }>(),
  {
    money: false,
    signed: false,
    multiline: false,
    required: false,
    disabled: false,
    disabledReason: '正在保存，请稍候再修改',
    error: '',
    hint: '',
    placeholder: '',
    maxlength: 1000,
    large: false,
  },
);
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const control = useTemplateRef<HTMLInputElement | HTMLTextAreaElement>('control');
const inputError = ref('');
const fieldError = computed(() => inputError.value || props.error);
watchEffect(() => control.value?.setCustomValidity(fieldError.value || ''));
let cursor = 0;
function beforeInput(event: InputEvent) {
  if (!props.money || event.isComposing) return;
  const input = event.target as HTMLInputElement;
  cursor = input.selectionStart ?? 0;
  if (event.inputType !== 'insertText' || event.data === null) return;
  const next = normalizeMoneyDraft(
    input.value.slice(0, cursor) + event.data + input.value.slice(input.selectionEnd ?? cursor),
  );
  const error = moneyDraftError(next, props.signed);
  if (error) {
    event.preventDefault();
    inputError.value = error;
  }
}
function update(event: Event) {
  const input = event.target as HTMLInputElement;
  if (props.money && (event as InputEvent).isComposing) return;
  const cleared = props.money && !input.value.trim();
  const value = props.money ? normalizeMoneyDraft(input.value) || '0' : input.value;
  const error = props.money ? moneyDraftError(value, props.signed) : '';
  if (error) {
    inputError.value = error;
    input.value = props.modelValue;
    input.setSelectionRange(cursor, cursor);
    return;
  }
  inputError.value = props.money && (!value || value === '-') ? '请输入完整金额' : '';
  if (input.value !== value) input.value = value;
  if (value !== props.modelValue) emit('update:modelValue', value);
  if (cleared) input.select();
}
function finish() {
  if (!props.money || inputError.value) return;
  if (!props.modelValue || props.modelValue === '-') {
    inputError.value = '请输入完整金额';
    return;
  }
  const value = new FinancialDecimal(props.modelValue).toFixed(2);
  if (value !== props.modelValue) emit('update:modelValue', value);
}
function focus() {
  if (props.money && ['0', '0.00'].includes(props.modelValue)) control.value?.select();
}
</script>
<template>
  <div class="field">
    <label :for="id"
      >{{ label }} <span v-if="required" class="required" aria-hidden="true">*</span></label
    >
    <textarea
      v-if="multiline"
      :id="id"
      ref="control"
      :value="modelValue"
      :disabled="disabled"
      :data-disabled-reason="disabled ? disabledReason : undefined"
      :aria-description="disabled ? disabledReason : undefined"
      :maxlength="maxlength"
      :placeholder="placeholder"
      :aria-invalid="!!fieldError"
      :aria-describedby="fieldError || hint ? `${id}-hint` : undefined"
      rows="3"
      @input="update"
    ></textarea>
    <div
      v-else
      :class="[
        'field-control',
        { 'field-control--large': large, 'field-control--error': fieldError },
      ]"
    >
      <span v-if="money" class="field-currency">¥</span>
      <input
        :id="id"
        ref="control"
        :value="modelValue"
        type="text"
        :inputmode="money ? 'decimal' : 'text'"
        :required="required"
        :disabled="disabled"
        :data-disabled-reason="disabled ? disabledReason : undefined"
        :aria-description="disabled ? disabledReason : undefined"
        :maxlength="maxlength"
        :placeholder="placeholder"
        :aria-invalid="!!fieldError"
        :aria-describedby="fieldError || hint ? `${id}-hint` : undefined"
        autocomplete="off"
        @input="update"
        @beforeinput="beforeInput"
        @compositionend="update"
        @blur="finish"
        @focus="focus"
      />
    </div>
    <p
      v-if="fieldError || hint"
      :id="`${id}-hint`"
      :class="['field-hint', { 'field-error': fieldError }]"
      :role="fieldError ? 'alert' : undefined"
    >
      {{ fieldError || hint }}
    </p>
  </div>
</template>
