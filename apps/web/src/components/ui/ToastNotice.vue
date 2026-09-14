<script setup lang="ts">
import { nextTick, onUnmounted, useTemplateRef, watch } from 'vue';
import { useToast } from '../../composables/useToast.ts';
import AppIcon from './AppIcon.vue';
const { notice, dismiss } = useToast();
const popup = useTemplateRef<HTMLDivElement>('popup');
let timer: ReturnType<typeof setTimeout> | undefined;
watch(notice, async (value) => {
  clearTimeout(timer);
  await nextTick();
  if (!value.text) {
    if (popup.value?.matches(':popover-open')) popup.value.hidePopover();
    return;
  }
  popup.value?.showPopover();
  timer = setTimeout(dismiss, 2800);
});
onUnmounted(() => clearTimeout(timer));
</script>
<template>
  <div ref="popup" popover="manual" class="toast-notice" role="status" aria-live="polite">
    <AppIcon name="check" />{{ notice.text }}
  </div>
</template>
