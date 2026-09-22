export function copyPlainNumbers(event: ClipboardEvent): void {
  if (event.defaultPrevented || !event.clipboardData) return;
  const target = event.target;
  if (target instanceof Element && target.closest('input,textarea,[contenteditable="true"]'))
    return;
  const selected = document.getSelection()?.toString();
  if (!selected) return;
  const plain = selected.replace(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g, (value) =>
    value.replaceAll(',', ''),
  );
  if (plain === selected) return;
  event.clipboardData.setData('text/plain', plain);
  event.preventDefault();
}
