<script setup lang="ts">
import type { Confirmation } from '../../composables/useConfirm.ts';
import BaseOverlay from './BaseOverlay.vue';
import AppButton from './AppButton.vue';
defineProps<{ request: Confirmation }>();
defineEmits<{ answer: [value: boolean] }>();
</script>
<template>
  <BaseOverlay
    :title="request.title"
    class="confirmation-overlay"
    @request-close="$emit('answer', false)"
  >
    <div class="confirmation-body">
      <p>{{ request.description }}</p>
      <div class="confirmation-actions">
        <AppButton autofocus @click="$emit('answer', false)">取消</AppButton
        ><AppButton
          :variant="request.danger ? 'danger' : 'primary'"
          @click="$emit('answer', true)"
          >{{ request.action }}</AppButton
        >
      </div>
    </div>
  </BaseOverlay>
</template>
