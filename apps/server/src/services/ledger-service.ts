import { randomUUID } from 'node:crypto';
import {
  calculateLedger,
  parseDate,
  parseMoney,
  validateCategory,
  validateEntryDate,
} from '@resilient-riches/core';
import type {
  CategoryListResponse,
  CategoryPatch,
  CategoryRecord,
  CategoryValues,
  DeletionImpact,
  EntryDayResponse,
  EntryWrite,
  CalendarResponse,
} from '@resilient-riches/core';
import type { AppDatabase } from '../database/database.ts';
import { categoryFromRow, entryFromRow, loadLedgerInput } from '../database/ledger-input.ts';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field: string | undefined;
  constructor(status: number, code: string, message: string, field?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

const stamp = "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

export function createLedgerService(database: AppDatabase, currentDate: () => string) {
  const category = (id: string): CategoryRecord => {
    const row = database.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    if (!row) throw new ApiError(404, 'CATEGORY_NOT_FOUND', '分类不存在或已被删除');
    return categoryFromRow(row);
  };
  const checkRevision = (actual: number, expected: number) => {
    if (actual !== expected)
      throw new ApiError(409, 'REVISION_CONFLICT', '数据已在其他页面更新，请重新载入后再保存');
  };
  const checkName = (name: string, id: string) => {
    if (
      database
        .prepare('SELECT id FROM categories WHERE name = ? COLLATE NOCASE AND id <> ?')
        .get(name, id)
    ) {
      throw new ApiError(409, 'DUPLICATE_NAME', '已存在同名分类', 'name');
    }
  };
  const validateBook = () =>
    calculateLedger({ ...loadLedgerInput(database), through: currentDate(), timeline: 'events' });
  const withBalance = (record: CategoryRecord, ledger: ReturnType<typeof validateBook>) => {
    const summary = ledger.categories.find((item) => item.categoryId === record.id)?.summary;
    return {
      ...record,
      balance: summary?.closingBalance ?? '0.00',
      totalPnl: summary?.cumulativePnl ?? '0.00',
      lastRecordedDate: summary?.lastRecordedDate ?? null,
    };
  };
  const bumpCategory = (id: string) =>
    database
      .prepare(`UPDATE categories SET revision = revision + 1, ${stamp} WHERE id = ?`)
      .run(id);
  const validateValues = (values: CategoryRecord) => {
    validateCategory(values);
    validateEntryDate(values.openingDate, currentDate());
    if (values.archivedOn) validateEntryDate(values.archivedOn, currentDate());
    checkName(values.name, values.id);
  };

  const listCategories = (): CategoryListResponse => {
    const input = loadLedgerInput(database);
    const ledger = calculateLedger({ ...input, through: currentDate(), timeline: 'events' });
    const summaries = new Map(ledger.categories.map((item) => [item.categoryId, item.summary]));
    return {
      today: currentDate(),
      items: input.categories.map((item) => {
        const summary = summaries.get(item.id);
        return {
          ...item,
          balance: summary?.closingBalance ?? '0.00',
          totalPnl: summary?.cumulativePnl ?? '0.00',
          lastRecordedDate: summary?.lastRecordedDate ?? null,
        };
      }),
    };
  };

  const readDay = (date: string): EntryDayResponse => {
    validateEntryDate(date, currentDate());
    const input = loadLedgerInput(database);
    const ledger = calculateLedger({ ...input, from: date, through: date, timeline: 'events' });
    const days = new Map(ledger.categories.map((item) => [item.categoryId, item.days.at(-1)]));
    return {
      date,
      today: currentDate(),
      items: input.categories
        .filter((item) => item.openingDate <= date && (!item.archivedOn || item.archivedOn >= date))
        .map((item) => ({
          category: item,
          entry:
            input.entries.find((entry) => entry.categoryId === item.id && entry.date === date) ??
            null,
          openingBalance: days.get(item.id)?.openingBalance ?? item.openingBalance,
          previousRecordedDate:
            input.entries
              .filter((entry) => entry.categoryId === item.id && entry.date < date)
              .at(-1)?.date ?? null,
        })),
    };
  };

  return {
    listCategories,
    readDay,
    createCategory(values: CategoryValues) {
      return database.transaction(() => {
        const id = randomUUID();
        const draft: CategoryRecord = {
          ...values,
          name: values.name.trim(),
          id,
          archivedOn: null,
          revision: 1,
          sortOrder: 0,
          createdAt: '',
          updatedAt: '',
        };
        validateValues(draft);
        const next =
          database.prepare('SELECT coalesce(max(sort_order), -1) + 1 AS next FROM categories').get()
            ?.next ?? 0n;
        database
          .prepare(
            `INSERT INTO categories (id,name,color,opening_date,opening_balance_minor,historical_pnl_minor,note,sort_order)
          VALUES (?,?,?,?,?,?,?,?)`,
          )
          .run(
            id,
            draft.name,
            draft.color,
            draft.openingDate,
            parseMoney(draft.openingBalance),
            parseMoney(draft.historicalPnl),
            draft.note,
            next,
          );
        return withBalance(category(id), validateBook());
      });
    },
    updateCategory(id: string, patch: CategoryPatch) {
      return database.transaction(() => {
        const current = category(id);
        checkRevision(current.revision, patch.revision);
        const draft = { ...current, ...patch, name: (patch.name ?? current.name).trim() };
        validateValues(draft);
        database
          .prepare(
            `UPDATE categories SET name=?,color=?,opening_date=?,opening_balance_minor=?,historical_pnl_minor=?,note=?,archived_on=?,revision=revision+1,${stamp} WHERE id=?`,
          )
          .run(
            draft.name,
            draft.color,
            draft.openingDate,
            parseMoney(draft.openingBalance),
            parseMoney(draft.historicalPnl),
            draft.note,
            draft.archivedOn,
            id,
          );
        return withBalance(category(id), validateBook());
      });
    },
    reorder(items: { id: string; revision: number }[]) {
      return database.transaction(() => {
        const current = loadLedgerInput(database).categories;
        if (
          items.length !== current.length ||
          new Set(items.map((item) => item.id)).size !== items.length ||
          items.some((item) => !current.some((row) => row.id === item.id))
        ) {
          throw new ApiError(409, 'CATEGORY_LIST_CHANGED', '分类列表已改变，请刷新后重新排序');
        }
        for (const item of items) checkRevision(category(item.id).revision, item.revision);
        const update = database.prepare(
          `UPDATE categories SET sort_order=?,revision=revision+1,${stamp} WHERE id=?`,
        );
        items.forEach((item, index) => update.run(index, item.id));
        return listCategories();
      });
    },
    deletionImpact(id: string): DeletionImpact {
      const current = category(id);
      const row = database
        .prepare(
          'SELECT count(*) AS count,min(date) AS first,max(date) AS last FROM daily_entries WHERE category_id=?',
        )
        .get(id);
      return {
        category: current,
        entryCount: Number(row?.count ?? 0n),
        firstDate: typeof row?.first === 'string' ? row.first : null,
        lastDate: typeof row?.last === 'string' ? row.last : null,
      };
    },
    deleteCategory(id: string, revision: number) {
      database.transaction(() => {
        checkRevision(category(id).revision, revision);
        database.prepare('DELETE FROM categories WHERE id=?').run(id);
        validateBook();
      });
      return { ok: true };
    },
    saveEntries(date: string, entries: EntryWrite[]) {
      validateEntryDate(date, currentDate());
      return database.transaction(() => {
        if (
          !entries.length ||
          new Set(entries.map((entry) => entry.categoryId)).size !== entries.length
        )
          throw new ApiError(400, 'DUPLICATE_ENTRY', '每个分类在同一天只能提交一条记录');
        for (const entry of entries) {
          const parent = category(entry.categoryId);
          checkRevision(parent.revision, entry.categoryRevision);
          if (date < parent.openingDate || (parent.archivedOn && date > parent.archivedOn))
            throw new ApiError(400, 'ENTRY_OUTSIDE_LIFETIME', '该日期不在分类可记录范围内', 'date');
          const existing = database
            .prepare('SELECT * FROM daily_entries WHERE category_id=? AND date=?')
            .get(entry.categoryId, date);
          if (existing ? entry.revision !== Number(existing.revision) : entry.revision !== null)
            throw new ApiError(
              409,
              'REVISION_CONFLICT',
              '此记录已被其他页面修改或删除，请重新载入',
            );
          const closing = parseMoney(entry.closingBalance, 'closingBalance', false);
          const buy = parseMoney(entry.buy, 'buy', false);
          const sell = parseMoney(entry.sell, 'sell', false);
          if (existing) {
            database
              .prepare(
                `UPDATE daily_entries SET closing_balance_minor=?,buy_minor=?,sell_minor=?,note=?,revision=revision+1,${stamp} WHERE id=?`,
              )
              .run(closing, buy, sell, entry.note, existing.id ?? null);
          } else {
            database
              .prepare(
                'INSERT INTO daily_entries (id,category_id,date,closing_balance_minor,buy_minor,sell_minor,note) VALUES (?,?,?,?,?,?,?)',
              )
              .run(randomUUID(), entry.categoryId, date, closing, buy, sell, entry.note);
          }
          bumpCategory(entry.categoryId);
        }
        validateBook();
        return readDay(date);
      });
    },
    deleteEntry(id: string, revision: number, categoryRevision: number) {
      return database.transaction(() => {
        const row = database.prepare('SELECT * FROM daily_entries WHERE id=?').get(id);
        if (!row) throw new ApiError(404, 'ENTRY_NOT_FOUND', '记录不存在或已被删除');
        const entry = entryFromRow(row);
        checkRevision(entry.revision, revision);
        checkRevision(category(entry.categoryId).revision, categoryRevision);
        database.prepare('DELETE FROM daily_entries WHERE id=?').run(id);
        bumpCategory(entry.categoryId);
        validateBook();
        return readDay(entry.date);
      });
    },
    calendar(month: string): CalendarResponse {
      parseDate(`${month}-01`, 'month');
      validateEntryDate(`${month}-01`, currentDate());
      const rows = database
        .prepare(
          'SELECT date,count(*) AS count FROM daily_entries WHERE substr(date,1,7)=? GROUP BY date ORDER BY date',
        )
        .all(month);
      return {
        month,
        today: currentDate(),
        days: rows.map((row) => ({ date: String(row.date), count: Number(row.count) })),
      };
    },
  };
}
