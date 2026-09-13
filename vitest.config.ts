import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    include: [
      'packages/*/tests/**/*.test.ts',
      'apps/server/tests/**/*.test.ts',
      'apps/web/tests/**/*.test.ts',
    ],
    environment: 'node',
    server: { deps: { external: [/apps[\\/]server[\\/]src[\\/]/] } },
  },
});
