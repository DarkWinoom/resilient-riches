import { loadEnvironment, readConfig } from './config.ts';
import { openDatabase, schemaVersion } from './database/database.ts';

loadEnvironment();
const database = openDatabase(readConfig().databasePath);
try {
  console.info(`Database schema is ready at version ${schemaVersion(database)}`);
} finally {
  database.close();
}
