import { ref } from 'vue';
const notice = ref({ id: 0, text: '' });
export function useToast() {
  function success(text: string) {
    notice.value = { id: notice.value.id + 1, text };
  }
  function dismiss() {
    notice.value = { ...notice.value, text: '' };
  }
  return { notice, success, dismiss };
}
