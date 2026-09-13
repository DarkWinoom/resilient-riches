<script setup lang="ts">
import { ref } from 'vue';
import type { Period } from '@resilient-riches/core';
import { useReport } from '../../composables/useReport.ts';
import { reportTitles } from '../../utils/share-model.ts';
import {
  amountTone,
  moneyLabel,
  signedMoney,
  rateLabel,
  lastEntryLabel,
} from '../../utils/format.ts';
import BaseOverlay from '../ui/BaseOverlay.vue';
import AppButton from '../ui/AppButton.vue';
import AppIcon from '../ui/AppIcon.vue';
import PeriodPicker from '../dashboard/PeriodPicker.vue';
import ReturnChart from '../dashboard/ReturnChart.vue';
import ShareDialog from './ShareDialog.vue';
const props = defineProps<{
  initialPeriod: Period;
  initialAnchor: string;
  today: string;
  privateMode: boolean;
}>();
defineEmits<{ close: [] }>();
const { period, anchor, data, loading, error, load, choose } = useReport(
  props.initialPeriod,
  props.initialAnchor,
);
const sharing = ref(false);
</script>
<template>
  <BaseOverlay title="收益报表" kind="drawer" class="report-drawer" @request-close="$emit('close')"
    ><div class="report-body">
      <PeriodPicker
        :period="period"
        :anchor="anchor"
        :today="data?.today ?? today"
        :range="data?.range ?? { from: initialAnchor, to: initialAnchor }"
        :disabled="loading"
        @change="choose"
      />
      <div v-if="error" class="error-banner" role="alert">
        {{ error
        }}<span v-if="data">，当前仍显示 {{ data.range.from }} — {{ data.range.to }}。</span
        ><AppButton variant="quiet" @click="load">重试</AppButton>
      </div>
      <p v-if="loading && !data" role="status">正在生成报表…</p>
      <template v-if="data"
        ><div class="report-title">
          <div>
            <span class="report-eyebrow">RESILIENT RICHES</span>
            <h2>{{ reportTitles[data.period] }}</h2>
          </div>
          <span class="muted">{{
            data.current ? `截至 ${data.range.to}` : `${data.range.from} — ${data.range.to}`
          }}</span>
        </div>
        <div class="report-metrics">
          <div>
            <span>本期收益</span
            ><strong :class="amountTone(data.summary.periodPnl)">{{
              privateMode ? '••••••' : signedMoney(data.summary.periodPnl)
            }}</strong>
          </div>
          <div>
            <span>复利收益率</span
            ><strong :class="amountTone(data.summary.returnRate ?? '0')">{{
              rateLabel(data.summary.returnRate)
            }}</strong>
          </div>
          <div>
            <span>期末资产</span
            ><strong>{{ privateMode ? '••••••' : moneyLabel(data.summary.closingBalance) }}</strong>
          </div>
        </div>
        <div class="report-recency">
          {{ lastEntryLabel(data.summary.lastRecordedDate, data.today) }}
        </div>
        <section class="report-commentary" aria-label="收益简评">
          <h3><AppIcon name="note-pencil" />本期简评</h3>
          <p v-for="(line, index) in data.commentary" :key="index">{{ line }}</p>
        </section>
        <ReturnChart :points="data.curve" :private-mode="privateMode" :loading="loading" />
        <section class="report-categories">
          <div class="section-heading">
            <h3>分类收益</h3>
            <span class="muted">{{ data.categories.length }} 个分类</span>
          </div>
          <div v-if="!data.categories.length" class="chart-empty">本期暂无分类</div>
          <table v-else>
            <thead>
              <tr>
                <th>分类</th>
                <th>收益</th>
                <th>收益率</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="category in data.categories" :key="category.id">
                <td>
                  <span class="color-dot" :style="{ background: category.color }"></span
                  >{{ category.name }}
                </td>
                <td :class="amountTone(category.pnl)">
                  {{ privateMode ? '••••' : signedMoney(category.pnl) }}
                </td>
                <td :class="amountTone(category.returnRate ?? '0')">
                  {{ rateLabel(category.returnRate) }}
                </td>
              </tr>
            </tbody>
          </table>
        </section></template
      >
    </div>
    <footer class="overlay-footer">
      <AppButton @click="$emit('close')">关闭</AppButton
      ><AppButton
        variant="primary"
        :disabled="!data || !data.recordCount || loading || !!error"
        :title="data && !data.recordCount ? '本期没有录入记录，暂不能分享' : ''"
        @click="sharing = true"
        ><AppIcon name="export" />分享收益</AppButton
      >
    </footer></BaseOverlay
  ><ShareDialog
    v-if="sharing && data && data.recordCount > 0"
    :report="data"
    :initial-private="privateMode"
    @close="sharing = false"
  />
</template>
