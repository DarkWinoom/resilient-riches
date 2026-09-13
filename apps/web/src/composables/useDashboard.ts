import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { DashboardResponse, Period } from '@resilient-riches/core';
import { api, errorMessage } from '../api.ts';

export function useDashboard() {
  const data = ref<DashboardResponse | null>(null);
  const period = ref<Period>('month'),
    anchor = ref(''),
    today = ref('');
  const loading = ref(false),
    error = ref('');
  let controller: AbortController | undefined;
  async function load(refreshDate = true) {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    loading.value = true;
    error.value = '';
    try {
      if (refreshDate || !today.value) {
        const categories = await api.categories(request.signal);
        if (request.signal.aborted) return;
        const followedToday = !anchor.value || anchor.value === today.value;
        today.value = categories.today;
        if (followedToday) anchor.value = today.value;
      }
      const result = await api.dashboard(period.value, anchor.value, request.signal);
      if (!request.signal.aborted) {
        data.value = result;
        today.value = result.today;
      }
    } catch (failure) {
      if (!request.signal.aborted) error.value = errorMessage(failure);
    } finally {
      if (!request.signal.aborted) loading.value = false;
    }
  }
  async function choose(nextPeriod: Period, nextAnchor = anchor.value) {
    period.value = nextPeriod;
    anchor.value = nextAnchor;
    await load(false);
  }
  onMounted(() => load());
  onUnmounted(() => controller?.abort());
  return {
    data,
    period,
    anchor,
    today,
    loading,
    error,
    items: computed(() => data.value?.categories ?? []),
    load,
    choose,
  };
}
