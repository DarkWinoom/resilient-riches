import { resolve } from 'node:path';
import { loadEnvironment, projectRoot, readConfig } from './config.ts';
import { restoreDatabase } from './database/snapshots.ts';

loadEnvironment();
try {
  const args = process.argv.slice(2),
    confirmed = args.includes('--confirm'),
    files = args.filter((arg) => arg !== '--confirm');
  if (files.length !== 1 || args.length > (confirmed ? 2 : 1))
    throw new Error('用法：node apps/server/dist/restore.js <备份文件路径> [--confirm]');
  const result = await restoreDatabase(
    resolve(projectRoot, files[0]!),
    readConfig().databasePath,
    confirmed,
  );
  console.log(
    `来源：${result.source}\n目标：${result.destination}\n${result.categories} 个分类，${result.entries} 条记录。`,
  );
  if (result.restored)
    console.log(`恢复完成。${result.safetyBackup ? `原账本备份：${result.safetyBackup}` : ''}`);
  else
    console.log(
      '仅完成校验，尚未覆盖数据。请先停止服务；确认覆盖后，在相同命令末尾添加 --confirm 执行。',
    );
} catch (error) {
  console.error(error instanceof Error ? error.message : '恢复失败');
  process.exitCode = 1;
}
