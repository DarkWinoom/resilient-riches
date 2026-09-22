export interface Category {
  includeInStats?: boolean;
  id: string;
  name: string;
  color: string;
  openingDate: string;
  openingBalance: string;
  historicalPnl: string;
  note?: string;
  archivedOn?: string | null;
}

export interface DailyEntry {
  liquidationPnl?: string | null;
  categoryId: string;
  date: string;
  closingBalance: string;
  buy: string;
  sell: string;
  note?: string;
}

export type RateReason = 'no_capital' | 'zero_capital_gain' | 'capital_reset';
export interface DayResult {
  date: string;
  openingBalance: string;
  buy: string;
  sell: string;
  closingBalance: string;
  pnl: string;
  returnRate: string | null;
  rateReason: RateReason | null;
  source: 'recorded' | 'carried' | 'opening' | 'archived';
  lastRecordedDate: string | null;
}

export interface ReturnSegment {
  from: string;
  to: string;
  returnRate: string | null;
  reason: RateReason | null;
}

export interface PerformanceSummary {
  historicalRateIncluded?: boolean;
  closingBalance: string;
  periodPnl: string;
  cumulativePnl: string;
  historicalPnl: string;
  netInvested: string;
  returnRate: string | null;
  rateReason: RateReason | null;
  segments: ReturnSegment[];
  lastRecordedDate: string | null;
}

export interface LedgerSeries {
  days: DayResult[];
  summary: PerformanceSummary;
  historicalPerformance?: Pick<
    PerformanceSummary,
    'returnRate' | 'rateReason' | 'segments' | 'historicalRateIncluded'
  >;
  curve?: CurvePoint[];
}

export interface CurvePoint {
  historicalRateIncluded?: boolean;
  buy?: string;
  sell?: string;
  date: string;
  pnl: string;
  cumulativePnl: string;
  returnRate: string | null;
  rateReason: RateReason | null;
  closingBalance: string;
}

export interface LedgerResult {
  from: string;
  to: string;
  portfolio: LedgerSeries;
  categories: (LedgerSeries & { categoryId: string })[];
}

export interface HealthResponse {
  status: 'ok' | 'error';
  database: 'ok' | 'unavailable';
  schemaVersion: number | null;
  currency: 'CNY';
  timezone: 'Asia/Shanghai';
}
