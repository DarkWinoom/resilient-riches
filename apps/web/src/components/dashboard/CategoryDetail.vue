<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import type { CategoryDetailResponse, Period } from '@resilient-riches/core';
import { api, errorMessage } from '../../api.ts';
import {
  amountTone,
  moneyLabel,
  signedMoney,
  rateLabel,
  lastEntryLabel,
} from '../../utils/format.ts';
import BaseOverlay from '../ui/BaseOverlay.vue';
import AppButton from '../ui/AppButton.vue';
const props = defineProps<{
  id: string;
  period: Period;
  anchor: string;
  today: string;
  privateMode: boolean;
}>();
defineEmits<{ close: []; edit: [id: string]; record: [id: string, date: string] }>();
const data = ref<CategoryDetailResponse | null>(null),
  error = ref(''),
  loading = ref(true);
let controller: AbortController | undefined;
async function load() {
  controller?.abort();
  const request = new AbortController();
  controller = request;
  loading.value = true;
  error.value = '';
  try {
    const result = await api.detail(props.id, props.period, props.anchor, request.signal);
    if (!request.signal.aborted) data.value = result;
  } catch (failure) {
    if (!request.signal.aborted) error.value = errorMessage(failure);
  } finally {
    if (!request.signal.aborted) loading.value = false;
  }
}
onMounted(load);
onUnmounted(() => controller?.abort());
</script>
<template>
  <BaseOverlay
    :title="data?.category.name ?? '分类详情'"
    kind="drawer"
    @request-close="$emit('close')"
    ><div class="drawer-body">
      <p v-if="loading" role="status">正在读取分类…</p>
      <div v-if="error" class="error-banner" role="alert">
        {{ error }}<AppButton @click="load">重试</AppButton>
      </div>
      <template v-if="data"
        ><div class="detail-balance">
          <span class="muted">当前金额</span
          ><strong>{{ privateMode ? '••••••' : `¥ ${moneyLabel(data.category.balance)}` }}</strong
          ><span class="muted">{{ lastEntryLabel(data.category.lastRecordedDate, today) }}</span>
        </div>
        <div class="detail-metrics">
          <div>
            <span>本期收益</span
            ><strong :class="amountTone(data.category.periodPnl)">{{
              privateMode ? '••••' : signedMoney(data.category.periodPnl)
            }}</strong>
          </div>
          <div>
            <span>本期收益率</span
            ><strong :class="amountTone(data.category.returnRate ?? '0')">{{
              rateLabel(data.category.returnRate)
            }}</strong>
          </div>
          <div>
            <span>累计盈亏</span
            ><strong :class="amountTone(data.category.totalPnl)">{{
              privateMode ? '••••' : signedMoney(data.category.totalPnl)
            }}</strong>
          </div>
          <div>
            <span>启用日期</span><strong>{{ data.category.openingDate }}</strong>
          </div>
        </div>
        <p v-if="data.category.note && !privateMode" class="detail-note">
          {{ data.category.note }}
        </p>
        <div class="section-heading">
          <h3>本期记录</h3>
          <span class="muted">{{ data.records.length }} 条</span>
        </div>
        <p class="muted">{{ data.range.from }} — {{ data.range.to }}</p>
        <div v-if="!data.records.length" class="chart-empty">本期没有录入记录</div>
        <div v-for="row in data.records" :key="row.id" class="detail-record">
          <div>
            <strong>{{ row.date }}</strong
            ><span class="muted">{{
              privateMode ? '••••' : `余额 ¥ ${moneyLabel(row.closingBalance)}`
            }}</span>
          </div>
          <div>
            <span :class="amountTone(row.pnl)">{{
              privateMode ? rateLabel(row.returnRate) : signedMoney(row.pnl)
            }}</span
            ><AppButton variant="quiet" @click="$emit('record', id, row.date)">修改记录</AppButton>
          </div>
        </div></template
      >
    </div>
    <footer class="overlay-footer">
      <AppButton :disabled="!data" @click="$emit('edit', id)">编辑分类</AppButton
      ><AppButton
        variant="primary"
        :disabled="!data || !!data.category.archivedOn"
        @click="$emit('record', id, today)"
        >记录今日</AppButton
      >
    </footer></BaseOverlay
  >
</template>
