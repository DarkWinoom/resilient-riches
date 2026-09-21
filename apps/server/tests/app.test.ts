import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { projectRoot, readConfig } from '../src/config.ts';
import { databaseFixture } from './fixtures.ts';

describe('server foundation', () => {
  const fixture = databaseFixture();
  it('returns real database health and a schema version', async () => {
    const database = fixture.open();
    const app = await createApp({ database });
    try {
      const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: 'ok',
        database: 'ok',
        schemaVersion: 3,
        currency: 'CNY',
        timezone: 'Asia/Shanghai',
      });
      database.close();
      const unavailable = await app.inject({ method: 'GET', url: '/api/v1/health' });
      expect(unavailable.statusCode).toBe(503);
      expect(unavailable.json()).toMatchObject({
        status: 'error',
        database: 'unavailable',
        schemaVersion: null,
      });
    } finally {
      await app.close();
    }
  });
  it('serves built front-end files while keeping unknown API paths JSON 404', async () => {
    const webRoot = fixture.directory();
    writeFileSync(join(webRoot, 'index.html'), '<!doctype html><h1>Resilient Riches</h1>');
    const app = await createApp({ database: fixture.open(), webRoot });
    try {
      const index = await app.inject({ method: 'GET', url: '/' });
      expect(index.statusCode).toBe(200);
      expect(index.body).toContain('Resilient Riches');
      const missing = await app.inject({ method: 'GET', url: '/api/v1/unknown' });
      expect(missing.statusCode).toBe(404);
      expect(missing.json().code).toBe('NOT_FOUND');
      expect((await app.inject({ method: 'GET', url: '/.env' })).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
  it('owns and closes its database connection', async () => {
    const database = fixture.open();
    const app = await createApp({ database });
    await app.ready();
    await app.close();
    expect(database.connection.isOpen).toBe(false);
  });
  it('validates configuration and resolves data paths from the project root', () => {
    expect(readConfig({})).toMatchObject({
      host: '127.0.0.1',
      port: 8080,
      databasePath: join(projectRoot, 'data/resilient-riches.sqlite'),
    });
    expect(
      readConfig({ RR_PORT: '8191', RR_DATABASE_PATH: 'custom/book.sqlite' }).databasePath,
    ).toBe(join(projectRoot, 'custom/book.sqlite'));
    expect(() => readConfig({ RR_PORT: '0' })).toThrow();
    expect(() => readConfig({ RR_PORT: '65536' })).toThrow();
    expect(() => readConfig({ RR_DATABASE_PATH: '' })).toThrow();
    expect(() => readConfig({ RR_HOST: ' ' })).toThrow();
    expect(readConfig({ RR_PUBLIC_ORIGIN: 'https://ledger.example.com/' }).publicOrigin).toBe(
      'https://ledger.example.com',
    );
    for (const origin of [
      'file:///etc',
      'https://user:pass@example.com',
      'https://example.com/path',
      'https://example.com?key=value',
    ])
      expect(() => readConfig({ RR_PUBLIC_ORIGIN: origin })).toThrow();
  });
  it('accepts only the configured browser origin behind an HTTPS proxy', async () => {
    const app = await createApp({
      database: fixture.open(),
      publicOrigin: 'https://ledger.example.com',
    });
    const payload = {
      name: '代理验收',
      color: '#b69a60',
      openingDate: '2026-01-01',
      openingBalance: '100',
      historicalPnl: '0',
      note: '',
    };
    try {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/categories',
            headers: { host: 'app:8080', origin: 'https://ledger.example.com' },
            payload,
          })
        ).statusCode,
      ).toBe(201);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/categories',
            headers: {
              host: 'app:8080',
              origin: 'https://other.example.com',
              'x-forwarded-proto': 'https',
            },
            payload,
          })
        ).statusCode,
      ).toBe(403);
    } finally {
      await app.close();
    }
  });
});
