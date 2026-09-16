<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue';
import type { CategoryValues, CategoryView } from '@resilient-riches/core';
import { api, errorMessage, RequestError } from '../api.ts';
import { useConfirm } from '../composables/useConfirm.ts';
import { useToast } from '../composables/useToast.ts';
import { categoryErrors } from '../utils/forms.ts';
import LiquidationDialog from './LiquidationDialog.vue';
import CategoryForm from './CategoryForm.vue';
import AppButton from './ui/AppButton.vue';
import BaseOverlay from './ui/BaseOverlay.vue';
import ConfirmDialog from './ui/ConfirmDialog.vue';
const props = defineProps<{
  items: readonly CategoryView[];
  today: string;
  initialId: string | null;
}>();
const emit = defineEmits<{ close: []; changed: [] }>();
const { pending, ask, finish } = useConfirm();
const { success } = useToast();
const liquidating = ref(false);
const previous = ref<CategoryView | null>(null);
const selected = ref(props.items.find((item) => item.id === props.initialId) ?? null);
function defaults(): CategoryValues {
  return selected.value
    ? {
        name: selected.value.name,
        color: selected.value.color,
        openingDate: selected.value.openingDate,
        openingBalance: selected.value.openingBalance,
        historicalPnl: selected.value.historicalPnl,
        note: selected.value.note,
      }
    : {
        name: '',
        color: '#b69a60',
        openingDate: props.today,
        openingBalance: '0.00',
        historicalPnl: '0.00',
        note: '',
      };
}
const initial = ref(defaults()),
  values = ref<CategoryValues>({ ...initial.value }),
  busy = ref(false),
  error = ref(''),
  errors = ref<Record<string, string>>({});
const dirty = computed(() => JSON.stringify(values.value) !== JSON.stringify(initial.value));
const form = useTemplateRef<HTMLFormElement>('form');
function edit(value: CategoryValues) {
  values.value = value;
  errors.value = {};
  error.value = '';
}
function completed() {
  emit('changed');
  emit('close');
}
async function close() {
  if (busy.value) return;
  if (
    dirty.value &&
    !(await ask({
      title: '放弃未保存的修改？',
      description: '当前修改尚未保存，关闭后将被放弃。',
      action: '放弃并关闭',
      danger: true,
    }))
  )
    return;
  emit('close');
}
function failed(failure: unknown) {
  error.value = errorMessage(failure);
  if (failure instanceof RequestError) errors.value = failure.fields;
}
async function reload() {
  if (busy.value) return;
  if (
    dirty.value &&
    !(await ask({
      title: '重新载入分类？',
      description: '将放弃未保存内容，读取最新分类信息。',
      action: '重新载入',
      danger: true,
    }))
  )
    return;
  busy.value = true;
  try {
    const latest = await api.categories();
    selected.value = latest.items.find((item) => item.id === props.initialId) ?? null;
    if (props.initialId && !selected.value) {
      completed();
      return;
    }
    initial.value = defaults();
    values.value = { ...initial.value };
    errors.value = {};
    error.value = '';
    emit('changed');
  } catch (failure) {
    failed(failure);
  } finally {
    busy.value = false;
  }
}
async function save() {
  if (busy.value) return;
  errors.value = categoryErrors(values.value, props.today);
  if (Object.keys(errors.value).length || (form.value && !form.value.checkValidity())) return;
  busy.value = true;
  error.value = '';
  try {
    if (selected.value)
      await api.updateCategory(selected.value.id, {
        ...values.value,
        revision: selected.value.revision,
      });
    else await api.createCategory(values.value);
    success(previous.value ? '分类已重新激活' : selected.value ? '分类已修改' : '分类已新增');
    completed();
  } catch (failure) {
    failed(failure);
  } finally {
    busy.value = false;
  }
}
function settlement() {
  const item = selected.value;
  if (!item || busy.value) return;
  if (dirty.value) {
    error.value = '请先保存分类修改，再进行清仓或重新激活。';
    return;
  }
  if (!item.archivedOn) {
    liquidating.value = true;
    return;
  }
  previous.value = item;
  selected.value = null;
  initial.value = {
    name: item.name,
    color: item.color,
    note: item.note,
    openingDate: props.today,
    openingBalance: '0.00',
    historicalPnl: item.totalPnl,
    previousCycleId: item.id,
  };
  values.value = { ...initial.value };
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
        description: `将永久删除此分类及其 ${impact.entryCount} 条记录${impact.firstDate ? `（${impact.firstDate} 至 ${impact.lastDate}）` : ''}，无法撤销。`,
        action: '删除分类和记录',
        danger: true,
      }))
    )
      return;
    await api.deleteCategory(item.id, impact.category.revision);
    success('分类已删除');
    completed();
  } catch (failure) {
    failed(failure);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <BaseOverlay
    :title="previous ? '重新激活分类' : selected ? '编辑分类' : '新增分类'"
    kind="drawer"
    :busy="busy"
    @request-close="close"
    ><div class="drawer-body">
      <p v-if="previous" class="detail-note">
        已将上次清仓金额填入历史盈亏，可按实际情况修改。保存后，以本次填写的初始资金、历史盈亏和启用日期重新计算。
      </p>
      <form id="category-form" ref="form" @submit.prevent="save">
        <CategoryForm
          :today="today"
          :model-value="values"
          :errors="errors"
          :disabled="busy"
          @update:model-value="edit"
        />
      </form>
      <div v-if="error" class="error-banner" role="alert">
        {{ error
        }}<AppButton v-if="selected" variant="quiet" :disabled="busy" @click="reload"
          >重新载入</AppButton
        >
      </div>
      <div v-if="selected" class="category-maintenance">
        <AppButton
          :disabled="busy || items.some((item) => item.previousCycleId === selected?.id)"
          :disabled-reason="busy ? '正在保存，请稍候' : '此轮持仓已重新激活'"
          @click="settlement"
          >{{ selected.archivedOn ? '重新激活' : '一键清仓' }}</AppButton
        ><AppButton variant="quiet" class="danger-text" :disabled="busy" @click="remove"
          >删除分类</AppButton
        >
      </div>
    </div>
    <footer class="overlay-footer">
      <AppButton :disabled="busy" @click="close">取消</AppButton
      ><AppButton variant="primary" :loading="busy" @click="save">{{
        previous ? '开始新持仓' : selected ? '保存修改' : '新增分类'
      }}</AppButton>
    </footer></BaseOverlay
  ><LiquidationDialog
    v-if="liquidating && selected"
    :category="selected"
    @close="liquidating = false"
    @saved="completed"
  /><ConfirmDialog v-if="pending" :request="pending" @answer="finish" />
</template>
