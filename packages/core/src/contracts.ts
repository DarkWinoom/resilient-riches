import type { Category, DailyEntry, DayResult, PerformanceSummary, CurvePoint } from './types.ts';
import type { DateRange, Period } from './dates.ts';

export interface DashboardCategory extends CategoryView {
  weekPnl: string;
  weekReturnRate: string | null;
  monthPnl: string;
  monthReturnRate: string | null;
  totalReturnRate: string | null;
}
export interface DashboardResponse {
  today: string;
  earliestDate: string | null;
  period: Period;
  anchor: string;
  range: DateRange;
  overview: { current: PerformanceSummary; today: PerformanceSummary; month: PerformanceSummary };
  categories: DashboardCategory[];
  curve: CurvePoint[];
  performance: PerformanceSummary;
}
export interface CategoryDetailResponse {
  days: DayResult[];
  performance: PerformanceSummary;
  category: CategoryView;
  range: DateRange;
  curve: CurvePoint[];
}

export interface ReportCategory {
  id: string;
  name: string;
  color: string;
  pnl: string;
  endingBalance: string;
  returnRate: string | null;
  lastRecordedDate: string | null;
}
export interface ReportResponse {
  today: string;
  period: Period;
  anchor: string;
  range: DateRange;
  current: boolean;
  summary: PerformanceSummary;
  curve: CurvePoint[];
  categories: ReportCategory[];
  recordCount: number;
  commentary: string[];
}

export interface CategoryValues {
  includeInStats?: boolean;
  name: string;
  color: string;
  openingDate: string;
  openingBalance: string;
  historicalPnl: string;
  note: string;
}

export interface CategoryRecord extends Category {
  previousCycleId?: string | null;
  note: string;
  archivedOn: string | null;
  sortOrder: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryView extends CategoryRecord {
  balance: string;
  totalPnl: string;
  lastRecordedDate: string | null;
}

export interface CategoryListResponse {
  today: string;
  items: CategoryView[];
}

export type CategoryPatch = Partial<CategoryValues> & {
  revision: number;
};

export interface EntryRecord extends DailyEntry {
  id: string;
  note: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface EntryWrite {
  liquidationPnl?: string | null;
  categoryId: string;
  categoryRevision: number;
  revision: number | null;
  closingBalance: string;
  buy: string;
  sell: string;
  note: string;
}

export interface EntryDayItem {
  priorPnl?: string;
  category: CategoryRecord;
  entry: EntryRecord | null;
  openingBalance: string;
  previousRecordedDate: string | null;
}

export interface EntryDayResponse {
  date: string;
  today: string;
  items: EntryDayItem[];
}

export interface CalendarResponse {
  month: string;
  today: string;
  days: { date: string; count: number; total: number }[];
}

export interface DeletionImpact {
  category: CategoryRecord;
  entryCount: number;
  firstDate: string | null;
  lastDate: string | null;
}

export interface ApiFailure {
  code: string;
  message: string;
  fields?: Record<string, string>;
}
