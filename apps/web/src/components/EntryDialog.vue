<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';
import { useEntryDraft } from '../composables/useEntryDraft.ts';
import { useConfirm } from '../composables/useConfirm.ts';
import LoadingIndicator from './ui/LoadingIndicator.vue';
import EntryCalendar from './EntryCalendar.vue';
import CategoryEntryForm from './CategoryEntryForm.vue';
import AppButton from './ui/AppButton.vue';
import AppTabs from './ui/AppTabs.vue';
import BaseOverlay from './ui/BaseOverlay.vue';
import ConfirmDialog from './ui/ConfirmDialog.vue';
const props = defineProps<{
  today: string;
  initialId: string | null;
  initialDate?: string;
  singleCategory?: boolean;
}>();
const emit = defineEmits<{ close: []; changed: [] }>();
const { pending, ask, finish } = useConfirm();
const {
  date,
  loadedDate,
  ready,
  month,
  selectedId,
  calendar,
  drafts,
  active,
  dirtyCount,
  loading,
  calendarLoading,
  busy,
  error,
  calendarError,
  errors,
  edit,
  save,
  remove,
  reload,
  discardDrafts,
  changeDate,
  changeMonth,
  loadCalendar,
} = useEntryDraft(
  props.today,
  props.initialId,
  (action) => {
    emit('changed');
    if (action === 'save' && date.value === props.today) emit('close');
  },
  props.initialDate,
  props.singleCategory ? props.initialId : null,
);
const title = computed(() =>
  props.singleCategory && active.value
    ? `${active.value.reference.category.name}·记录盈亏`
    : '记录盈亏',
);
const form = useTemplateRef<HTMLFormElement>('form');
async function submit() {
  if (form.value && !form.value.checkValidity()) return;
  await save();
}
async function selectDate(value: string) {
  if (
    value === date.value ||
    busy.value ||
    (active.value && value < active.value.reference.category.openingDate)
  )
    return;
  if (
    dirtyCount.value &&
    !(await ask({
      title: '放弃当前日期的未保存内容？',
      description: '切换日期会放弃当前草稿；也可取消并先保存当前日期。',
      action: '放弃并切换',
      danger: true,
    }))
  )
    return;
  discardDrafts();
  await changeDate(value);
}
const tabs = computed(() =>
  drafts.value.map((item) => ({
    id: item.values.categoryId,
    label: item.reference.category.name,
    badge: item.dirty ? '未保存' : item.reference.entry ? '已录入' : '',
  })),
);
async function close() {
  if (busy.value) return;
  if (
    dirtyCount.value > 0 &&
    !(await ask({
      title: '关闭记录窗口？',
      description: `还有 ${dirtyCount.value} 个分类草稿未保存，关闭后将被放弃。`,
      action: '放弃并关闭',
      danger: true,
    }))
  )
    return;
  emit('close');
}
async function discardReload() {
  if (
    drafts.value.some((item) => item.dirty) &&
    !(await ask({
      title: '重新载入当日数据？',
      description: '当前日期的草稿将被清除，并读取最新记录。',
      action: '重新载入',
      danger: true,
    }))
  )
    return;
  await reload();
}
async function deleteRecord() {
  if (busy.value || !active.value?.reference.entry) return;
  if (
    await ask({
      title: '删除这条记录？',
      description: `将删除 ${date.value} 的“${active.value.reference.category.name}”记录，后续盈亏会重新计算。其他分类未保存的草稿将保留。`,
      action: '删除记录',
      danger: true,
    })
  )
    await remove();
}
</script>
<template>
  <BaseOverlay :title="title" class="entry-overlay" :busy="busy" @request-close="close"
    ><div class="entry-layout">
      <EntryCalendar
        :month="month"
        :date="date"
        :today="today"
        :min-date="active?.reference.category.openingDate"
        :calendar="calendar"
        :loading="calendarLoading"
        :disabled="busy || loading"
        :error="calendarError"
        @date="selectDate"
        @month="changeMonth"
        @retry="loadCalendar"
      />
      <section class="entry-content loading-region" :aria-busy="loading">
        <LoadingIndicator v-if="loading" label="正在读取记录" />
        <div class="section-heading">
          <h3>{{ date }}</h3>
          <span v-if="dirtyCount" class="muted">{{ dirtyCount }} 个草稿待保存</span>
        </div>
        <AppTabs
          v-if="!singleCategory"
          v-model="selectedId"
          :items="tabs"
          label="选择分类"
          panel-id="entry-panel"
          :disabled="busy || !ready"
        />
        <div
          id="entry-panel"
          :role="singleCategory ? undefined : 'tabpanel'"
          :aria-labelledby="
            !singleCategory && selectedId ? `entry-panel-tab-${selectedId}` : undefined
          "
          class="entry-panel"
        >
          <form
            v-if="active"
            :key="`${loadedDate}-${selectedId}`"
            ref="form"
            @submit.prevent="submit"
          >
            <CategoryEntryForm
              :draft="active"
              :errors="errors"
              :disabled="busy || !ready"
              @update="edit"
            />
          </form>
          <div v-else-if="!loading && !error" class="empty-state">
            <h3>这一天暂无可录入分类</h3>
            <p>请选择分类启用后的日期，或先新增分类。</p>
          </div>
        </div>
        <div v-if="error" class="error-banner" role="alert">
          {{ error
          }}<AppButton variant="quiet" :disabled="busy || loading" @click="discardReload"
            >重新载入</AppButton
          >
        </div>
      </section>
    </div>
    <footer class="overlay-footer">
      <AppButton
        v-if="active?.reference.entry"
        variant="quiet"
        class="danger-text footer-leading"
        :disabled="busy || !ready"
        @click="deleteRecord"
        >删除本条记录</AppButton
      ><AppButton :disabled="busy" @click="close">关闭</AppButton
      ><AppButton
        variant="primary"
        :disabled="!ready || !active || !dirtyCount"
        :loading="busy"
        :disabled-reason="
          busy
            ? '正在保存，请稍候'
            : loading
              ? '正在读取记录，请稍候'
              : !ready
                ? '所选日期尚未加载，请重新载入'
                : !active
                  ? '该日期暂无可录入分类，请选择其它日期或新增分类'
                  : '修改当日数据后即可保存'
        "
        @click="submit"
        >保存当日记录</AppButton
      >
    </footer></BaseOverlay
  ><ConfirmDialog v-if="pending" :request="pending" @answer="finish" />
</template>
