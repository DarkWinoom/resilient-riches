<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';
import { useEntryDraft } from '../composables/useEntryDraft.ts';
import { useConfirm } from '../composables/useConfirm.ts';
import EntryCalendar from './EntryCalendar.vue';
import CategoryEntryForm from './CategoryEntryForm.vue';
import AppButton from './ui/AppButton.vue';
import AppTabs from './ui/AppTabs.vue';
import BaseOverlay from './ui/BaseOverlay.vue';
import ConfirmDialog from './ui/ConfirmDialog.vue';
const props = defineProps<{ today: string; initialId: string | null; initialDate?: string }>();
const emit = defineEmits<{ close: []; changed: [] }>();
const { pending, ask, finish } = useConfirm();
const {
  date,
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
    if (action === 'save') emit('close');
  },
  props.initialDate,
);
const form = useTemplateRef<HTMLFormElement>('form');
async function submit() {
  if (form.value && !form.value.checkValidity()) return;
  await save();
}
async function selectDate(value: string) {
  if (value === date.value || busy.value) return;
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
  <BaseOverlay title="每日记录" class="entry-overlay" :busy="busy" @request-close="close"
    ><div class="entry-layout">
      <EntryCalendar
        :month="month"
        :date="date"
        :today="today"
        :calendar="calendar"
        :loading="calendarLoading"
        :disabled="busy"
        :error="calendarError"
        @date="selectDate"
        @month="changeMonth"
        @retry="loadCalendar"
      />
      <section class="entry-content">
        <div class="section-heading">
          <h3>{{ date }}</h3>
          <span v-if="dirtyCount" class="muted">{{ dirtyCount }} 个草稿待保存</span>
        </div>
        <AppTabs
          v-model="selectedId"
          :items="tabs"
          label="选择分类"
          panel-id="entry-panel"
          :disabled="busy || loading"
        />
        <div
          id="entry-panel"
          role="tabpanel"
          :aria-labelledby="selectedId ? `entry-panel-tab-${selectedId}` : undefined"
          class="entry-panel"
        >
          <p v-if="loading" class="loading-state" role="status">读取记录中…</p>
          <form
            v-else-if="active"
            :key="`${date}-${selectedId}`"
            ref="form"
            @submit.prevent="submit"
          >
            <CategoryEntryForm :draft="active" :errors="errors" :disabled="busy" @update="edit" />
          </form>
          <div v-else-if="!error" class="empty-state">
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
        :disabled="busy || loading"
        @click="deleteRecord"
        >删除本条记录</AppButton
      ><AppButton :disabled="busy" @click="close">关闭</AppButton
      ><AppButton
        variant="primary"
        :disabled="loading || !active"
        :loading="busy"
        :disabled-reason="
          busy
            ? '正在保存，请稍候'
            : loading
              ? '正在读取记录，请稍候'
              : '该日期暂无可录入分类，请选择其它日期或新增分类'
        "
        @click="submit"
        >保存当日记录</AppButton
      >
    </footer></BaseOverlay
  ><ConfirmDialog v-if="pending" :request="pending" @answer="finish" />
</template>
