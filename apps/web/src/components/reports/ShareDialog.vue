<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ReportResponse } from '@resilient-riches/core';
import { buildShareModel } from '../../utils/share-model.ts';
import { renderShareSvg } from '../../utils/share-svg.ts';
import { useReportExport } from '../../composables/useReportExport.ts';
import BaseOverlay from '../ui/BaseOverlay.vue';
import AppButton from '../ui/AppButton.vue';
import AppIcon from '../ui/AppIcon.vue';
const props = defineProps<{ report: ReportResponse; initialPrivate: boolean }>();
defineEmits<{ close: [] }>();
const hideAmounts = ref(props.initialPrivate),
  hideCategories = ref(false),
  actualSize = ref(false);
const model = computed(() =>
  buildShareModel(props.report, {
    hideAmounts: hideAmounts.value,
    hideCategories: hideCategories.value,
  }),
);
const rendered = computed(() => renderShareSvg(model.value));
const preview = computed(
  () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(rendered.value.svg)}`,
);
const { exporting, error, success, save } = useReportExport();
</script>
<template>
  <BaseOverlay title="分享收益" class="share-overlay" @request-close="$emit('close')"
    ><div class="share-controls">
      <div class="share-toggles">
        <button
          class="switch-control"
          role="switch"
          :aria-checked="hideAmounts"
          :disabled="exporting"
          @click="
            hideAmounts = !hideAmounts;
            success = false;
          "
        >
          <span class="switch-track"></span>隐藏金额</button
        ><button
          class="switch-control"
          role="switch"
          :aria-checked="hideCategories"
          :disabled="exporting"
          @click="
            hideCategories = !hideCategories;
            success = false;
          "
        >
          <span class="switch-track"></span>隐藏分类
        </button>
      </div>
      <button class="text-button" :aria-pressed="actualSize" @click="actualSize = !actualSize">
        {{ actualSize ? '适应窗口' : '原尺寸预览' }}
      </button>
    </div>
    <div
      :class="['share-preview', { actual: actualSize }]"
      tabindex="0"
      aria-label="收益分享图片预览"
    >
      <img
        :src="preview"
        :width="rendered.width"
        :height="rendered.height"
        alt="收益分享图片预览"
      />
    </div>
    <div v-if="error" class="share-message error-banner" role="alert">{{ error }}</div>
    <p v-else-if="success" class="share-message success-message" role="status">
      PNG 已生成，请在浏览器下载中查看。
    </p>
    <footer class="overlay-footer">
      <AppButton @click="$emit('close')">关闭</AppButton
      ><AppButton variant="primary" :loading="exporting" @click="save(model)"
        ><AppIcon name="download-simple" />保存 PNG</AppButton
      >
    </footer></BaseOverlay
  >
</template>
