import type { FastifyInstance } from 'fastify';
import { LedgerError, today } from '@resilient-riches/core';
import type { CategoryPatch, CategoryValues, EntryWrite } from '@resilient-riches/core';
import type { AppDatabase } from '../database/database.ts';
import { ApiError, createLedgerService } from '../services/ledger-service.ts';
import { createDashboardService } from '../services/dashboard-service.ts';
import { createReportService } from '../services/report-service.ts';
import type { Period } from '@resilient-riches/core';

const id = { type: 'string', minLength: 1, maxLength: 64 };
const date = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const amount = { type: 'string', minLength: 1, maxLength: 16 };
const revision = { type: 'integer', minimum: 1, maximum: 2147483647 };
const note = { type: 'string', maxLength: 1000 };
const categoryFields = {
  includeInStats: { type: 'boolean' },
  name: { type: 'string', minLength: 1, maxLength: 40 },
  color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
  openingDate: date,
  openingBalance: amount,
  historicalPnl: amount,
  note,
};
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required,
});
const idParams = object({ id });

export function registerLedgerRoutes(
  app: FastifyInstance,
  database: AppDatabase,
  clock = today,
  publicOrigin?: string,
) {
  const service = createLedgerService(database, clock);
  const dashboardService = createDashboardService(database, clock);
  const reportService = createReportService(database, clock);
  const periodQuery = object({
    period: { type: 'string', enum: ['day', 'week', 'month', 'year', 'all'] },
    anchor: date,
  });
  app.get<{ Querystring: { period: Period; anchor: string } }>(
    '/api/v1/reports',
    { schema: { querystring: periodQuery } },
    (request) => reportService(request.query.period, request.query.anchor),
  );
  app.get<{ Querystring: { period: Period; anchor: string } }>(
    '/api/v1/dashboard',
    { schema: { querystring: periodQuery } },
    (request) => dashboardService.dashboard(request.query.period, request.query.anchor),
  );
  app.get<{ Params: { id: string }; Querystring: { period: Period; anchor: string } }>(
    '/api/v1/categories/:id/detail',
    { schema: { params: idParams, querystring: periodQuery } },
    (request) =>
      dashboardService.detail(request.params.id, request.query.period, request.query.anchor),
  );
  app.addHook('onRequest', async (request, reply) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) || !request.headers.origin)
      return;
    let allowed: boolean;
    try {
      allowed =
        new URL(request.headers.origin).origin ===
        (publicOrigin ?? new URL(`${request.protocol}://${request.headers.host}`).origin);
    } catch {
      allowed = false;
    }
    if (!allowed)
      return reply
        .code(403)
        .send({ code: 'ORIGIN_DENIED', message: '写入请求必须来自当前应用页面' });
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError || error instanceof LedgerError) {
      return reply.code(error instanceof ApiError ? error.status : 400).send({
        code: error.code,
        message: error.message,
        ...(error.field ? { fields: { [error.field]: error.message } } : {}),
      });
    }
    const failure = error as {
      validation?: { instancePath?: string; params?: { missingProperty?: string } }[];
      statusCode?: number;
    };
    if (failure.validation) {
      const fields: Record<string, string> = {};
      for (const issue of failure.validation)
        fields[
          issue.params?.missingProperty ??
            issue.instancePath?.replace(/^\//, '').replaceAll('/', '.') ??
            'input'
        ] = '请检查此项的格式或长度';
      return reply
        .code(400)
        .send({ code: 'INVALID_REQUEST', message: '提交内容的格式或必填项不正确', fields });
    }
    if (failure.statusCode && failure.statusCode >= 400 && failure.statusCode < 500) {
      return reply
        .code(failure.statusCode)
        .send({ code: 'INVALID_REQUEST', message: '请求格式不正确，请使用JSON提交' });
    }
    request.log.error(error);
    return reply.code(500).send({ code: 'SERVER_ERROR', message: '暂时无法处理请求，请稍后重试' });
  });
  app.get('/api/v1/categories', () => service.listCategories());
  app.post<{ Body: CategoryValues }>(
    '/api/v1/categories',
    {
      schema: {
        body: object(categoryFields, [
          'name',
          'color',
          'openingDate',
          'openingBalance',
          'historicalPnl',
          'note',
        ]),
      },
    },
    (request, reply) => {
      const result = service.createCategory(request.body);
      reply.code(201);
      return result;
    },
  );
  app.patch<{ Params: { id: string }; Body: CategoryPatch }>(
    '/api/v1/categories/:id',
    {
      schema: {
        params: idParams,
        body: object({ ...categoryFields, revision }, ['revision']),
      },
    },
    (request) => service.updateCategory(request.params.id, request.body),
  );
  app.put<{ Body: { items: { id: string; revision: number }[] } }>(
    '/api/v1/categories/order',
    {
      schema: {
        body: object({ items: { type: 'array', minItems: 1, items: object({ id, revision }) } }),
      },
    },
    (request) => service.reorder(request.body.items),
  );
  app.get<{ Params: { id: string } }>(
    '/api/v1/categories/:id/deletion-impact',
    { schema: { params: idParams } },
    (request) => service.deletionImpact(request.params.id),
  );
  app.delete<{ Params: { id: string }; Body: { revision: number; confirm: true } }>(
    '/api/v1/categories/:id',
    { schema: { params: idParams, body: object({ revision, confirm: { const: true } }) } },
    (request) => service.deleteCategory(request.params.id, request.body.revision),
  );
  app.get<{ Querystring: { date: string; categoryId?: string } }>(
    '/api/v1/entries',
    { schema: { querystring: object({ date, categoryId: id }, ['date']) } },
    (request) => service.readDay(request.query.date, request.query.categoryId),
  );
  app.put<{ Body: { date: string; entries: EntryWrite[] } }>(
    '/api/v1/entries/batch',
    {
      schema: {
        body: object({
          date,
          entries: {
            type: 'array',
            minItems: 1,
            items: object(
              {
                liquidationPnl: { anyOf: [amount, { type: 'null' }] },
                categoryId: id,
                categoryRevision: revision,
                revision: { anyOf: [revision, { type: 'null' }] },
                closingBalance: amount,
                buy: amount,
                sell: amount,
                note,
              },
              [
                'categoryId',
                'categoryRevision',
                'revision',
                'closingBalance',
                'buy',
                'sell',
                'note',
              ],
            ),
          },
        }),
      },
    },
    (request) => service.saveEntries(request.body.date, request.body.entries),
  );
  app.delete<{
    Params: { id: string };
    Body: { revision: number; categoryRevision: number; confirm: true };
  }>(
    '/api/v1/entries/:id',
    {
      schema: {
        params: idParams,
        body: object({ revision, categoryRevision: revision, confirm: { const: true } }),
      },
    },
    (request) =>
      service.deleteEntry(request.params.id, request.body.revision, request.body.categoryRevision),
  );
  app.get<{ Querystring: { month: string; categoryId?: string } }>(
    '/api/v1/calendar',
    {
      schema: {
        querystring: object(
          { month: { type: 'string', pattern: '^[0-9]{4}-[0-9]{2}$' }, categoryId: id },
          ['month'],
        ),
      },
    },
    (request) => service.calendar(request.query.month, request.query.categoryId),
  );
}
