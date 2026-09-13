import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Fastify from 'fastify';
import staticFiles from '@fastify/static';
import type { HealthResponse } from '@resilient-riches/core';
import { schemaVersion } from './database/database.ts';
import type { AppDatabase } from './database/database.ts';
import { registerLedgerRoutes } from './routes/ledger.ts';

export async function createApp(options: {
  database: AppDatabase;
  webRoot?: string;
  logger?: boolean;
  clock?: () => string;
}) {
  const app = Fastify({
    logger: options.logger ?? false,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, useDefaults: false } },
  });
  app.addHook('onClose', async () => {
    options.database.close();
  });
  registerLedgerRoutes(app, options.database, options.clock);
  app.get<{ Reply: HealthResponse }>('/api/v1/health', (_request, reply) => {
    try {
      const settings = options.database
        .prepare('SELECT currency, timezone FROM app_settings WHERE id = 1')
        .get();
      if (settings?.currency !== 'CNY' || settings.timezone !== 'Asia/Shanghai')
        throw new Error('Invalid application settings');
      return {
        status: 'ok',
        database: 'ok',
        schemaVersion: schemaVersion(options.database),
        currency: 'CNY',
        timezone: 'Asia/Shanghai',
      };
    } catch (error) {
      app.log.error(error, 'Database health check failed');
      reply.code(503);
      return {
        status: 'error',
        database: 'unavailable',
        schemaVersion: null,
        currency: 'CNY',
        timezone: 'Asia/Shanghai',
      };
    }
  });
  if (options.webRoot && existsSync(join(options.webRoot, 'index.html'))) {
    await app.register(staticFiles, { root: options.webRoot });
  }
  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ code: 'NOT_FOUND', message: '请求的资源不存在' }),
  );
  return app;
}
