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
    disabled?: boolean;
    privateMode?: boolean;
  }>(),
  { privateMode: false },
);
const emit = defineEmits<{ view: [id: string]; edit: [id: string]; reorder: [ids: string[]] }>();
const dragging = ref<string | null>(null);
const targetId = ref<string | null>(null);
function drop(id: string) {
  if (!dragging.value || props.disabled) return;
  const ids = sorted.value.map((item) => item.id);
  const source = ids.indexOf(dragging.value),
    target = ids.indexOf(id);
  dragging.value = null;
  targetId.value = null;
  if (source === target || source < 0 || target < 0) return;
  ids.splice(target, 0, ids.splice(source, 1)[0]!);
  sort.value = null;
  emit('reorder', ids);
}
function pointerStart(event: PointerEvent, id: string) {
  if (props.disabled || event.button !== 0) return;
  event.preventDefault();
  dragging.value = id;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}
function pointerMove(event: PointerEvent) {
  if (!dragging.value) return;
  const row = document
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest<HTMLElement>('[data-category-id]');
  targetId.value = row?.dataset.categoryId ?? null;
}
function pointerEnd() {
  if (targetId.value) drop(targetId.value);
  dragging.value = null;
  targetId.value = null;
}
function move(id: string, delta: number) {
  const target = sorted.value[sorted.value.findIndex((item) => item.id === id) + delta];
  if (!target) return;
  dragging.value = id;
  drop(target.id);
}
type SortKey = 'balance' | 'weekPnl' | 'monthPnl' | 'totalPnl';
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
  { key: 'balance' as const, label: '总金额' },
  { key: 'weekPnl' as const, label: '本周收益' },
  { key: 'monthPnl' as const, label: '本月收益' },
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
        {{ column.label
        }}<AppIcon v-if="sort === column.key" :name="descending ? 'arrow-down' : 'arrow-up'" />
      </button>
    </div>
    <table class="holdings-table dashboard-table">
      <colgroup>
        <col class="col-drag" />
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
          <th class="drag-heading" aria-label="拖动排序"></th>
          <th>名称</th>
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
        <tr
          v-for="item in sorted"
          :key="item.id"
          :data-category-id="item.id"
          :class="{
            'holding-drop-target': targetId === item.id && dragging !== item.id,
            'holding-excluded': item.includeInStats === false,
          }"
        >
          <td class="drag-cell">
            <button
              class="drag-handle"
              :disabled="disabled"
              :draggable="false"
              :aria-label="`拖动排序：${item.name}`"
              title="拖动排序，或使用上下方向键调整"
              @pointerdown="pointerStart($event, item.id)"
              @pointermove="pointerMove"
              @pointerup="pointerEnd"
              @pointercancel="
                dragging = null;
                targetId = null;
              "
              @keydown.up.prevent="move(item.id, -1)"
              @keydown.down.prevent="move(item.id, 1)"
            >
              <AppIcon name="dots-six-vertical" />
            </button>
          </td>
          <td>
            <button class="holding-name" @click="$emit('view', item.id)">
              <span class="holding-icon" :style="{ color: item.color }"
                ><AppIcon name="wallet" /></span
              ><span
                ><strong>{{ item.name }}</strong
                ><span v-if="item.note && !privateMode" class="muted holding-note">{{
                  item.note
                }}</span></span
              >
            </button>
          </td>
          <td class="numeric" data-label="总金额">
            {{ privateMode ? '••••' : moneyLabel(item.balance) }}
          </td>
          <td class="numeric" data-label="本周收益" :class="amountTone(item.weekPnl)">
            {{ privateMode ? '••••' : signedMoney(item.weekPnl)
            }}<span class="holding-rate">{{ rateLabel(item.weekReturnRate) }}</span>
          </td>
          <td class="numeric" data-label="本月收益" :class="amountTone(item.monthPnl)">
            {{ privateMode ? '••••' : signedMoney(item.monthPnl)
            }}<span class="holding-rate">{{ rateLabel(item.monthReturnRate) }}</span>
          </td>
          <td class="numeric" data-label="累计盈亏" :class="amountTone(item.totalPnl)">
            {{ privateMode ? '••••' : signedMoney(item.totalPnl)
            }}<span class="holding-rate">{{ rateLabel(item.totalReturnRate) }}</span>
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
