import type { Category, DailyEntry, PerformanceSummary, CurvePoint, RateReason } from './types.ts';
import type { DateRange, Period } from './dates.ts';

export interface DashboardCategory extends CategoryView {
  periodPnl: string;
  periodClosingBalance: string;
  returnRate: string | null;
  rateReason: RateReason | null;
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
  category: DashboardCategory;
  range: DateRange;
  records: (EntryRecord & { pnl: string; returnRate: string | null })[];
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
  name: string;
  color: string;
  openingDate: string;
  openingBalance: string;
  historicalPnl: string;
  note: string;
}

export interface CategoryRecord extends Category {
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
  archivedOn?: string | null;
};

export interface EntryRecord extends DailyEntry {
  id: string;
  note: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface EntryWrite {
  categoryId: string;
  categoryRevision: number;
  revision: number | null;
  closingBalance: string;
  buy: string;
  sell: string;
  note: string;
}

export interface EntryDayItem {
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
  days: { date: string; count: number }[];
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
