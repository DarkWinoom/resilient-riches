import { describe, expect, it } from 'vitest';
import { calculateLedger } from '@resilient-riches/core';
import type { ReportResponse } from '@resilient-riches/core';
import { buildShareModel, shareFilename } from '../src/utils/share-model.ts';
import { renderShareSvg } from '../src/utils/share-svg.ts';

function fixture(): ReportResponse {
  const ledger = calculateLedger({
    categories: [
      {
        id: 'secret-id',
        name: '秘密分类',
        color: '#aabbcc',
        openingDate: '2026-09-01',
        openingBalance: '80000',
        historicalPnl: '4321',
        note: '秘密备注',
      },
    ],
    entries: [
      {
        categoryId: 'secret-id',
        date: '2026-09-13',
        closingBalance: '81234.56',
        buy: '0',
        sell: '0',
        note: '交易备注',
      },
    ],
    from: '2026-09-01',
    through: '2026-09-13',
    includeCurve: true,
  });
  return {
    today: '2026-09-13',
    period: 'month',
    anchor: '2026-09-13',
    range: { from: '2026-09-01', to: '2026-09-13' },
    current: true,
    summary: ledger.portfolio.summary,
    curve: ledger.portfolio.curve!,
    categories: [
      {
        id: 'secret-id',
        name: '秘密分类',
        color: '#aabbcc',
        pnl: '1234.56',
        endingBalance: '81234.56',
        returnRate: ledger.portfolio.summary.returnRate,
        lastRecordedDate: '2026-09-13',
      },
    ],
    recordCount: 1,
    commentary: ['秘密分类是最大贡献，禁止进入分享'],
  };
}
describe('private share model and renderer', () => {
  it('omits the curve from daily shares in every privacy mode', () => {
    const report = fixture();
    report.period = 'day';
    report.range = { from: '2026-09-13', to: '2026-09-13' };
    for (const hideAmounts of [false, true])
      for (const hideCategories of [false, true]) {
        const model = buildShareModel(report, { hideAmounts, hideCategories });
        const { svg, height } = renderShareSvg(model);
        expect(model.curve).toEqual([]);
        expect(svg).toContain('收益日报');
        expect(svg).not.toMatch(/<path|累计收益率|期初|期末资产/);
        expect(svg).toContain('当日收益率');
        expect(height).toBeLessThan(840);
      }
  });
  it.each([
    { hideAmounts: false, hideCategories: false },
    { hideAmounts: true, hideCategories: false },
    { hideAmounts: false, hideCategories: true },
    { hideAmounts: true, hideCategories: true },
  ])('whitelists the $hideAmounts / $hideCategories sharing combination', (options) => {
    const report = fixture(),
      model = buildShareModel(report, options),
      json = JSON.stringify(model),
      { svg } = renderShareSvg(model);
    expect(model.returnRate).toBe(report.summary.returnRate);
    expect(json).not.toContain('秘密备注');
    expect(json).not.toContain('交易备注');
    expect(json).not.toContain('secret-id');
    expect(json).not.toContain('4321');
    expect(json).not.toContain('最大贡献');
    expect(json).not.toContain('endingBalance');
    expect(svg).not.toContain('期末资产');
    expect(svg).not.toContain('81,234.56');
    expect(svg).not.toContain('@2026 by DarkWinoom');
    expect(svg).toContain('x="98" y="109" font-size="32"');
    expect(svg).toContain('>收益月报</text>');
    expect(svg).toContain('>稳健生财</text>');
    if (options.hideAmounts) {
      expect(model).not.toHaveProperty('amounts');
      expect(json).not.toMatch(/81234|1234\.56|endingBalance|cumulativePnl/);
      expect(svg).not.toMatch(/81,234|1,234\.56|期末资产|本期收益<|¥/);
    } else {
      expect(model.amounts?.pnl).toBe('1234.56');
      expect(svg).toContain('1,234.56');
    }
    if (options.hideCategories) {
      expect(model).not.toHaveProperty('categories');
      expect(svg).not.toContain('秘密分类');
      expect(svg).not.toContain('#aabbcc');
      expect(svg).not.toContain('个分类');
    } else expect(model.categories?.[0]?.name).toBe('秘密分类');
    expect(shareFilename(model)).not.toMatch(/秘密|81234|1234|secret/);
    expect(shareFilename(model)).toMatch(/\.png$/);
  });
  it('escapes category names and renders every row of a forty-category image', () => {
    const report = fixture();
    report.categories = Array.from({ length: 40 }, (_, index) => ({
      ...report.categories[0]!,
      name: index === 0 ? '成长<svg onload="x">' : `分类${index + 1}`,
    }));
    const model = buildShareModel(report, { hideAmounts: false, hideCategories: false }),
      result = renderShareSvg(model);
    expect(result.svg).not.toContain('<svg onload');
    expect(result.svg).toContain('&lt;svg');
    expect(result.svg).toContain('分类40');
    expect(result.svg).toContain('40 个分类');
    expect(result.height).toBeGreaterThan(3900);
    expect(result.svg).not.toMatch(/foreignObject|<script|https?:\/\/[^w]/);
  });
  it('does not mutate reports and shows undefined rates without inventing data', () => {
    const report = fixture(),
      original = JSON.stringify(report);
    const model = buildShareModel(report, { hideAmounts: true, hideCategories: true });
    model.curve = model.curve.map((point) => ({ ...point, returnRate: null }));
    model.returnRate = null;
    const result = renderShareSvg(model);
    expect(result.svg).toContain('<path');
    expect(result.svg).toContain('>—</text>');
    expect(result.svg).not.toContain('暂无可计算的收益率');
    expect(result.svg).not.toMatch(/NaN|Infinity/);
    expect(JSON.stringify(report)).toBe(original);
  });
});
