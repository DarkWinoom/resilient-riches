<script setup lang="ts">
import { computed } from 'vue';
import { calculateDay } from '@resilient-riches/core';
import type { EntryWrite } from '@resilient-riches/core';
import type { EntryDraft } from '../composables/useEntryDraft.ts';
import { amountTone, moneyLabel, rateLabel, signedMoney } from '../utils/format.ts';
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
    });
  } catch {
    return null;
  }
});
function edit(key: 'closingBalance' | 'buy' | 'sell' | 'note', value: string) {
  emit('update', { ...props.draft.values, [key]: value });
}
</script>
<template>
  <div class="form-stack">
    <div class="entry-reference">
      <span
        >核对前金额 <strong>¥ {{ moneyLabel(draft.reference.openingBalance) }}</strong></span
      ><span>{{
        draft.reference.previousRecordedDate
          ? `上次录入：${draft.reference.previousRecordedDate}`
          : '尚无更早记录'
      }}</span>
    </div>
    <AppField
      id="entry-balance"
      label="本日核对的总金额"
      money
      large
      required
      :model-value="draft.values.closingBalance"
      :disabled="disabled"
      :error="errors.closingBalance"
      @update:model-value="edit('closingBalance', $event)"
    />
    <div class="form-pair">
      <AppField
        id="entry-buy"
        label="当日买入"
        money
        :model-value="draft.values.buy"
        :disabled="disabled"
        :error="errors.buy"
        @update:model-value="edit('buy', $event)"
      /><AppField
        id="entry-sell"
        label="当日卖出"
        money
        :model-value="draft.values.sell"
        :disabled="disabled"
        :error="errors.sell"
        @update:model-value="edit('sell', $event)"
      />
    </div>
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
      :error="errors.note"
      @update:model-value="edit('note', $event)"
    />
  </div>
</template>
