<script setup lang="ts">
import AppButton from '../ui/AppButton.vue';
import AppIcon from '../ui/AppIcon.vue';
defineProps<{ disabled: boolean; hasCategories: boolean }>();
defineEmits<{ record: []; report: [] }>();
</script>
<template>
  <header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="/" aria-label="稳健生财首页"
        ><span class="brand-mark"><AppIcon name="chart-bar" /></span
        ><span><strong>稳健生财</strong><span class="brand-en">RESILIENT RICHES</span></span></a
      >
      <nav class="topbar-actions" aria-label="记账操作">
        <AppButton
          data-overlay-fallback
          variant="quiet"
          :disabled="disabled"
          disabled-reason="账本暂未就绪，请稍候或重试"
          @click="$emit('report')"
          ><AppIcon name="chart-bar" />收益报表</AppButton
        ><AppButton
          variant="primary"
          :disabled="disabled || !hasCategories"
          :disabled-reason="disabled ? '账本暂未就绪，请稍候或重试' : '请先在分类持仓中新增分类'"
          @click="$emit('record')"
          ><AppIcon name="plus" />记录今日</AppButton
        >
      </nav>
    </div>
  </header>
</template>
