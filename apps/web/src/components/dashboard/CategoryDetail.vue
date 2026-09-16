<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { periodRange } from '@resilient-riches/core';
import type { CategoryDetailResponse, Period } from '@resilient-riches/core';
import { api, errorMessage } from '../../api.ts';
import {
  amountTone,
  moneyLabel,
  signedMoney,
  rateLabel,
  lastEntryLabel,
} from '../../utils/format.ts';
import LoadingIndicator from '../ui/LoadingIndicator.vue';
import BaseOverlay from '../ui/BaseOverlay.vue';
import AppButton from '../ui/AppButton.vue';
import PeriodPicker from './PeriodPicker.vue';
import ReturnChart from './ReturnChart.vue';
const props = defineProps<{
  id: string;
  today: string;
  privateMode: boolean;
}>();
defineEmits<{ close: []; record: [id: string, date: string] }>();
const period = ref<Period>('year');
const anchor = ref(props.today);
const displayedPeriod = ref<Period>('year');
const range = computed(() => periodRange(period.value, anchor.value, props.today));
async function choose(value: Period, date: string) {
  period.value = value;
  anchor.value = date;
  await load();
}
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
    const result = await api.detail(props.id, period.value, anchor.value, request.signal);
    if (!request.signal.aborted) {
      data.value = result;
      displayedPeriod.value = period.value;
    }
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
    ><div class="drawer-body loading-region" :aria-busy="loading">
      <LoadingIndicator v-if="loading" label="正在读取分类" />
      <div v-if="error" class="error-banner" role="alert">
        {{ error }}<AppButton @click="load">重试</AppButton>
      </div>
      <div class="detail-period">
        <PeriodPicker
          :period="period"
          :anchor="anchor"
          :today="today"
          :range="range"
          :disabled="loading"
          reverse
          @change="choose"
        />
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
        <p class="muted">{{ data.range.from }} — {{ data.range.to }}</p>
        <div v-if="displayedPeriod === 'month' || displayedPeriod === 'year'" class="detail-chart">
          <ReturnChart :points="data.curve" :private-mode="privateMode" :loading="loading" />
        </div>
        <div v-else class="detail-daily">
          <h3>每日盈亏</h3>
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th class="numeric">盈亏金额</th>
                <th class="numeric">收益率</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="day in data.days" :key="day.date">
                <td>
                  {{ day.date
                  }}<span class="muted daily-source">{{
                    day.source === 'recorded'
                      ? '已记录'
                      : day.source === 'archived'
                        ? '已清仓'
                        : '无变动'
                  }}</span>
                </td>
                <td class="numeric" :class="amountTone(day.pnl)">
                  {{ privateMode ? '••••' : signedMoney(day.pnl) }}
                </td>
                <td class="numeric" :class="amountTone(day.returnRate ?? '0')">
                  {{ rateLabel(day.returnRate) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div></template
      >
    </div>
    <footer class="overlay-footer">
      <AppButton @click="$emit('close')">关闭</AppButton
      ><AppButton
        variant="primary"
        :disabled="!data || !!data.category.archivedOn"
        :disabled-reason="
          !data ? '分类信息尚未加载，请等待或重试' : '分类已清仓，请重新激活后记录今天'
        "
        @click="$emit('record', id, today)"
        >记录盈亏</AppButton
      >
    </footer></BaseOverlay
  >
</template>
