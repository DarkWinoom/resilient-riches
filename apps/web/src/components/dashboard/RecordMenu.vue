<script setup lang="ts">
import { nextTick, ref, useTemplateRef } from 'vue';
import type { CategoryView } from '@resilient-riches/core';
import AppButton from '../ui/AppButton.vue';
import AppIcon from '../ui/AppIcon.vue';
const props = defineProps<{ categories: readonly CategoryView[]; disabled: boolean }>();
const emit = defineEmits<{ record: [id?: string] }>();
const open = ref(false);
const root = useTemplateRef<HTMLDivElement>('root');
function leave() {
  if (!root.value?.matches(':focus-within')) open.value = false;
}
function blur(event: FocusEvent) {
  if (!(event.relatedTarget instanceof Node) || !root.value?.contains(event.relatedTarget))
    open.value = false;
}
async function focusMenu() {
  if (props.disabled || !props.categories.length) return;
  open.value = true;
  await nextTick();
  root.value?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
}
function navigate(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    open.value = false;
    root.value?.querySelector('button')?.focus();
    return;
  }
  if (
    !['ArrowDown', 'ArrowUp'].includes(event.key) ||
    !(event.target instanceof HTMLElement) ||
    event.target.getAttribute('role') !== 'menuitem'
  )
    return;
  event.preventDefault();
  const items = Array.from(
    root.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
  );
  const index = items.indexOf(event.target as HTMLButtonElement);
  items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
}
function record(id?: string) {
  open.value = false;
  emit('record', id);
}
</script>
<template>
  <div
    ref="root"
    class="record-menu"
    @mouseenter="open = !disabled"
    @mouseleave="leave"
    @focusout="blur"
    @keydown="navigate"
  >
    <AppButton
      variant="primary"
      :disabled="disabled || !categories.length"
      :disabled-reason="disabled ? '账本暂未就绪，请稍候或重试' : '请先新增分类'"
      aria-haspopup="menu"
      :aria-expanded="open && categories.length > 0"
      @keydown.down.prevent="focusMenu"
      @click="record()"
      ><AppIcon name="plus" />记录盈亏</AppButton
    >
    <div
      v-if="open && !disabled && categories.length"
      class="record-dropdown"
      role="menu"
      aria-label="选择记录分类"
    >
      <button
        v-for="category in categories"
        :key="category.id"
        role="menuitem"
        @click="record(category.id)"
      >
        <span class="color-dot" :style="{ background: category.color }"></span>{{ category.name }}
      </button>
    </div>
  </div>
</template>
