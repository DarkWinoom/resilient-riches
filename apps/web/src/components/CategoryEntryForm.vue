<script setup lang="ts">
import { computed } from 'vue';
import { calculateDay, FinancialDecimal } from '@resilient-riches/core';
import type { EntryWrite } from '@resilient-riches/core';
import type { EntryDraft } from '../composables/useEntryDraft.ts';
import { amountTone, rateLabel, signedMoney } from '../utils/format.ts';
import AppField from './ui/AppField.vue';
const props = defineProps<{
  draft: EntryDraft;
  errors: Record<string, string>;
  disabled: boolean;
}>();
const emit = defineEmits<{ update: [value: EntryWrite] }>();
const preview = computed(() => {
  try {
    return calculateDay({
      ...props.draft.values,
      openingBalance: props.draft.reference.openingBalance,
      priorPnl: props.draft.reference.priorPnl ?? '0',
    });
  } catch {
    return null;
  }
});
const cumulativePnl = computed(() =>
  preview.value
    ? new FinancialDecimal(
        props.draft.reference.priorPnl ?? props.draft.reference.category.historicalPnl,
      )
        .plus(preview.value.pnl)
        .toFixed(2)
    : null,
);
function edit(key: 'closingBalance' | 'buy' | 'sell' | 'note' | 'liquidationPnl', value: string) {
  emit('update', { ...props.draft.values, [key]: value });
}
</script>
<template>
  <div class="form-stack">
    <div class="entry-reference">
      <span
        >累计盈亏金额
        <strong :class="amountTone(cumulativePnl ?? '0')">{{
          cumulativePnl === null ? '—' : signedMoney(cumulativePnl)
        }}</strong></span
      >
      <span>启用日期：{{ draft.reference.category.openingDate }}</span>
    </div>
    <AppField
      v-if="draft.values.liquidationPnl == null"
      id="entry-balance"
      label="本日核对的总金额"
      money
      large
      required
      :model-value="draft.values.closingBalance"
      :disabled="disabled"
      disabled-reason="请等待当前操作完成"
      :error="errors.closingBalance"
      @update:model-value="edit('closingBalance', $event)"
    />
    <div v-if="draft.values.liquidationPnl == null" class="form-pair">
      <AppField
        id="entry-buy"
        label="当日买入"
        money
        :model-value="draft.values.buy"
        :disabled="disabled"
        disabled-reason="请等待当前操作完成"
        :error="errors.buy"
        @update:model-value="edit('buy', $event)"
      /><AppField
        id="entry-sell"
        label="当日卖出"
        money
        :model-value="draft.values.sell"
        :disabled="disabled"
        disabled-reason="请等待当前操作完成"
        :error="errors.sell"
        @update:model-value="edit('sell', $event)"
      />
    </div>
    <AppField
      v-if="draft.values.liquidationPnl != null"
      id="entry-liquidation"
      label="本轮最终盈亏"
      money
      signed
      :model-value="draft.values.liquidationPnl"
      :disabled="disabled"
      disabled-reason="请等待当前操作完成"
      :error="errors.liquidationPnl"
      hint="填写本轮最终结算盈亏；此金额替代本轮此前累计结果，清仓后余额为零。"
      @update:model-value="edit('liquidationPnl', $event)"
    />
    <div class="entry-preview" aria-live="polite">
      <div>
        <span>当日盈亏</span
        ><strong :class="preview ? amountTone(preview.pnl) : ''">{{
          preview ? signedMoney(preview.pnl) : '—'
        }}</strong>
      </div>
      <div>
        <span>当日收益率</span
        ><strong :class="preview ? amountTone(preview.pnl) : ''">{{
          preview ? rateLabel(preview.returnRate) : '—'
        }}</strong>
      </div>
    </div>
    <AppField
      id="entry-note"
      label="备注"
      multiline
      :model-value="draft.values.note"
      :disabled="disabled"
      disabled-reason="请等待当前操作完成"
      :error="errors.note"
      @update:model-value="edit('note', $event)"
    />
  </div>
</template>
