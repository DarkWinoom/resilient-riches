<script setup lang="ts">
import AppIcon from './AppIcon.vue';
defineProps<{ label: string }>();
</script>
<template>
  <div class="loading-indicator" role="status" :aria-label="label">
    <AppIcon name="circle-notch" class="spin" />
  </div>
</template>
