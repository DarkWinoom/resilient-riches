<script setup lang="ts">
import { computed } from 'vue';
import { FinancialDecimal } from '@resilient-riches/core';
import type { DashboardCategory } from '@resilient-riches/core';
import { moneyLabel } from '../../utils/format.ts';
const props = defineProps<{ categories: readonly DashboardCategory[]; privateMode: boolean }>();
const rows = computed(() => {
  const items = props.categories
    .filter((item) => new FinancialDecimal(item.balance).gt(0))
    .toSorted((a, b) => new FinancialDecimal(b.balance).cmp(a.balance));
  const total = items.reduce((sum, item) => sum.plus(item.balance), new FinancialDecimal(0));
  return items.map((item) => ({
    ...item,
    width: new FinancialDecimal(item.balance).div(items[0]!.balance).mul(100).toNumber(),
    share: new FinancialDecimal(item.balance).div(total).mul(100).toFixed(2),
  }));
});
</script>
<template>
  <section class="allocation-panel chart-panel">
    <header class="chart-heading">
      <h2>资金分布</h2>
      <span class="muted">{{ rows.length }} 个分类</span>
    </header>
    <div
      v-if="rows.length"
      class="allocation-list"
      tabindex="0"
      role="list"
      aria-label="当前资金分布"
      :style="{ '--allocation-count': Math.min(rows.length, 4) }"
    >
      <div v-for="row in rows" :key="row.id" class="allocation-row" role="listitem">
        <div class="allocation-label">
          <span :title="row.name">{{ row.name }}</span
          ><strong>{{ row.share }}%</strong>
        </div>
        <div class="allocation-track">
          <span :style="{ width: `${row.width}%`, background: row.color }"></span>
        </div>
        <span v-if="!privateMode" class="allocation-balance">¥ {{ moneyLabel(row.balance) }}</span>
      </div>
    </div>
    <div v-else class="chart-empty">暂无持仓资金</div>
  </section>
</template>
