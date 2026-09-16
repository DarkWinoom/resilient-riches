<script setup lang="ts">
import { ref, useTemplateRef } from 'vue';
import { parseMoney } from '@resilient-riches/core';
import type { CategoryView } from '@resilient-riches/core';
import { api, errorMessage } from '../api.ts';
import { useConfirm } from '../composables/useConfirm.ts';
import { useToast } from '../composables/useToast.ts';
import { signedMoney } from '../utils/format.ts';
import BaseOverlay from './ui/BaseOverlay.vue';
import AppField from './ui/AppField.vue';
import AppButton from './ui/AppButton.vue';
import ConfirmDialog from './ui/ConfirmDialog.vue';
const props = defineProps<{ category: CategoryView }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const pnl = ref('0'),
  busy = ref(false),
  error = ref('');
const form = useTemplateRef<HTMLFormElement>('form');
const { pending, ask, finish } = useConfirm();
const { success } = useToast();
async function close() {
  if (busy.value) return;
  if (
    pnl.value !== '0' &&
    !(await ask({
      title: '放弃清仓填写？',
      description: '尚未保存的清仓盈亏将被放弃。',
      action: '放弃并关闭',
      danger: true,
    }))
  )
    return;
  emit('close');
}
async function save() {
  if (busy.value || !form.value?.checkValidity()) return;
  try {
    parseMoney(pnl.value);
  } catch {
    error.value = '请输入有效的最终盈亏金额';
    return;
  }
  if (
    !(await ask({
      title: '确认清仓？',
      description: `将“${props.category.name}”当前金额归零，本轮最终盈亏结算为 ${signedMoney(pnl.value)} 元。此前本轮累计盈亏以此结算结果为准。`,
      action: '确认清仓',
      danger: true,
    }))
  )
    return;
  busy.value = true;
  error.value = '';
  try {
    await api.liquidate(props.category.id, props.category.revision, pnl.value);
    success('分类已清仓');
    emit('saved');
  } catch (failure) {
    error.value = errorMessage(failure);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <BaseOverlay title="一键清仓" class="confirmation-overlay" :busy="busy" @request-close="close">
    <form ref="form" class="confirmation-body form-stack" @submit.prevent="save">
      <p>清空“{{ category.name }}”的当前金额，并填写本轮最终结算盈亏。</p>
      <AppField
        id="liquidation-pnl"
        v-model="pnl"
        label="最终盈亏金额"
        money
        signed
        required
        :disabled="busy"
        hint="盈利填正数，亏损填负数。重新激活后将作为新一轮持仓计算。"
      />
      <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
      <div class="confirmation-actions">
        <AppButton :disabled="busy" @click="close">取消</AppButton
        ><AppButton variant="danger" :loading="busy" @click="save">清仓</AppButton>
      </div>
    </form>
  </BaseOverlay>
  <ConfirmDialog v-if="pending" :request="pending" @answer="finish" />
</template>
