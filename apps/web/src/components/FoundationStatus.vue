<script setup lang="ts">
import { computed } from 'vue';
import type { HealthState } from '../composables/useHealth.ts';

const props = defineProps<{ state: HealthState }>();
defineEmits<{ retry: [] }>();
const message = computed(
  () =>
    ({ loading: '正在连接服务', ready: '应用基础已就绪', error: '暂时无法连接服务' })[props.state],
);
</script>

<template>
  <section class="status-panel" aria-live="polite">
    <span class="status-label">连接状态</span>
    <h2>{{ message }}</h2>
    <p v-if="state === 'ready'">前端、服务和本地数据库已连接。记账界面将在后续阶段接入。</p>
    <p v-else-if="state === 'loading'">请稍候。</p>
    <p v-else>请确认服务已启动，然后重试。</p>
    <button v-if="state === 'error'" class="retry-button" @click="$emit('retry')">重新连接</button>
  </section>
</template>
