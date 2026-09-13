import { createApp } from './app.ts';
import { loadEnvironment, readConfig } from './config.ts';
import { openDatabase } from './database/database.ts';

loadEnvironment();
const config = readConfig();
const database = openDatabase(config.databasePath);
try {
  const app = await createApp({
    database,
    webRoot: config.webRoot,
    publicOrigin: config.publicOrigin,
    logger: true,
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void app.close().catch((error: unknown) => {
        app.log.error(error);
        process.exitCode = 1;
      });
    });
  }
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  database.close();
  throw error;
}
