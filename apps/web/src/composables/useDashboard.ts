import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { DashboardResponse, Period } from '@resilient-riches/core';
import { useToast } from './useToast.ts';
import { api, errorMessage } from '../api.ts';

export function useDashboard() {
  const { success } = useToast();
  const sorting = ref(false);
  const data = ref<DashboardResponse | null>(null);
  const period = ref<Period>('week'),
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
  async function reorder(ids: string[]) {
    if (!data.value || sorting.value || loading.value) return;
    const all = data.value.categories;
    const visible = new Set(ids);
    let index = 0;
    const ordered = all.map((item) => {
      if (!visible.has(item.id)) return item;
      const id = ids[index++];
      return all.find((row) => row.id === id)!;
    });
    sorting.value = true;
    try {
      const result = await api.reorder(ordered.map(({ id, revision }) => ({ id, revision })));
      const byId = new Map(all.map((item) => [item.id, item]));
      data.value = {
        ...data.value,
        categories: result.items.map((item) => ({
          ...byId.get(item.id)!,
          revision: item.revision,
          sortOrder: item.sortOrder,
        })),
      };
      success('分类顺序已保存');
    } catch (error) {
      success(errorMessage(error));
      await load(false);
    } finally {
      sorting.value = false;
    }
  }
  onMounted(() => load());
  onUnmounted(() => controller?.abort());
  return {
    data,
    sorting,
    reorder,
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
