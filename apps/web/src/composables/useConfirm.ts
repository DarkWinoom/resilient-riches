import { onScopeDispose, ref } from 'vue';

export interface Confirmation {
  title: string;
  description: string;
  action: string;
  danger?: boolean;
}

export function useConfirm() {
  const pending = ref<Confirmation | null>(null);
  let resolve: ((answer: boolean) => void) | undefined;
  function finish(answer: boolean) {
    const done = resolve;
    resolve = undefined;
    pending.value = null;
    done?.(answer);
  }
  function ask(options: Confirmation): Promise<boolean> {
    if (pending.value) return Promise.resolve(false);
    pending.value = options;
    return new Promise<boolean>((done) => {
      resolve = done;
    });
  }
  onScopeDispose(() => finish(false));
  return { pending, ask, finish };
}
