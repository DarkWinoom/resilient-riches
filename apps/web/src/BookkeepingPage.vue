<script setup lang="ts">
import { computed, ref } from 'vue';
import { useDashboard } from './composables/useDashboard.ts';
import { lastEntryLabel } from './utils/format.ts';
import CategoryDrawer from './components/CategoryDrawer.vue';
import EntryDialog from './components/EntryDialog.vue';
import CategoryTable from './components/CategoryTable.vue';
import AppButton from './components/ui/AppButton.vue';
import AppIcon from './components/ui/AppIcon.vue';
import AppHeader from './components/dashboard/AppHeader.vue';
import AppFooter from './components/dashboard/AppFooter.vue';
import SummaryCards from './components/dashboard/SummaryCards.vue';
import PeriodPicker from './components/dashboard/PeriodPicker.vue';
import ReturnChart from './components/dashboard/ReturnChart.vue';
import AllocationBars from './components/dashboard/AllocationBars.vue';
import CategoryDetail from './components/dashboard/CategoryDetail.vue';
import ReportDrawer from './components/reports/ReportDrawer.vue';
const { data, period, anchor, today, loading, error, items, load, choose } = useDashboard();
const drawer = ref(false),
  reportOpen = ref(false),
  entry = ref(false),
  initialId = ref<string | null>(null),
  detailId = ref<string | null>(null),
  entryDate = ref(''),
  showArchived = ref(false),
  privateMode = ref(false);
const visible = computed(() =>
  items.value.filter((item) => showArchived.value || !item.archivedOn),
);
const label = computed(() => {
  const current = data.value?.range.to === today.value;
  return (
    current
      ? { day: '当日', week: '本周', month: '本月', year: '本年' }
      : { day: '当日', week: '当周', month: '当月', year: '当年' }
  )[data.value?.period ?? 'month'];
});
function manage(id: string | null = null) {
  detailId.value = null;
  initialId.value = id;
  drawer.value = true;
}
async function record(id: string | null = null, date?: string) {
  if (loading.value) return;
  await load();
  if (error.value || !today.value) return;
  detailId.value = null;
  initialId.value = id;
  entryDate.value = date ?? today.value;
  entry.value = true;
}
</script>
<template>
  <AppHeader
    :disabled="!today || loading"
    :has-categories="!!items.length"
    @record="record()"
    @report="reportOpen = true"
  />
  <main class="workspace dashboard-workspace">
    <div class="page-heading">
      <div class="page-title">
        <h1>我的理财概览</h1>
        <button
          class="icon-button"
          :aria-label="privateMode ? '显示金额' : '隐藏金额'"
          :aria-pressed="privateMode"
          @click="privateMode = !privateMode"
        >
          <AppIcon :name="privateMode ? 'eye-slash' : 'eye'" />
        </button>
      </div>
      <div v-if="today" class="page-date">
        <span><AppIcon name="calendar-blank" />{{ today }}</span
        ><span>{{ lastEntryLabel(data?.overview.current.lastRecordedDate ?? null, today) }}</span>
      </div>
    </div>
    <div v-if="!data" class="dashboard-initial">
      <p v-if="loading" role="status">正在读取账本…</p>
      <div v-else role="alert">
        <p>{{ error }}</p>
        <AppButton @click="load()">重新连接</AppButton>
      </div>
    </div>
    <template v-if="data"
      ><SummaryCards :overview="data.overview" :private-mode="privateMode" />
      <section class="performance-section">
        <div class="performance-heading">
          <h2>收益表现</h2>
          <PeriodPicker
            :period="period"
            :anchor="anchor"
            :today="today"
            :range="data.range"
            :disabled="loading"
            @change="choose"
          />
        </div>
        <div v-if="error" class="performance-error" role="alert">
          {{ error }}；当前仍显示 {{ data.range.from }} — {{ data.range.to }}。<button
            class="text-button"
            @click="load(false)"
          >
            重试
          </button>
        </div>
        <div class="performance-grid">
          <ReturnChart
            :points="data.curve"
            :private-mode="privateMode"
            :loading="loading"
          /><AllocationBars :categories="items" :private-mode="privateMode" />
        </div>
      </section>
      <section class="holdings-panel" :aria-busy="loading">
        <header class="panel-heading">
          <h2>
            分类持仓 <span class="count">{{ visible.length }}</span>
          </h2>
          <div class="panel-actions">
            <button
              class="switch-control"
              role="switch"
              :aria-checked="showArchived"
              @click="showArchived = !showArchived"
            >
              <span class="switch-track"></span>显示归档</button
            ><AppButton variant="quiet" @click="manage()">新增分类</AppButton>
          </div>
        </header>
        <CategoryTable
          v-if="visible.length"
          :items="visible"
          :today="today"
          :period-label="label"
          :private-mode="privateMode"
          @view="detailId = $event"
          @edit="manage"
        />
        <div v-else class="empty-state">
          <h3>{{ items.length ? '暂无使用中的分类' : '从一个分类开始记账' }}</h3>
          <AppButton variant="primary" @click="manage()"><AppIcon name="plus" />新增分类</AppButton>
        </div>
      </section></template
    ><AppFooter />
  </main>
  <ReportDrawer
    v-if="reportOpen"
    :initial-period="data?.period ?? period"
    :initial-anchor="data?.anchor ?? today"
    :today="today"
    :private-mode="privateMode"
    @close="reportOpen = false"
  />
  <CategoryDrawer
    v-if="drawer"
    :items="items"
    :today="today"
    :initial-id="initialId"
    @close="drawer = false"
    @changed="load()"
  /><EntryDialog
    v-if="entry"
    :today="today"
    :initial-id="initialId"
    :initial-date="entryDate"
    @close="entry = false"
    @changed="load()"
  /><CategoryDetail
    v-if="detailId && data"
    :id="detailId"
    :period="data.period"
    :anchor="data.anchor"
    :today="today"
    :private-mode="privateMode"
    @close="detailId = null"
    @record="record"
  />
</template>
