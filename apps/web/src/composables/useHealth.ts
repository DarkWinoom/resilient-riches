import { onMounted, onUnmounted, readonly, ref } from 'vue';
import type { HealthResponse } from '@resilient-riches/core';

export type HealthState = 'loading' | 'ready' | 'error';

export function useHealth() {
  const state = ref<HealthState>('loading');
  let controller: AbortController | undefined;
  async function refresh() {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    state.value = 'loading';
    try {
      const response = await fetch('/api/v1/health', { signal: request.signal });
      const health = (await response.json()) as HealthResponse;
      if (!response.ok || health.status !== 'ok' || health.database !== 'ok')
        throw new Error('Service unavailable');
      if (!request.signal.aborted) state.value = 'ready';
    } catch {
      if (!request.signal.aborted) state.value = 'error';
    }
  }
  onMounted(refresh);
  onUnmounted(() => controller?.abort());
  return { state: readonly(state), refresh };
}
