<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, useTemplateRef } from 'vue';
const hint = useTemplateRef<HTMLDivElement>('hint');
const message = ref(''),
  position = ref({ left: '0px', top: '0px' });
let source: Element | null = null,
  ticket = 0;
function hide() {
  ticket++;
  source = null;
  message.value = '';
  if (hint.value?.matches(':popover-open')) hint.value.hidePopover();
}
function disabledTarget(target: EventTarget | null) {
  return target instanceof Element
    ? target.closest(
        ':disabled,[aria-disabled="true"],.dp--cell-disabled,.dp--overlay-cell-disabled',
      )
    : null;
}
async function show(event: Event) {
  const target = disabledTarget(event.target);
  const reason =
    target?.getAttribute('data-disabled-reason') ||
    target?.closest('[data-disabled-default]')?.getAttribute('data-disabled-default');
  if (!target || !reason) {
    hide();
    return;
  }
  if (source === target && message.value === reason) return;
  source = target;
  message.value = reason;
  const current = ++ticket;
  await nextTick();
  if (current !== ticket || !hint.value || !target.isConnected) return;
  hint.value.showPopover();
  const bounds = target.getBoundingClientRect(),
    size = hint.value.getBoundingClientRect();
  position.value = {
    left: `${Math.max(12, Math.min(window.innerWidth - size.width - 12, bounds.left + (bounds.width - size.width) / 2))}px`,
    top: `${bounds.bottom + size.height + 16 > window.innerHeight ? Math.max(12, bounds.top - size.height - 8) : bounds.bottom + 8}px`,
  };
}
function leave(event: Event) {
  const related = (event as PointerEvent).relatedTarget;
  if (!(related instanceof Node) || !source?.contains(related)) hide();
}
function key(event: KeyboardEvent) {
  if (event.key === 'Escape') hide();
}
function focus(event: Event) {
  if (source?.matches(':hover') && !disabledTarget(event.target)) return;
  void show(event);
}
function blur() {
  if (!source?.matches(':hover')) hide();
}
onMounted(() => {
  document.addEventListener('pointerover', show, true);
  document.addEventListener('pointerdown', show, true);
  document.addEventListener('focusin', focus, true);
  document.addEventListener('pointerout', leave, true);
  document.addEventListener('focusout', blur, true);
  document.addEventListener('keydown', key, true);
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
});
onUnmounted(() => {
  hide();
  document.removeEventListener('pointerover', show, true);
  document.removeEventListener('pointerdown', show, true);
  document.removeEventListener('focusin', focus, true);
  document.removeEventListener('pointerout', leave, true);
  document.removeEventListener('focusout', blur, true);
  document.removeEventListener('keydown', key, true);
  window.removeEventListener('scroll', hide, true);
  window.removeEventListener('resize', hide);
});
</script>
<template>
  <Teleport to="body"
    ><div ref="hint" popover="manual" role="tooltip" class="disabled-action-hint" :style="position">
      {{ message }}
    </div></Teleport
  >
</template>
