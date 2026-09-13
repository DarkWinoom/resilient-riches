<script setup lang="ts">
import AppIcon from './AppIcon.vue';
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
    type?: 'button' | 'submit';
    disabled?: boolean;
    loading?: boolean;
    disabledReason?: string;
  }>(),
  {
    variant: 'secondary',
    type: 'button',
    disabled: false,
    loading: false,
    disabledReason: '正在处理，请稍候',
  },
);
</script>
<template>
  <button
    :type="type"
    :class="['button', `button--${variant}`]"
    :disabled="disabled || loading"
    :aria-busy="loading"
    :data-disabled-reason="disabled || loading ? disabledReason : undefined"
    :aria-description="disabled || loading ? disabledReason : undefined"
  >
    <AppIcon v-if="loading" name="circle-notch" class="spin" /><slot />
  </button>
</template>
