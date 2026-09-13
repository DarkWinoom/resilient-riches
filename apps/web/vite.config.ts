import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, fileURLToPath(new URL('../../', import.meta.url)), 'RR_'),
    ...process.env,
  };
  const host = env.RR_HOST === '0.0.0.0' ? '127.0.0.1' : env.RR_HOST || '127.0.0.1';
  const proxyHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return {
    plugins: [vue()],
    build: {
      rolldownOptions: {
        output: {
          postBanner: `/*!\n${readFileSync(new URL('./public/third-party-notices.txt', import.meta.url), 'utf8')}\n*/`,
        },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/api': `http://${proxyHost}:${env.RR_PORT || '8080'}` },
    },
  };
});
