import { onMounted, onUnmounted, ref } from 'vue';
import type { Period, ReportResponse } from '@resilient-riches/core';
import { api, errorMessage } from '../api.ts';

export function useReport(initialPeriod: Period, initialAnchor: string) {
  const period = ref(initialPeriod),
    anchor = ref(initialAnchor),
    data = ref<ReportResponse | null>(null),
    loading = ref(true),
    error = ref('');
  let controller: AbortController | undefined;
  async function load() {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    loading.value = true;
    error.value = '';
    try {
      const result = await api.report(period.value, anchor.value, request.signal);
      if (!request.signal.aborted) data.value = result;
    } catch (failure) {
      if (!request.signal.aborted) error.value = errorMessage(failure);
    } finally {
      if (!request.signal.aborted) loading.value = false;
    }
  }
  async function choose(value: Period, date: string) {
    period.value = value;
    anchor.value = date;
    await load();
  }
  onMounted(load);
  onUnmounted(() => controller?.abort());
  return { period, anchor, data, loading, error, load, choose };
}
