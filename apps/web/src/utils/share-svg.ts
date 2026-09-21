import type { ShareModel } from './share-model.ts';
import { periodLabel } from '@resilient-riches/core';
import { reportTitles } from './share-model.ts';
import { rateLabel, signedMoney } from './format.ts';

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!,
  );
const tone = (value: string | null) =>
  !value || Number(value) === 0 ? '#857d70' : value.startsWith('-') ? '#278264' : '#c54e49';
function text(
  x: number,
  y: number,
  value: string,
  size = 24,
  fill = '#302d27',
  anchor = 'start',
  weight = 400,
) {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}">${escape(value)}</text>`;
}
function lines(value: string, max = 20): string[] {
  const chars = [...value];
  return Array.from({ length: Math.ceil(chars.length / max) }, (_, index) =>
    chars.slice(index * max, (index + 1) * max).join(''),
  );
}
export function renderShareSvg(model: ShareModel): { svg: string; width: number; height: number } {
  const showCurve = model.period !== 'day';
  const width = 900,
    top = 400,
    chartHeight = 280;
  const rows = model.categories?.map((category) => ({
    category,
    nameLines: lines(category.name, model.amounts ? 12 : 20),
    height: Math.max(84, lines(category.name, model.amounts ? 12 : 20).length * 29 + 32),
  }));
  const tableTop = showCurve ? 740 : 400,
    tableHeight = rows ? 84 + rows.reduce((sum, row) => sum + row.height, 0) : 0;
  const height = rows ? tableTop + tableHeight + 125 : showCurve ? 840 : 480;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#f7f5ef"/><g font-family="Microsoft YaHei,Segoe UI,sans-serif">`,
    `<rect x="38" y="38" width="824" height="${height - 76}" rx="22" fill="#fff" stroke="#e7dfd0"/>`,
    `<rect x="72" y="74" width="8" height="45" rx="4" fill="#9a742e"/>`,
    text(98, 109, reportTitles[model.period], 32, '#302d27', 'start', 600),
    text(
      72,
      158,
      model.range.from === model.range.to
        ? `${model.current ? '截至 ' : ''}${model.range.to}`
        : `${model.range.from} — ${model.current ? '截至 ' : ''}${model.range.to}`,
      24,
      '#827a6e',
    ),
  ];
  parts.push(`<rect x="70" y="200" width="760" height="144" rx="14" fill="#f7f5ef"/>`);
  if (model.amounts) {
    parts.push(
      text(
        94,
        241,
        showCurve ? periodLabel(model.period, model.current) + '收益' : '当日收益',
        23,
        '#827a6e',
      ),
      text(94, 294, signedMoney(model.amounts.pnl), 38, tone(model.amounts.pnl), 'start', 600),
      text(465, 241, showCurve ? '收益率' : '当日收益率', 23, '#827a6e'),
      text(465, 294, rateLabel(model.returnRate), 38, tone(model.returnRate), 'start', 600),
    );
  } else
    parts.push(
      text(450, 241, showCurve ? '收益率' : '当日收益率', 24, '#827a6e', 'middle'),
      text(450, 300, rateLabel(model.returnRate), 48, tone(model.returnRate), 'middle', 600),
    );
  if (model.historicalRateIncluded === false)
    parts.push(text(72, 375, '收益率不含无法还原本金的历史部分', 18, '#827a6e'));
  if (showCurve) {
    const values = model.curve.map((point) =>
      point.returnRate === null ? null : Number(point.returnRate) * 100,
    );
    const finite = values.filter(
      (value): value is number => value !== null && Number.isFinite(value),
    );
    const min = Math.min(0, ...finite),
      max = Math.max(0, ...finite),
      spread = max - min || 1,
      low = min < 0 ? min - spread * 0.12 : 0,
      high = max > 0 ? max + spread * 0.12 : low === 0 ? 1 : 0;
    const y = (value: number) => top + 40 + ((high - value) / (high - low)) * (chartHeight - 72);
    const x = (index: number) => 156 + (index / Math.max(1, values.length - 1)) * 650;
    parts.push(text(72, top, '累计收益率', 23, '#827a6e'));
    for (let index = 0; index < 4; index++) {
      const value = low + ((high - low) * index) / 3;
      parts.push(
        `<line x1="156" y1="${y(value)}" x2="806" y2="${y(value)}" stroke="#ebe4d8" stroke-dasharray="5 6"/>`,
        text(140, y(value) + 8, `${value.toFixed(2)}%`, 22, '#827a6e', 'end'),
      );
    }
    if (finite.length) {
      let path = '';
      let connected = false;
      values.forEach((value, index) => {
        if (value === null || !Number.isFinite(value)) {
          connected = false;
          return;
        }
        path += `${connected ? 'L' : 'M'}${x(index)},${y(value)} `;
        connected = true;
      });
      parts.push(
        `<path d="${path}" fill="none" stroke="${tone(model.returnRate)}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
    } else parts.push(text(475, top + 137, '暂无可计算的收益率', 26, '#827a6e', 'middle'));
    parts.push(
      text(
        156,
        top + chartHeight + 3,
        (model.curve[0]?.date ?? model.range.from).slice(5).replace('-', '.'),
        22,
        '#827a6e',
      ),
      text(
        806,
        top + chartHeight + 3,
        model.range.to.slice(5).replace('-', '.'),
        22,
        '#827a6e',
        'end',
      ),
    );
  }
  if (rows) {
    parts.push(
      text(72, tableTop + 18, '分类收益', 28, '#302d27', 'start', 600),
      text(828, tableTop + 18, `${rows.length} 个分类`, 22, '#827a6e', 'end'),
    );
    let cursor = tableTop + 65;
    for (const { category, nameLines, height: rowHeight } of rows) {
      parts.push(
        `<line x1="72" x2="828" y1="${cursor}" y2="${cursor}" stroke="#ede7dc"/><circle cx="82" cy="${cursor + 35}" r="5" fill="${/^#[0-9a-f]{6}$/i.test(category.color) ? category.color : '#9a742e'}"/>`,
      );
      nameLines.forEach((line, index) => parts.push(text(102, cursor + 43 + index * 29, line, 24)));
      if (category.amounts)
        parts.push(
          text(
            640,
            cursor + 43,
            signedMoney(category.amounts.pnl),
            25,
            tone(category.amounts.pnl),
            'end',
          ),
        );
      parts.push(
        text(
          828,
          cursor + 43,
          rateLabel(category.returnRate),
          25,
          tone(category.returnRate),
          'end',
        ),
      );
      cursor += rowHeight;
    }
  }
  parts.push(
    `<line x1="72" x2="828" y1="${height - 105}" y2="${height - 105}" stroke="#e5dac6"/>`,
    text(72, height - 68, 'Resilient Riches', 23, '#9a742e'),
    text(828, height - 68, '稳健生财', 22, '#827a6e', 'end'),
    '</g></svg>',
  );
  return { svg: parts.join(''), width, height };
}
