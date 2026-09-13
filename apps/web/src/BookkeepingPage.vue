<script setup lang="ts">
import { computed, ref } from 'vue';
import { useCategories } from './composables/useCategories.ts';
import { lastEntryLabel } from './utils/format.ts';
import CategoryDrawer from './components/CategoryDrawer.vue';
import EntryDialog from './components/EntryDialog.vue';
import CategoryTable from './components/CategoryTable.vue';
import AppButton from './components/ui/AppButton.vue';
import AppIcon from './components/ui/AppIcon.vue';
const { items, today, loading, error, load } = useCategories();
const drawer = ref(false),
  entry = ref(false),
  initialId = ref<string | null>(null),
  showArchived = ref(false);
const visible = computed(() =>
  items.value.filter((item) => showArchived.value || !item.archivedOn),
);
const latest = computed(
  () =>
    items.value
      .map((item) => item.lastRecordedDate)
      .filter((value): value is string => !!value)
      .sort()
      .at(-1) ?? null,
);
function manage(id: string | null = null) {
  initialId.value = id;
  drawer.value = true;
}
async function record(id: string | null = null) {
  if (loading.value) return;
  await load();
  if (error.value || !today.value) return;
  initialId.value = id;
  entry.value = true;
}
</script>
<template>
  <header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="/" aria-label="稳健生财首页"
        ><span class="brand-mark"><AppIcon name="chart-bar" /></span
        ><span><strong>稳健生财</strong><span class="brand-en">RESILIENT RICHES</span></span></a
      >
      <nav class="topbar-actions" aria-label="记账操作">
        <AppButton data-overlay-fallback variant="quiet" :disabled="!today" @click="manage()"
          ><AppIcon name="squares-four" />分类管理</AppButton
        ><AppButton variant="primary" :disabled="!today || !items.length" @click="record()"
          ><AppIcon name="plus" />记录今日</AppButton
        >
      </nav>
    </div>
  </header>
  <main class="workspace">
    <div class="page-heading">
      <h1>我的理财概览</h1>
      <div v-if="today" class="page-date">
        <span><AppIcon name="calendar-blank" />{{ today }}</span
        ><span>{{ lastEntryLabel(latest, today) }}</span>
      </div>
    </div>
    <section class="holdings-panel">
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
          ><AppButton variant="quiet" :disabled="!today" @click="manage()"
            >管理分类<AppIcon name="caret-right"
          /></AppButton>
        </div>
      </header>
      <div v-if="error" class="empty-state" role="alert">
        <h3>暂时无法读取账本</h3>
        <p>{{ error }}</p>
        <AppButton @click="load">重新连接</AppButton>
      </div>
      <div v-else-if="loading && !items.length" class="empty-state" role="status">
        正在读取账本…
      </div>
      <CategoryTable
        v-else-if="visible.length"
        :items="visible"
        :today="today"
        @edit="manage"
        @record="record"
      />
      <div v-else class="empty-state">
        <span class="empty-icon"><AppIcon name="wallet" /></span>
        <h3>{{ items.length ? '暂无使用中的分类' : '从一个分类开始记账' }}</h3>
        <p>
          {{
            items.length
              ? '可显示归档分类，或创建新的分类。'
              : '按自己的习惯分类，记录资金与每次收益变化。'
          }}
        </p>
        <AppButton variant="primary" :disabled="!today" @click="manage()"
          ><AppIcon name="plus" />新增分类</AppButton
        >
      </div>
    </section>
    <footer class="site-footer">
      <a href="https://github.com/DarkWinoom" target="_blank" rel="noopener noreferrer"
        ><span class="footer-emblem"><AppIcon name="chart-line-up" /></span
        ><span>Resilient Riches @2026 by <strong>DarkWinoom</strong></span></a
      >
      <div>
        <a
          href="https://github.com/DarkWinoom/resilient-riches/blob/main/LICENSE"
          target="_blank"
          rel="noopener noreferrer"
          >MIT License</a
        ><span class="footer-divider"></span
        ><a
          href="https://github.com/DarkWinoom/resilient-riches"
          target="_blank"
          rel="noopener noreferrer"
          ><AppIcon name="github-logo" />GitHub<AppIcon name="arrow-up-right"
        /></a>
      </div>
    </footer>
  </main>
  <CategoryDrawer
    v-if="drawer"
    :items="items"
    :today="today"
    :initial-id="initialId"
    @close="drawer = false"
    @changed="load"
  /><EntryDialog
    v-if="entry"
    :today="today"
    :initial-id="initialId"
    @close="entry = false"
    @changed="load"
  />
</template>
