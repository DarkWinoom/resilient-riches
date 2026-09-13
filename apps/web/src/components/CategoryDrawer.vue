<script setup lang="ts">
import { ref, watch } from 'vue';
import type { CategoryValues, CategoryView } from '@resilient-riches/core';
import { api, errorMessage, RequestError } from '../api.ts';
import { useConfirm } from '../composables/useConfirm.ts';
import { categoryErrors } from '../utils/forms.ts';
import CategoryForm from './CategoryForm.vue';
import AppButton from './ui/AppButton.vue';
import AppIcon from './ui/AppIcon.vue';
import BaseOverlay from './ui/BaseOverlay.vue';
import ConfirmDialog from './ui/ConfirmDialog.vue';
const props = defineProps<{
  items: readonly CategoryView[];
  today: string;
  initialId: string | null;
}>();
const emit = defineEmits<{ close: []; changed: [] }>();
const { pending, ask, finish } = useConfirm();
const items = ref<CategoryView[]>([...props.items]);
const selected = ref<CategoryView | null>(null);
const empty = (): CategoryValues => ({
  name: '',
  color: '#b69a60',
  openingDate: props.today,
  openingBalance: '0.00',
  historicalPnl: '0.00',
  note: '',
});
const values = ref<CategoryValues>(empty());
const dirty = ref(false),
  touched = ref(false),
  busy = ref(false),
  error = ref(''),
  message = ref('');
