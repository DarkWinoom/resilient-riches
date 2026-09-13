<script setup lang="ts">
import { computed } from 'vue';
import { useEntryDraft } from '../composables/useEntryDraft.ts';
import { useConfirm } from '../composables/useConfirm.ts';
import EntryCalendar from './EntryCalendar.vue';
import CategoryEntryForm from './CategoryEntryForm.vue';
import AppButton from './ui/AppButton.vue';
import AppTabs from './ui/AppTabs.vue';
import BaseOverlay from './ui/BaseOverlay.vue';
import ConfirmDialog from './ui/ConfirmDialog.vue';
const props = defineProps<{ today: string; initialId: string | null }>();
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
  touched,
  error,
  calendarError,
  message,
  errors,
  edit,
  save,
  remove,
  reload,
  changeDate,
  changeMonth,
  loadCalendar,
} = useEntryDraft(props.today, props.initialId, () => emit('changed'));
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
    touched.value &&
    !(await ask({
      title: '关闭记录窗口？',
      description: dirtyCount.value
        ? `还有 ${dirtyCount.value} 个分类草稿未保存，关闭后将被放弃。`
        : '本次保存已生效，可以关闭记录窗口。',
      action: dirtyCount.value ? '放弃并关闭' : '关闭',
      danger: !!dirtyCount.value,
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
      description: '当前日期的草稿将被清除，其他日期草稿仍然保留。',
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
      description: `将删除 ${date.value} 的“${active.value.reference.category.name}”记录，后续盈亏会重新计算。`,
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
        @date="changeDate"
        @month="changeMonth"
        @retry="loadCalendar"
      />
      <section class="entry-content">
        <div class="section-heading">
          <h3>{{ date }}</h3>
          <span v-if="dirtyCount" class="muted">{{ dirtyCount }} 个草稿待保存</span>
        </div>
        <AppTabs
          v-if="tabs.length"
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
          <CategoryEntryForm
            v-else-if="active"
            :draft="active"
            :errors="errors"
            :disabled="busy"
            @update="edit"
          />
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
        <p v-if="message" class="success-message" role="status">{{ message }}</p>
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
      ><AppButton variant="primary" :disabled="loading || !active" :loading="busy" @click="save"
        >保存当日记录</AppButton
      >
    </footer></BaseOverlay
  ><ConfirmDialog v-if="pending" :request="pending" @answer="finish" />
</template>
