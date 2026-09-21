<script setup lang="ts">
import type { CategoryView } from '@resilient-riches/core';
import RecordMenu from './RecordMenu.vue';
import AppButton from '../ui/AppButton.vue';
import AppIcon from '../ui/AppIcon.vue';
withDefaults(defineProps<{ disabled: boolean; categories?: readonly CategoryView[] }>(), {
  categories: () => [],
});
defineEmits<{ record: [id?: string]; report: []; create: [] }>();
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
        ><AppButton class="category-create" :disabled="disabled" @click="$emit('create')"
          ><AppIcon name="folder-plus" />新增分类</AppButton
        >
        <RecordMenu
          :categories="categories"
          :disabled="disabled"
          @record="$emit('record', $event)"
        />
      </nav>
    </div>
  </header>
</template>
