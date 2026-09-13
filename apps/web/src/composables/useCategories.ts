import { onMounted, onUnmounted, readonly, ref } from 'vue';
import type { CategoryView } from '@resilient-riches/core';
import { api, errorMessage } from '../api.ts';

export function useCategories() {
  const items = ref<CategoryView[]>([]);
  const today = ref('');
  const loading = ref(true);
  const error = ref('');
  let controller: AbortController | undefined;
  async function load() {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    loading.value = true;
    error.value = '';
    try {
      const result = await api.categories(request.signal);
      if (request.signal.aborted) return;
      items.value = result.items;
      today.value = result.today;
    } catch (failure) {
      if (!request.signal.aborted) error.value = errorMessage(failure);
    } finally {
      if (!request.signal.aborted) loading.value = false;
    }
  }
  onMounted(load);
  onUnmounted(() => controller?.abort());
  return {
    items: readonly(items),
    today: readonly(today),
    loading: readonly(loading),
    error: readonly(error),
    load,
  };
}
