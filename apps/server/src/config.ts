import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));

export function loadEnvironment(): void {
  const path = resolve(projectRoot, '.env');
  if (existsSync(path)) loadEnvFile(path);
}

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const port = Number(env.RR_PORT ?? '8080');
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('RR_PORT must be between 1 and 65535');
  const host = env.RR_HOST ?? '127.0.0.1';
  if (!host.trim()) throw new Error('RR_HOST cannot be empty');
  const filename = env.RR_DATABASE_PATH ?? './data/resilient-riches.sqlite';
  if (!filename.trim()) throw new Error('RR_DATABASE_PATH cannot be empty');
  let publicOrigin: string | undefined;
  if (env.RR_PUBLIC_ORIGIN?.trim()) {
    const url = new URL(env.RR_PUBLIC_ORIGIN.trim());
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw new Error('RR_PUBLIC_ORIGIN must be an HTTP(S) origin without a path');
    publicOrigin = url.origin;
  }
  return {
    host,
    port,
    databasePath: resolve(projectRoot, filename),
    webRoot: resolve(projectRoot, 'apps/web/dist'),
    publicOrigin,
  };
}
