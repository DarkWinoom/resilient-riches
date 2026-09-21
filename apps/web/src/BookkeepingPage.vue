<script setup lang="ts">
import { computed, ref } from 'vue';
import { useDashboard } from './composables/useDashboard.ts';
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
const { data, period, anchor, today, loading, error, items, load, choose, sorting, reorder } =
  useDashboard();
const drawer = ref(false),
  openingRecord = ref(false),
  reportOpen = ref(false),
  entry = ref(false),
  initialId = ref<string | null>(null),
  detailId = ref<string | null>(null),
  entryDate = ref(''),
  privateMode = ref(false);
const singleCategory = ref(false);
const statisticalItems = computed(() =>
  items.value.filter((item) => item.includeInStats !== false),
);
function manage(id: string | null = null) {
  detailId.value = null;
  initialId.value = id;
  drawer.value = true;
}
async function record(id: string | null = null, date?: string, single = false) {
  singleCategory.value = single;
  if (openingRecord.value) return;
  openingRecord.value = true;
  try {
    await load();
  } finally {
    openingRecord.value = false;
  }
  if (error.value || !today.value) return;
  detailId.value = null;
  initialId.value = id;
  entryDate.value = date ?? today.value;
  entry.value = true;
}
</script>
<template>
  <AppHeader
    :disabled="!data || openingRecord || sorting"
    :categories="items"
    @record="record($event ?? null, undefined, !!$event)"
    @create="manage()"
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
        <span><AppIcon name="calendar-blank" />{{ today }}</span>
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
            :disabled="loading || sorting"
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
          /><AllocationBars :categories="statisticalItems" :private-mode="privateMode" />
        </div>
      </section>
      <section class="holdings-panel" :aria-busy="loading">
        <header class="panel-heading">
          <h2>
            分类持仓 <span class="count">{{ items.length }}</span>
          </h2>
        </header>
        <CategoryTable
          v-if="items.length"
          :items="items"
          :today="today"
          :private-mode="privateMode"
          :disabled="sorting || loading"
          @view="detailId = $event"
          @reorder="reorder"
          @edit="manage"
        />
        <div v-else class="empty-state">
          <h3>从一个分类开始记账</h3>
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
    :single-category="singleCategory"
    @close="entry = false"
    @changed="load()"
  /><CategoryDetail
    v-if="detailId && data"
    :id="detailId"
    :today="today"
    :private-mode="privateMode"
    @close="detailId = null"
    @record="record"
  />
</template>
