import type {
  DashboardResponse,
  CategoryDetailResponse,
  Period,
  ApiFailure,
  CalendarResponse,
  CategoryListResponse,
  CategoryPatch,
  CategoryView,
  CategoryValues,
  DeletionImpact,
  EntryDayResponse,
  EntryWrite,
} from '@resilient-riches/core';

export class RequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const failure = data as ApiFailure;
    throw new RequestError(
      response.status,
      failure.code,
      failure.message || '请求失败，请重试',
      failure.fields,
    );
  }
  return data as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof RequestError ? error.message : '无法连接服务，请稍后重试';
}

export const api = {
  dashboard: (period: Period, anchor: string, signal?: AbortSignal) =>
    request<DashboardResponse>(
      `/dashboard?period=${period}&anchor=${encodeURIComponent(anchor)}`,
      'GET',
      undefined,
      signal,
    ),
  detail: (id: string, period: Period, anchor: string, signal?: AbortSignal) =>
    request<CategoryDetailResponse>(
      `/categories/${encodeURIComponent(id)}/detail?period=${period}&anchor=${encodeURIComponent(anchor)}`,
      'GET',
      undefined,
      signal,
    ),
  categories: (signal?: AbortSignal) =>
    request<CategoryListResponse>('/categories', 'GET', undefined, signal),
  createCategory: (values: CategoryValues) => request<CategoryView>('/categories', 'POST', values),
  updateCategory: (id: string, values: CategoryPatch) =>
    request<CategoryView>(`/categories/${encodeURIComponent(id)}`, 'PATCH', values),
  reorder: (items: { id: string; revision: number }[]) =>
    request<CategoryListResponse>('/categories/order', 'PUT', { items }),
  deletionImpact: (id: string) =>
    request<DeletionImpact>(`/categories/${encodeURIComponent(id)}/deletion-impact`),
  deleteCategory: (id: string, revision: number) =>
    request<{ ok: boolean }>(`/categories/${encodeURIComponent(id)}`, 'DELETE', {
      revision,
      confirm: true,
    }),
  day: (date: string, signal?: AbortSignal) =>
    request<EntryDayResponse>(
      `/entries?date=${encodeURIComponent(date)}`,
      'GET',
      undefined,
      signal,
    ),
  calendar: (month: string, signal?: AbortSignal) =>
    request<CalendarResponse>(
      `/calendar?month=${encodeURIComponent(month)}`,
      'GET',
      undefined,
      signal,
    ),
  saveEntries: (date: string, entries: EntryWrite[]) =>
    request<EntryDayResponse>('/entries/batch', 'PUT', { date, entries }),
  deleteEntry: (id: string, revision: number, categoryRevision: number) =>
    request<EntryDayResponse>(`/entries/${encodeURIComponent(id)}`, 'DELETE', {
      revision,
      categoryRevision,
      confirm: true,
    }),
};
