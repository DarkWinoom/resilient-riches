<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    items: readonly { id: string; label: string; badge?: string }[];
    modelValue: string | null;
    label: string;
    panelId: string;
    disabled?: boolean;
  }>(),
  { disabled: false },
);
const emit = defineEmits<{ 'update:modelValue': [id: string] }>();
const root = useTemplateRef<HTMLDivElement>('root');
const marker = ref({ width: '0px', transform: 'translateX(0)' });
let observer: ResizeObserver | undefined;
async function measure() {
  await nextTick();
  const active = root.value?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
  if (active)
    marker.value = {
      width: `${active.offsetWidth}px`,
      transform: `translateX(${active.offsetLeft}px)`,
    };
  if (active && root.value) {
    if (active.offsetLeft < root.value.scrollLeft) root.value.scrollLeft = active.offsetLeft;
    else if (
      active.offsetLeft + active.offsetWidth >
      root.value.scrollLeft + root.value.clientWidth
    )
      root.value.scrollLeft = active.offsetLeft + active.offsetWidth - root.value.clientWidth;
  }
}
async function key(event: KeyboardEvent) {
  if (
    props.disabled ||
    !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) ||
    !props.items.length
  )
    return;
  event.preventDefault();
  const current = props.items.findIndex((item) => item.id === props.modelValue);
  const index =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? props.items.length - 1
        : (current + (event.key === 'ArrowRight' ? 1 : -1) + props.items.length) %
          props.items.length;
  const item = props.items[index];
  if (item) emit('update:modelValue', item.id);
  await nextTick();
  root.value?.querySelectorAll('button')[index]?.focus();
}
watch(() => [props.modelValue, props.items], measure, { deep: true });
onMounted(() => {
  void measure();
  observer = new ResizeObserver(() => {
    void measure();
  });
  if (root.value) observer.observe(root.value);
});
onUnmounted(() => observer?.disconnect());
</script>
<template>
  <div ref="root" class="tabs" role="tablist" :aria-label="label" @keydown="key">
    <button
      v-for="item in items"
      :id="`${panelId}-tab-${item.id}`"
      :key="item.id"
      type="button"
      role="tab"
      :aria-selected="modelValue === item.id"
      :aria-controls="panelId"
      :tabindex="modelValue === item.id ? 0 : -1"
      :disabled="disabled"
      @click="emit('update:modelValue', item.id)"
    >
      {{ item.label }}<span v-if="item.badge" class="tab-badge">{{ item.badge }}</span>
    </button>
    <span class="tab-marker" :style="marker" aria-hidden="true"></span>
  </div>
</template>
