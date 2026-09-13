import { resolve } from 'node:path';
import { loadEnvironment, projectRoot, readConfig } from './config.ts';
import { backupDatabase } from './database/snapshots.ts';

loadEnvironment();
try {
  const args = process.argv.slice(2);
  if (args.length !== 1) throw new Error('用法：node apps/server/dist/backup.js <备份文件路径>');
  const result = await backupDatabase(readConfig().databasePath, resolve(projectRoot, args[0]!));
  console.log(`备份完成：${result.path}\n${result.categories} 个分类，${result.entries} 条记录。`);
} catch (error) {
  console.error(error instanceof Error ? error.message : '备份失败');
  process.exitCode = 1;
}
