import { randomUUID } from 'node:crypto';
import {
  calculateLedger,
  parseDate,
  parseMoney,
  FinancialDecimal,
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
    const row = database
      .prepare(
        'SELECT * FROM categories c WHERE id = ? AND NOT EXISTS (SELECT 1 FROM categories n WHERE n.previous_cycle_id=c.id)',
      )
      .get(id);
    if (!row) throw new ApiError(404, 'CATEGORY_NOT_FOUND', '分类不存在或已被删除');
    return categoryFromRow(row);
  };
  const checkRevision = (actual: number, expected: number) => {
    if (actual !== expected)
      throw new ApiError(409, 'REVISION_CONFLICT', '数据已在其他页面更新，请重新载入后再保存');
  };
  const checkName = (name: string, id: string, previousId?: string | null) => {
    if (
      database
        .prepare(
          `WITH RECURSIVE ancestors(id) AS (SELECT ? UNION ALL SELECT c.previous_cycle_id FROM categories c JOIN ancestors a ON c.id=a.id WHERE c.previous_cycle_id IS NOT NULL), descendants(id) AS (SELECT ? UNION ALL SELECT c.id FROM categories c JOIN descendants d ON c.previous_cycle_id=d.id) SELECT id FROM categories WHERE name=? COLLATE NOCASE AND id<>? AND id NOT IN (SELECT id FROM ancestors WHERE id IS NOT NULL) AND id NOT IN (SELECT id FROM descendants WHERE id IS NOT NULL)`,
        )
        .get(previousId ?? id, id, name, id)
    ) {
      throw new ApiError(409, 'DUPLICATE_NAME', '已存在同名分类', 'name');
    }
  };
  const validateBook = () =>
    calculateLedger({
      ...loadLedgerInput(database, true),
      through: currentDate(),
      timeline: 'events',
    });
  const withBalance = (record: CategoryRecord, ledger: ReturnType<typeof validateBook>) => {
    const summary = ledger.categories.find((item) => item.categoryId === record.id)?.summary;
    return {
      ...record,
      balance: summary?.closingBalance ?? '0.00',
      totalPnl: summary?.cumulativePnl ?? '0.00',
      lastRecordedDate: summary?.lastRecordedDate ?? null,
    };
  };
  const cycleIds = (id: string) =>
    database
      .prepare(
        'WITH RECURSIVE cycles(id) AS (SELECT ? UNION ALL SELECT c.previous_cycle_id FROM categories c JOIN cycles ON c.id=cycles.id WHERE c.previous_cycle_id IS NOT NULL) SELECT id FROM cycles',
      )
      .all(id)
      .map((row) => String(row.id));
  const bumpCategory = (id: string) =>
    database
      .prepare(`UPDATE categories SET revision = revision + 1, ${stamp} WHERE id = ?`)
      .run(id);
  const validateValues = (values: CategoryRecord) => {
    validateCategory(values);
    validateEntryDate(values.openingDate, currentDate());
    if (values.archivedOn) validateEntryDate(values.archivedOn, currentDate());
    checkName(values.name, values.id, values.previousCycleId);
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

  const readDay = (date: string, categoryId?: string): EntryDayResponse => {
    validateEntryDate(date, currentDate());
    const input = categoryId
      ? {
          categories: [category(categoryId)],
          entries: database
            .prepare('SELECT * FROM daily_entries WHERE category_id=? ORDER BY date')
            .all(categoryId)
            .map(entryFromRow),
        }
      : loadLedgerInput(database);
    const ledger = calculateLedger({ ...input, from: date, through: date, timeline: 'events' });
    const days = new Map(ledger.categories.map((item) => [item.categoryId, item.days.at(-1)]));
    return {
      date,
      today: currentDate(),
      items: input.categories
        .filter((item) => item.openingDate <= date && (!item.archivedOn || item.archivedOn >= date))
        .map((item) => ({
          category: item,
          priorPnl: new FinancialDecimal(
            ledger.categories.find((value) => value.categoryId === item.id)!.summary.cumulativePnl,
          )
            .minus(days.get(item.id)?.pnl ?? '0')
            .toFixed(2),
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
            `INSERT INTO categories (id,name,color,opening_date,opening_balance_minor,historical_pnl_minor,note,sort_order,include_in_stats)
          VALUES (?,?,?,?,?,?,?,?,?)`,
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
            values.includeInStats === false ? 0 : 1,
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
            `UPDATE categories SET name=?,color=?,opening_date=?,opening_balance_minor=?,historical_pnl_minor=?,note=?,include_in_stats=?,revision=revision+1,${stamp} WHERE id=?`,
          )
          .run(
            draft.name,
            draft.color,
            draft.openingDate,
            parseMoney(draft.openingBalance),
            parseMoney(draft.historicalPnl),
            draft.note,
            draft.includeInStats === false ? 0 : 1,
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
          'WITH RECURSIVE cycles(id) AS (SELECT ? UNION ALL SELECT c.previous_cycle_id FROM categories c JOIN cycles ON c.id=cycles.id WHERE c.previous_cycle_id IS NOT NULL) SELECT count(*) AS count,min(date) AS first,max(date) AS last FROM daily_entries WHERE category_id IN (SELECT id FROM cycles)',
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
        for (const cycleId of cycleIds(id))
          database.prepare('DELETE FROM categories WHERE id=?').run(cycleId);
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
          const liquidation =
            entry.liquidationPnl == null
              ? null
              : parseMoney(entry.liquidationPnl, 'liquidationPnl');
          if ((existing?.liquidation_pnl_minor != null) !== (liquidation !== null))
            throw new ApiError(
              400,
              'LIQUIDATION_MODE',
              '该字段仅用于兼容旧版结算记录，已有结算记录需保留最终盈亏',
            );
          if (existing) {
            database
              .prepare(
                `UPDATE daily_entries SET closing_balance_minor=?,buy_minor=?,sell_minor=?,note=?,liquidation_pnl_minor=?,revision=revision+1,${stamp} WHERE id=?`,
              )
              .run(closing, buy, sell, entry.note, liquidation, existing.id ?? null);
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
        if (
          entry.liquidationPnl != null &&
          database
            .prepare('SELECT id FROM categories WHERE previous_cycle_id=?')
            .get(entry.categoryId)
        )
          throw new ApiError(
            409,
            'CYCLE_HAS_SUCCESSOR',
            '此轮已重新激活，请修改最终盈亏；不能删除上一轮清仓结算',
          );
        database.prepare('DELETE FROM daily_entries WHERE id=?').run(id);
        if (entry.liquidationPnl != null && category(entry.categoryId).archivedOn === entry.date)
          database
            .prepare('UPDATE categories SET archived_on=NULL WHERE id=?')
            .run(entry.categoryId);
        bumpCategory(entry.categoryId);
        validateBook();
        return readDay(entry.date);
      });
    },
    calendar(month: string, categoryId?: string): CalendarResponse {
      parseDate(`${month}-01`, 'month');
      validateEntryDate(`${month}-01`, currentDate());
      if (categoryId) category(categoryId);
      const rows = categoryId
        ? database
            .prepare(
              'SELECT date, count(*) AS count, 1 AS total FROM daily_entries WHERE category_id=? AND substr(date,1,7)=? GROUP BY date ORDER BY date',
            )
            .all(categoryId, month)
        : database
            .prepare(
              'SELECT e.date,count(*) AS count,(SELECT count(*) FROM categories c WHERE c.opening_date<=e.date AND (c.archived_on IS NULL OR c.archived_on>=e.date) AND NOT EXISTS (SELECT 1 FROM categories n WHERE n.previous_cycle_id=c.id)) AS total FROM daily_entries e WHERE substr(e.date,1,7)=? AND NOT EXISTS (SELECT 1 FROM categories n WHERE n.previous_cycle_id=e.category_id) GROUP BY e.date ORDER BY e.date',
            )
            .all(month);
      return {
        month,
        today: currentDate(),
        days: rows.map((row) => ({
          date: String(row.date),
          count: Number(row.count),
          total: Number(row.total),
        })),
      };
    },
  };
}
