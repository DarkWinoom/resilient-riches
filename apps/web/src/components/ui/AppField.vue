<script setup lang="ts">
withDefaults(
  defineProps<{
    id: string;
    label: string;
    modelValue: string;
    money?: boolean;
    multiline?: boolean;
    required?: boolean;
    disabled?: boolean;
    error?: string | undefined;
    hint?: string;
    placeholder?: string;
    maxlength?: number;
    large?: boolean;
  }>(),
  {
    money: false,
    multiline: false,
    required: false,
    disabled: false,
    error: '',
    hint: '',
    placeholder: '',
    maxlength: 1000,
    large: false,
  },
);
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
function update(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value);
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
      :value="modelValue"
      :disabled="disabled"
      :maxlength="maxlength"
      :placeholder="placeholder"
      :aria-invalid="!!error"
      :aria-describedby="error || hint ? `${id}-hint` : undefined"
      rows="3"
      @input="update"
    ></textarea>
    <div
      v-else
      :class="['field-control', { 'field-control--large': large, 'field-control--error': error }]"
    >
      <span v-if="money" class="field-currency">¥</span>
      <input
        :id="id"
        :value="modelValue"
        type="text"
        :inputmode="money ? 'decimal' : 'text'"
        :required="required"
        :disabled="disabled"
        :maxlength="maxlength"
        :placeholder="placeholder"
        :aria-invalid="!!error"
        :aria-describedby="error || hint ? `${id}-hint` : undefined"
        autocomplete="off"
        @input="update"
      />
    </div>
    <p v-if="error || hint" :id="`${id}-hint`" :class="['field-hint', { 'field-error': error }]">
      {{ error || hint }}
    </p>
  </div>
</template>