const errors = ref<Record<string, string>>({});
function select(item: CategoryView | null) {
  selected.value = item;
  values.value = item
    ? {
        name: item.name,
        color: item.color,
        openingDate: item.openingDate,
        openingBalance: item.openingBalance,
        historicalPnl: item.historicalPnl,
        note: item.note,
      }
    : empty();
  dirty.value = false;
  error.value = '';
  errors.value = {};
  message.value = '';
}
select(items.value.find((item) => item.id === props.initialId) ?? null);
watch(
  () => props.items,
  (value) => {
    items.value = [...value];
  },
);
async function choose(item: CategoryView | null) {
  if (busy.value) return;
  if (
    dirty.value &&
    !(await ask({
      title: '放弃当前修改？',
      description: '切换分类会清除当前未保存的内容。',
      action: '放弃修改',
      danger: true,
    }))
  )
    return;
  select(item);
}
function edit(value: CategoryValues) {
  values.value = value;
  dirty.value = true;
  touched.value = true;
  errors.value = {};
  message.value = '';
}
async function close() {
  if (busy.value) return;
  if (
    touched.value &&
    !(await ask({
      title: '关闭分类管理？',
      description: dirty.value ? '未保存的修改将被放弃。' : '本次保存已生效，可以关闭分类管理。',
      action: dirty.value ? '放弃并关闭' : '关闭',
      danger: dirty.value,
    }))
  )
    return;
  emit('close');
}
function failed(failure: unknown) {
  error.value = errorMessage(failure);
  if (failure instanceof RequestError) errors.value = failure.fields;
}
function replace(item: CategoryView) {
  const index = items.value.findIndex((value) => value.id === item.id);
  if (index < 0) items.value.push(item);
  else items.value[index] = item;
  select(item);
  emit('changed');
}
async function save() {
  errors.value = categoryErrors(values.value, props.today);
  if (Object.keys(errors.value).length) return;
  busy.value = true;
  error.value = '';
  try {
    const item = selected.value
      ? await api.updateCategory(selected.value.id, {
          ...values.value,
          revision: selected.value.revision,
        })
      : await api.createCategory(values.value);
    replace(item);
    touched.value = true;
    message.value = '分类已保存';
  } catch (failure) {
    failed(failure);
  } finally {
    busy.value = false;
  }
}
async function move(index: number, delta: number) {
  const copy = [...items.value];
  const other = copy[index + delta],
    current = copy[index];
  if (!other || !current || busy.value) return;
  copy[index] = other;
  copy[index + delta] = current;
  busy.value = true;
  error.value = '';
  try {
    const result = await api.reorder(
      copy.map((item) => ({ id: item.id, revision: item.revision })),
    );
    items.value = result.items;
    if (selected.value)
      selected.value = result.items.find((item) => item.id === selected.value?.id) ?? null;
    emit('changed');
  } catch (failure) {
    failed(failure);
  } finally {
    busy.value = false;
  }
}
async function archive() {
  const item = selected.value;
  if (!item || busy.value) return;
  if (dirty.value) {
    error.value = '请先保存当前修改，再归档或恢复。';
    return;
  }
  if (
    !(await ask({
      title: item.archivedOn ? '恢复分类？' : '归档分类？',
      description: item.archivedOn
        ? '恢复后可继续录入，原有记录仍然保留。'
        : '仅余额为零的分类可归档，历史记录仍然保留。',
      action: item.archivedOn ? '恢复分类' : '归档分类',
    }))
  )
    return;
  busy.value = true;
  try {
    replace(
      await api.updateCategory(item.id, {
        revision: item.revision,
        archivedOn: item.archivedOn ? null : props.today,
      }),
    );
  } catch (failure) {
    failed(failure);
  } finally {
    busy.value = false;
  }
}
async function remove() {
  const item = selected.value;
  if (!item || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const impact = await api.deletionImpact(item.id);
    if (
      !(await ask({
        title: `删除“${impact.category.name}”？`,
        description: `将永久删除此分类及其 ${impact.entryCount} 条记录${impact.firstDate ? `（${impact.firstDate} 至 ${impact.lastDate}）` : ''}。此操作无法撤销。`,
        action: '删除分类和记录',
        danger: true,
      }))
    )
      return;
    await api.deleteCategory(item.id, impact.category.revision);
    items.value = items.value.filter((value) => value.id !== item.id);
    select(null);
    emit('changed');
  } catch (failure) {
    failed(failure);
  } finally {
    busy.value = false;
  }
}
async function reload() {
  if (
    dirty.value &&
    !(await ask({
      title: '重新载入分类？',
      description: '当前未保存的修改将被清除，并读取最新数据。',
      action: '重新载入',
      danger: true,
    }))
  )
    return;
  busy.value = true;
  try {
    const result = await api.categories();
    items.value = result.items;
    select(result.items.find((item) => item.id === selected.value?.id) ?? null);
    emit('changed');
  } catch (failure) {
    failed(failure);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <BaseOverlay title="分类管理" kind="drawer" :busy="busy" @request-close="close">
    <div class="drawer-body">
      <div class="section-heading">
        <h3 class="category-count-heading">
          我的分类 <span class="count">{{ items.length }}</span>
        </h3>
        <AppButton v-if="selected" variant="quiet" :disabled="busy" @click="choose(null)"
          ><AppIcon name="plus" />新增分类</AppButton
        >
      </div>
      <div class="category-picker">
        <div
          v-for="(item, index) in items"
          :key="item.id"
          :class="['category-choice', { selected: selected?.id === item.id }]"
        >
          <button
            class="category-choice-label"
            :disabled="busy"
            :data-disabled-reason="busy ? '正在保存，请稍候再切换分类' : undefined"
            @click="choose(item)"
          >
            <span class="color-dot" :style="{ background: item.color }"></span>{{ item.name
            }}<span v-if="item.archivedOn" class="muted">已归档</span></button
          ><button
            class="icon-button"
            :aria-label="`上移${item.name}`"
            :disabled="busy || index === 0"
            :data-disabled-reason="busy ? '正在保存，请稍候' : '已经是第一个分类'"
            @click="move(index, -1)"
          >
            <AppIcon name="arrow-up" /></button
          ><button
            class="icon-button"
            :aria-label="`下移${item.name}`"
            :disabled="busy || index === items.length - 1"
            :data-disabled-reason="busy ? '正在保存，请稍候' : '已经是最后一个分类'"
            @click="move(index, 1)"
          >
            <AppIcon name="arrow-down" />
          </button>
        </div>
      </div>
      <h3>{{ selected ? '编辑分类' : '新增分类' }}</h3>
      <form id="category-form" @submit.prevent="save">
        <CategoryForm
          :model-value="values"
          :errors="errors"
          :disabled="busy"
          @update:model-value="edit"
        />
      </form>
      <div v-if="error" class="error-banner" role="alert">
        {{ error }}<AppButton variant="quiet" :disabled="busy" @click="reload">重新载入</AppButton>
      </div>
      <p v-if="message" class="success-message" role="status">{{ message }}</p>
      <div v-if="selected" class="category-maintenance">
        <AppButton :disabled="busy" @click="archive">{{
          selected.archivedOn ? '恢复分类' : '归档分类'
        }}</AppButton
        ><AppButton variant="quiet" class="danger-text" :disabled="busy" @click="remove"
          >删除分类</AppButton
        >
      </div>
    </div>
    <footer class="overlay-footer">
      <AppButton :disabled="busy" @click="close">关闭</AppButton
      ><AppButton variant="primary" type="submit" form="category-form" :loading="busy"
        >保存分类</AppButton
      >
    </footer> </BaseOverlay
  ><ConfirmDialog v-if="pending" :request="pending" @answer="finish" />
</template>
