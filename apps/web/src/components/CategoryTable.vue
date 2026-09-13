<script setup lang="ts">
import type { CategoryView } from '@resilient-riches/core';
import { amountTone, lastEntryLabel, moneyLabel, signedMoney } from '../utils/format.ts';
import AppIcon from './ui/AppIcon.vue';
defineProps<{ items: readonly CategoryView[]; today: string }>();
defineEmits<{ edit: [id: string]; record: [id: string] }>();
</script>
<template>
  <div class="holdings-scroll">
    <table class="holdings-table">
      <thead>
        <tr>
          <th>资产分类</th>
          <th class="numeric">当前金额</th>
          <th class="numeric">累计盈亏</th>
          <th>上次录入</th>
          <th><span class="sr-only">记录操作</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in items" :key="item.id">
          <td>
            <button class="holding-name" @click="$emit('edit', item.id)">
              <span class="holding-icon" :style="{ color: item.color }"
                ><AppIcon name="wallet" /></span
              ><span
                ><strong>{{ item.name }}</strong
                ><span v-if="item.archivedOn" class="muted holding-note">已归档</span
                ><span v-else-if="item.note" class="muted holding-note">{{ item.note }}</span></span
              >
            </button>
          </td>
          <td class="numeric" data-label="当前金额">{{ moneyLabel(item.balance) }}</td>
          <td class="numeric" data-label="累计盈亏" :class="amountTone(item.totalPnl)">
            {{ signedMoney(item.totalPnl) }}
          </td>
          <td class="muted last-recorded" data-label="上次录入">
            {{ lastEntryLabel(item.lastRecordedDate, today) }}
          </td>
          <td class="row-action">
            <button
              class="icon-button record-button"
              :aria-label="`为${item.name}记录今天`"
              :title="item.archivedOn ? '归档分类请在记录窗口中选择历史日期' : '记录今天'"
              :disabled="!!item.archivedOn"
              @click="$emit('record', item.id)"
            >
              <AppIcon name="plus" />
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
