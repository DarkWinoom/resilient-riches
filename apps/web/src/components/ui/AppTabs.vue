<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import AppIcon from './AppIcon.vue';
import AppField from './AppField.vue';
import BaseOverlay from './BaseOverlay.vue';
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
const container = useTemplateRef<HTMLDivElement>('container');
const selector = useTemplateRef<HTMLButtonElement>('selector');
const chooser = useTemplateRef<HTMLDivElement>('chooser');
const marker = ref({ width: '0px', transform: 'translateX(0)' });
const overflow = ref(false),
  choosing = ref(false),
  search = ref('');
const activeItem = computed(() => props.items.find((item) => item.id === props.modelValue));
const filtered = computed(() =>
  props.items.filter((item) =>
    item.label.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()),
  ),
);
let observer: ResizeObserver | undefined;
async function measure() {
  await nextTick();
  if (!root.value) return;
  overflow.value = root.value.scrollWidth > root.value.clientWidth + 1;
  const active = root.value.querySelector<HTMLButtonElement>('[aria-selected="true"]');
  if (active)
    marker.value = {
      width: `${active.offsetWidth}px`,
      transform: `translateX(${active.offsetLeft}px)`,
    };
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
  if (overflow.value) selector.value?.focus();
  else root.value?.querySelectorAll('button')[index]?.focus();
}
async function openChooser() {
  if (props.disabled) return;
  search.value = '';
  choosing.value = true;
  await nextTick();
  chooser.value?.querySelector<HTMLElement>('input, [aria-selected="true"]')?.focus();
}
function choose(id: string) {
  if (props.disabled) return;
  emit('update:modelValue', id);
  choosing.value = false;
}
function optionKey(event: KeyboardEvent) {
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  const options = Array.from(
    chooser.value?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [],
  );
  if (!options.length) return;
  event.preventDefault();
  const current = options.indexOf(event.target as HTMLButtonElement);
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? options.length - 1
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
  options[next]?.focus();
}
watch(() => [props.modelValue, props.items], measure, { deep: true });
onMounted(() => {
  void measure();
  observer = new ResizeObserver(() => {
    void measure();
  });
  if (container.value) observer.observe(container.value);
});
onUnmounted(() => observer?.disconnect());
</script>
<template>
  <div ref="container" class="category-tabs">
    <div
      ref="root"
      class="tabs"
      :class="{ 'tabs--measuring': overflow }"
      role="tablist"
      :aria-label="label"
      :aria-hidden="overflow || undefined"
      :inert="overflow"
      @keydown="key"
    >
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
        :data-disabled-reason="disabled ? '正在读取或保存记录，请稍候再切换分类' : undefined"
        @click="emit('update:modelValue', item.id)"
      >
        {{ item.label }}<span v-if="item.badge" class="tab-badge">{{ item.badge }}</span>
      </button>
      <span class="tab-marker" :style="marker" aria-hidden="true"></span>
    </div>
    <button
      v-if="overflow"
      ref="selector"
      type="button"
      class="category-selector"
      :disabled="disabled"
      :data-disabled-reason="disabled ? '正在读取或保存记录，请稍候再切换分类' : undefined"
      aria-haspopup="dialog"
      :aria-expanded="choosing"
      :aria-label="`${label}：${activeItem?.label ?? '请选择'}`"
      @click="openChooser"
      @keydown="key"
    >
      <span class="category-selector-caption">当前分类</span
      ><strong>{{ activeItem?.label ?? '请选择分类' }}</strong
      ><span v-if="activeItem?.badge" class="tab-badge">{{ activeItem.badge }}</span
      ><AppIcon name="caret-down" />
    </button>
  </div>
  <BaseOverlay
    v-if="choosing"
    :title="label"
    class="category-switcher-overlay"
    @request-close="choosing = false"
  >
    <div ref="chooser" class="category-switcher-body">
      <AppField
        v-if="items.length > 8"
        :id="`${panelId}-search`"
        v-model="search"
        label="搜索分类"
        placeholder="输入分类名称"
      />
      <div class="category-options" role="listbox" :aria-label="label" @keydown="optionKey">
        <button
          v-for="item in filtered"
          :key="item.id"
          type="button"
          role="option"
          :aria-selected="modelValue === item.id"
          :disabled="disabled"
          @click="choose(item.id)"
        >
          <span>{{ item.label }}</span
          ><span v-if="item.badge" class="tab-badge">{{ item.badge }}</span
          ><AppIcon v-if="modelValue === item.id" name="check" />
        </button>
      </div>
      <p v-if="!filtered.length" class="muted">没有匹配的分类</p>
    </div>
  </BaseOverlay>
</template>
