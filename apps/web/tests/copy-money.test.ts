// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { copyPlainNumbers } from '../src/utils/clipboard.ts';
afterEach(() => {
  document.removeEventListener('copy', copyPlainNumbers);
  document.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});
function copy(text: string, tag = 'span') {
  const node = document.createElement(tag);
  node.textContent = text;
  document.body.append(node);
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  const setData = vi.fn();
  const event = new Event('copy', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { setData } });
  document.addEventListener('copy', copyPlainNumbers);
  node.dispatchEvent(event);
  return { setData, event };
}
it('copies selected grouped amounts as plain numbers and preserves signs, decimals and other text', () => {
  const { setData, event } = copy(
    '总额 ¥ 1,234,567.89\n盈亏 +14,800.00 −2,000.50\n收益率 -2.00%\n备注：a,b',
  );
  expect(setData).toHaveBeenCalledWith(
    'text/plain',
    '总额 ¥ 1234567.89\n盈亏 +14800.00 −2000.50\n收益率 -2.00%\n备注：a,b',
  );
  expect(event.defaultPrevented).toBe(true);
});
it.each(['备注：a,b', '2026-09-22 12:00', '•••• 1234.50 12,34'])(
  'preserves default copying for %s',
  (value) => {
    const { event, setData } = copy(value);
    expect(event.defaultPrevented).toBe(false);
    expect(setData).not.toHaveBeenCalled();
  },
);
it('leaves user-entered text alone', () => {
  const { event, setData } = copy('备注1,234', 'textarea');
  expect(event.defaultPrevented).toBe(false);
  expect(setData).not.toHaveBeenCalled();
});
