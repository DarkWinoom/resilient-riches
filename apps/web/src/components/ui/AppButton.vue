<script setup lang="ts">
import AppIcon from './AppIcon.vue';
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
    type?: 'button' | 'submit';
    disabled?: boolean;
    loading?: boolean;
  }>(),
  { variant: 'secondary', type: 'button', disabled: false, loading: false },
);
</script>
<template>
  <button
    :type="type"
    :class="['button', `button--${variant}`]"
    :disabled="disabled || loading"
    :aria-busy="loading"
  >
    <AppIcon v-if="loading" name="circle-notch" class="spin" /><slot />
  </button>
</template>
