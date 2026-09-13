<script setup lang="ts">
import type { DashboardResponse } from '@resilient-riches/core';
import { amountTone, moneyLabel, signedMoney, rateLabel } from '../../utils/format.ts';
import AppIcon from '../ui/AppIcon.vue';
defineProps<{ overview: DashboardResponse['overview']; privateMode: boolean }>();
</script>
<template>
  <section class="summary-grid" aria-label="理财金额总览">
    <article class="summary-card asset-card">
      <div class="summary-label">当前总资产 <span class="currency-badge">CNY</span></div>
      <strong class="summary-amount">{{
        privateMode ? '••••••' : `¥ ${moneyLabel(overview.current.closingBalance)}`
      }}</strong>
      <div class="summary-foot">
        累计净投入
        <span>{{ privateMode ? '••••' : `¥ ${moneyLabel(overview.current.netInvested)}` }}</span>
      </div>
      <AppIcon name="trend-up" class="summary-decoration" />
    </article>
    <article class="summary-card">
      <div class="summary-label">累计盈亏<AppIcon name="trend-up" /></div>
      <strong :class="['summary-amount', amountTone(overview.current.cumulativePnl)]">{{
        privateMode ? '••••••' : signedMoney(overview.current.cumulativePnl)
      }}</strong>
      <div class="summary-foot">
        <span :class="amountTone(overview.current.returnRate ?? '0')">{{
          rateLabel(overview.current.returnRate)
        }}</span
        ><span title="收益率为启用以来的复利收益率，不含无法推算的历史收益率">累计收益率</span>
      </div>
    </article>
    <article
      v-for="card in [
        { key: 'today' as const, label: '今日收益' },
        { key: 'month' as const, label: '本月收益' },
      ]"
      :key="card.key"
      class="summary-card"
    >
      <div class="summary-label">
        {{ card.label }}<AppIcon :name="card.key === 'today' ? 'sun' : 'calendar-blank'" />
      </div>
      <strong :class="['summary-amount', amountTone(overview[card.key].periodPnl)]">{{
        privateMode ? '••••••' : signedMoney(overview[card.key].periodPnl)
      }}</strong>
      <div class="summary-foot">
        <span :class="amountTone(overview[card.key].returnRate ?? '0')">{{
          rateLabel(overview[card.key].returnRate)
        }}</span
        ><span>{{ card.key === 'today' ? '今日收益率' : '本月收益率' }}</span>
      </div>
    </article>
  </section>
</template>
