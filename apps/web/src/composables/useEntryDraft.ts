import { computed, onMounted, onUnmounted, ref } from 'vue';
import { calculateDay } from '@resilient-riches/core';
import type {
  CalendarResponse,
  EntryDayItem,
  EntryDayResponse,
  EntryWrite,
} from '@resilient-riches/core';
import { api, errorMessage } from '../api.ts';
import { entryErrors } from '../utils/forms.ts';

export interface EntryDraft {
  reference: EntryDayItem;
  values: EntryWrite;
  dirty: boolean;
}
export function useEntryDraft(
  today: string,
  initialId: string | null,
  changed: () => void,
  initialDate = today,
) {
  const date = ref(initialDate),
    month = ref(initialDate.slice(0, 7)),
    selectedId = ref<string | null>(initialId);
  const cache = ref<Record<string, EntryDraft[]>>({});
  const calendar = ref<CalendarResponse | null>(null);
  const loading = ref(false),
    calendarLoading = ref(false),
    busy = ref(false),
    touched = ref(false);
  const error = ref(''),
    calendarError = ref(''),
    message = ref('');
  const errors = ref<Record<string, string>>({});
  let dayController: AbortController | undefined, calendarController: AbortController | undefined;
  const drafts = computed(() => cache.value[date.value] ?? []);
  const active = computed(() =>
    drafts.value.find((item) => item.values.categoryId === selectedId.value),
  );
  const dirtyCount = computed(
    () =>
      Object.values(cache.value)
        .flat()
        .filter((item) => item.dirty).length,
  );
  function from(item: EntryDayItem): EntryDraft {
    return {
      reference: item,
      dirty: false,
      values: {
        categoryId: item.category.id,
        categoryRevision: item.category.revision,
        revision: item.entry?.revision ?? null,
        closingBalance: item.entry?.closingBalance ?? item.openingBalance,
        buy: item.entry?.buy ?? '0.00',
        sell: item.entry?.sell ?? '0.00',
        note: item.entry?.note ?? '',
      },
    };
  }
  function accept(result: EntryDayResponse, submitted: string[] = []) {
    const previous = cache.value[result.date] ?? [];
    const next = result.items.map((item) => {
      const draft = previous.find((value) => value.values.categoryId === item.category.id);
      if (!draft?.dirty || submitted.includes(item.category.id)) return from(item);
      if (draft.values.categoryRevision === item.category.revision) draft.reference = item;
      return draft;
    });
    next.push(
      ...previous.filter(
        (item) =>
          item.dirty && !next.some((value) => value.values.categoryId === item.values.categoryId),
      ),
    );
    cache.value[result.date] = next;
    if (!next.some((item) => item.values.categoryId === selectedId.value))
      selectedId.value = next[0]?.values.categoryId ?? null;
  }
  async function loadDay() {
    dayController?.abort();
    const controller = new AbortController();
    dayController = controller;
    loading.value = true;
    error.value = '';
    try {
      const result = await api.day(date.value, controller.signal);
      if (!controller.signal.aborted) accept(result);
    } catch (failure) {
      if (!controller.signal.aborted) error.value = errorMessage(failure);
    } finally {
      if (!controller.signal.aborted) loading.value = false;
    }
  }
  async function loadCalendar() {
    calendarController?.abort();
    const controller = new AbortController();
    calendarController = controller;
    calendarLoading.value = true;
    calendarError.value = '';
    try {
      const result = await api.calendar(month.value, controller.signal);
      if (!controller.signal.aborted) calendar.value = result;
    } catch (failure) {
      if (!controller.signal.aborted) calendarError.value = errorMessage(failure);
    } finally {
      if (!controller.signal.aborted) calendarLoading.value = false;
    }
  }
  async function changeMonth(value: string) {
    month.value = value;
    await loadCalendar();
  }
  async function changeDate(value: string) {
    if (busy.value || value === date.value) return;
    date.value = value;
    errors.value = {};
    message.value = '';
    if (month.value !== value.slice(0, 7)) {
      month.value = value.slice(0, 7);
      void loadCalendar();
    }
    await loadDay();
  }
  function edit(value: EntryWrite) {
    if (!active.value) return;
    active.value.values = value;
    active.value.dirty = true;
    touched.value = true;
    errors.value = {};
    error.value = '';
    message.value = '';
  }
  function ownRevisions(result: EntryDayResponse, ids: string[]) {
    for (const list of Object.values(cache.value))
      for (const draft of list) {
        if (!ids.includes(draft.values.categoryId)) continue;
        const item = result.items.find((value) => value.category.id === draft.values.categoryId);
        if (item && item.category.revision === draft.values.categoryRevision + 1)
          draft.values.categoryRevision = item.category.revision;
      }
  }
  async function save() {
    if (busy.value || loading.value || !active.value) return;
    const entries = drafts.value.filter((item) => item.dirty);
    if (!entries.length) entries.push(active.value);
    for (const draft of entries) {
      const found = entryErrors(draft.values);
      try {
        if (!Object.keys(found).length)
          calculateDay({ ...draft.values, openingBalance: draft.reference.openingBalance });
      } catch (failure) {
        found.sell = failure instanceof Error ? failure.message : '金额无效';
      }
      if (Object.keys(found).length) {
        selectedId.value = draft.values.categoryId;
        errors.value = found;
        return;
      }
    }
    busy.value = true;
    error.value = '';
    try {
      const ids = entries.map((item) => item.values.categoryId);
      const result = await api.saveEntries(
        date.value,
        entries.map((item) => item.values),
      );
      ownRevisions(result, ids);
      accept(result, ids);
      touched.value = true;
      message.value = `已保存 ${ids.length} 个分类的记录`;
      changed();
      await loadCalendar();
    } catch (failure) {
      error.value = errorMessage(failure);
    } finally {
      busy.value = false;
    }
  }
  async function remove() {
    const draft = active.value,
      entry = draft?.reference.entry;
    if (!draft || !entry || busy.value) return;
    busy.value = true;
    error.value = '';
    try {
      const result = await api.deleteEntry(entry.id, entry.revision, draft.values.categoryRevision);
      ownRevisions(result, [draft.values.categoryId]);
      accept(result, [draft.values.categoryId]);
      touched.value = true;
      message.value = '记录已删除';
      changed();
      await loadCalendar();
    } catch (failure) {
      error.value = errorMessage(failure);
    } finally {
      busy.value = false;
    }
  }
  async function reload() {
    delete cache.value[date.value];
    await loadDay();
  }
  onMounted(() => {
    void loadDay();
    void loadCalendar();
  });
  onUnmounted(() => {
    dayController?.abort();
    calendarController?.abort();
  });
  return {
    date,
    month,
    selectedId,
    calendar,
    drafts,
    active,
    dirtyCount,
    loading,
    calendarLoading,
    busy,
    touched,
    error,
    calendarError,
    message,
    errors,
    edit,
    save,
    remove,
    reload,
    changeDate,
    changeMonth,
    loadCalendar,
  };
}
