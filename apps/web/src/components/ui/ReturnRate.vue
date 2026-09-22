<script setup lang="ts">
import { computed } from 'vue';
import { amountTone, rateLabel, returnRateHint } from '../../utils/format.ts';
const props = defineProps<{
  value: string | null;
  pnl?: string;
  historicalRateIncluded?: boolean | undefined;
  privateMode?: boolean;
  as?: 'span' | 'strong' | 'b';
}>();
const hint = computed(() =>
  returnRateHint(props.pnl, props.value, props.historicalRateIncluded, props.privateMode),
);
</script>
<template>
  <component
    :is="as ?? 'span'"
    :class="amountTone(value ?? '0')"
    :data-tooltip="hint"
    :aria-description="hint"
    :tabindex="hint ? 0 : undefined"
    >{{ rateLabel(value) }}</component
  >
</template>
