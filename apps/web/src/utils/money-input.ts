export function normalizeMoneyDraft(value: string): string {
  return value
    .trim()
    .replace(/^\./, '0.')
    .replace(/^-\./, '-0.')
    .replace(/^(-?)0+(?=\d)/, '$1');
}
export function moneyDraftError(value: string, signed = false): string {
  if (!signed && value.includes('-')) return '此金额不能为负数，已阻止输入';
  if (!/^-?\d*(\.\d*)?$/.test(value)) return '只能输入数字和小数点，已阻止输入';
  if ((value.split('.')[1]?.length ?? 0) > 2) return '最多两位小数，已阻止输入';
  if (value.replace('-', '').split('.')[0]!.length > 12)
    return '金额不能超过 999,999,999,999.99，已阻止输入';
  return '';
}
