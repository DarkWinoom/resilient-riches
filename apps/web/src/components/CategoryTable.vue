<script setup lang="ts">
import { computed, ref } from 'vue';
import { FinancialDecimal } from '@resilient-riches/core';
import type { DashboardCategory } from '@resilient-riches/core';
import {
  amountTone,
  recordingDateLabel,
  moneyLabel,
  signedMoney,
  rateLabel,
} from '../utils/format.ts';
import AppIcon from './ui/AppIcon.vue';
const props = withDefaults(
  defineProps<{
    items: readonly DashboardCategory[];
    today: string;
    periodLabel?: string;
    privateMode?: boolean;
  }>(),
  { periodLabel: '本期', privateMode: false },
);
defineEmits<{ view: [id: string]; edit: [id: string] }>();
type SortKey = 'balance' | 'periodPnl' | 'returnRate' | 'totalPnl';
const sort = ref<SortKey | null>(null),
  descending = ref(true);
const sorted = computed(() => {
  if (!sort.value) return props.items;
  const key = sort.value;
  return [...props.items].sort((a, b) => {
    if (a[key] === null) return b[key] === null ? 0 : 1;
    if (b[key] === null) return -1;
    const cmp = new FinancialDecimal(a[key]!).cmp(b[key]!);
    return descending.value ? -cmp : cmp;
  });
});
const columns = computed(() => [
  { key: 'balance' as const, label: '当前金额' },
  { key: 'periodPnl' as const, label: `${props.periodLabel}收益` },
  { key: 'returnRate' as const, label: `${props.periodLabel}收益率` },
  { key: 'totalPnl' as const, label: '累计盈亏' },
]);
function order(key: SortKey) {
  if (sort.value !== key) {
    sort.value = key;
    descending.value = true;
  } else if (descending.value) descending.value = false;
  else sort.value = null;
}
</script>
<template>
  <div class="holdings-scroll">
    <div class="mobile-sort" role="group" aria-label="持仓排序">
      <button
        v-for="column in columns"
        :key="column.key"
        :aria-pressed="sort === column.key"
        @click="order(column.key)"
      >
        {{
          column.key === 'balance'
            ? '金额'
            : column.key === 'periodPnl'
              ? '收益'
              : column.key === 'returnRate'
                ? '收益率'
                : '累计盈亏'
        }}<AppIcon v-if="sort === column.key" :name="descending ? 'arrow-down' : 'arrow-up'" />
      </button>
    </div>
    <table class="holdings-table dashboard-table">
      <colgroup>
        <col class="col-name" />
        <col />
        <col />
        <col class="col-rate" />
        <col />
        <col class="col-date" />
        <col class="col-action" />
      </colgroup>
      <thead>
        <tr>
          <th>资产分类</th>
          <th
            v-for="column in columns"
            :key="column.key"
            class="numeric"
            :aria-sort="sort === column.key ? (descending ? 'descending' : 'ascending') : 'none'"
          >
            <button class="sort-button" @click="order(column.key)">
              {{ column.label
              }}<AppIcon
                :name="
                  sort === column.key ? (descending ? 'arrow-down' : 'arrow-up') : 'arrows-down-up'
                "
              />
            </button>
          </th>
          <th class="numeric">上次录入</th>
          <th class="action-heading">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in sorted" :key="item.id">
          <td>
            <button class="holding-name" @click="$emit('view', item.id)">
              <span class="holding-icon" :style="{ color: item.color }"
                ><AppIcon name="wallet" /></span
              ><span
                ><strong>{{ item.name }}</strong
                ><span v-if="item.archivedOn" class="muted holding-note">已归档</span
                ><span v-else-if="item.note && !privateMode" class="muted holding-note">{{
                  item.note
                }}</span></span
              >
            </button>
          </td>
          <td class="numeric" data-label="当前金额">
            {{ privateMode ? '••••' : moneyLabel(item.balance) }}
          </td>
          <td
            class="numeric"
            :data-label="`${periodLabel}收益`"
            :class="amountTone(item.periodPnl)"
          >
            {{ privateMode ? '••••' : signedMoney(item.periodPnl) }}
          </td>
          <td
            class="numeric"
            :data-label="`${periodLabel}收益率`"
            :class="amountTone(item.returnRate ?? '0')"
          >
            {{ rateLabel(item.returnRate) }}
          </td>
          <td class="numeric" data-label="累计盈亏" :class="amountTone(item.totalPnl)">
            {{ privateMode ? '••••' : signedMoney(item.totalPnl) }}
          </td>
          <td
            class="muted last-recorded numeric"
            data-label="上次录入"
            :title="item.lastRecordedDate ?? '尚无录入'"
          >
            {{ recordingDateLabel(item.lastRecordedDate, today) }}
          </td>
          <td class="row-action">
            <div class="table-actions">
              <button
                class="table-action"
                :aria-label="`查看${item.name}`"
                @click="$emit('view', item.id)"
              >
                查看</button
              ><button
                class="table-action"
                :aria-label="`编辑${item.name}`"
                @click="$emit('edit', item.id)"
              >
                编辑
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
