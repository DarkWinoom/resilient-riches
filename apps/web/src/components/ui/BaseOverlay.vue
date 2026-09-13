<script setup lang="ts">
import { onMounted, onUnmounted, useId, useTemplateRef } from 'vue';
import AppIcon from './AppIcon.vue';
defineOptions({ inheritAttrs: false });

withDefaults(defineProps<{ title: string; kind?: 'dialog' | 'drawer'; busy?: boolean }>(), {
  kind: 'dialog',
  busy: false,
});
const emit = defineEmits<{ 'request-close': [] }>();
const dialog = useTemplateRef<HTMLDialogElement>('dialog');
const titleId = useId();
let trigger: HTMLElement | null = null;
let downOutside = false;
function outside(event: MouseEvent) {
  const bounds = dialog.value?.getBoundingClientRect();
  return (
    !!bounds &&
    (event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom)
  );
}
function pointer(event: PointerEvent) {
  downOutside = event.target === dialog.value && outside(event);
}
function click(event: MouseEvent) {
  if (downOutside && event.target === dialog.value && outside(event)) emit('request-close');
  downOutside = false;
}
onMounted(() => {
  trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dialog.value?.showModal();
});
onUnmounted(() => {
  if (dialog.value?.open) dialog.value.close();
  if (trigger?.isConnected) trigger.focus();
  else document.querySelector<HTMLElement>('[data-overlay-fallback]')?.focus();
});
</script>
<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      v-bind="$attrs"
      :class="['app-overlay', `app-overlay--${kind}`]"
      :aria-labelledby="titleId"
      @cancel.prevent="emit('request-close')"
      @pointerdown="pointer"
      @click="click"
    >
      <header class="overlay-header">
        <h2 :id="titleId">{{ title }}</h2>
        <button
          type="button"
          class="icon-button"
          :aria-label="`关闭${title}`"
          :disabled="busy"
          :data-disabled-reason="busy ? '正在保存，请稍候再关闭' : undefined"
          @click="emit('request-close')"
        >
          <AppIcon name="x" />
        </button>
      </header>
      <slot />
    </dialog>
  </Teleport>
</template>
