// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import AppField from '../src/components/ui/AppField.vue';
import { recordingDateLabel } from '../src/utils/format.ts';

describe('live money input', () => {
  function field(signed = false) {
    return mount({
      components: { AppField },
      setup() {
        return { value: ref('0.00'), signed };
      },
      template:
        '<form><AppField id="money" label="金额" v-model="value" money :signed="signed" /></form>',
    });
  }
  it('keeps the last valid amount when letters, extra decimals or overflow are pasted', async () => {
    const wrapper = field();
    const input = wrapper.get('input');
    await input.setValue('123.45');
    for (const invalid of ['1e5', 'abc', '123.456', '1,000', '1000000000000', '-10']) {
      await input.setValue(invalid);
      expect((input.element as HTMLInputElement).value).toBe('123.45');
      expect(wrapper.get('[role="alert"]').text()).toContain('阻止输入');
      expect((input.element as HTMLInputElement).validity.valid).toBe(false);
    }
    await input.setValue('123.46');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect((input.element as HTMLInputElement).validity.valid).toBe(true);
    wrapper.unmount();
  });
  it('supports negative history, decimal editing and zero normalization', async () => {
    const wrapper = field(true);
    const input = wrapper.get('input');
    await input.setValue('-');
    await input.setValue('-.5');
    expect((input.element as HTMLInputElement).value).toBe('-0.5');
    await input.trigger('blur');
    expect((input.element as HTMLInputElement).value).toBe('-0.50');
    await input.setValue('00012.');
    await input.trigger('blur');
    expect((input.element as HTMLInputElement).value).toBe('12.00');
    await input.setValue('');
    await input.trigger('blur');
    expect((input.element as HTMLInputElement).value).toBe('0.00');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('prevents invalid keyboard insertions before they change the value', async () => {
    const wrapper = field();
    const input = wrapper.get('input');
    await input.setValue('12.34');
    (input.element as HTMLInputElement).setSelectionRange(5, 5);
    const event = new InputEvent('beforeinput', {
      data: '5',
      inputType: 'insertText',
      bubbles: true,
      cancelable: true,
    });
    input.element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect((input.element as HTMLInputElement).value).toBe('12.34');
    wrapper.unmount();
  });
  it('formats recording dates without repeating the column label', () => {
    expect(recordingDateLabel('2026-09-14', '2026-09-14')).toBe('今日');
    expect(recordingDateLabel('2026-09-13', '2026-09-14')).toBe('09-13');
    expect(recordingDateLabel('2025-10-01', '2026-09-14')).toBe('2025-10-01');
    expect(recordingDateLabel(null, '2026-09-14')).toBe('—');
  });
});
