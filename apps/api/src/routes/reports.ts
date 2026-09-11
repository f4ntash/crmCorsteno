import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { requireAuth, requireOrganization, requireOrganizationPermission } from '../auth/middleware';
import type { Env } from '../index';
import { availableReportDefinitions, reportDefinitions } from '../services/report-providers';
import { ReportRequestError, type ReportContext } from '../services/report-types';

type Variables = {
  user: { id: string; email: string; name: string; platformRole: string };
  sessionId: string;
  organization: { id: string; name: string; slug: string; role: string };
};

export const reportsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
reportsRoutes.use('*', requireAuth, requireOrganization);
const reportsRead = requireOrganizationPermission('analytics.read') as unknown as MiddlewareHandler<{ Bindings: Env; Variables: Variables }>;
reportsRoutes.use('*', reportsRead);

function contextFor(c: Parameters<MiddlewareHandler>[0]): ReportContext {
  return { db: c.env.DB, organizationId: c.get('organization').id, query: new URL(c.req.url).searchParams };
}

function errorResponse(c: Parameters<MiddlewareHandler>[0], error: unknown) {
  if (error instanceof ReportRequestError) return c.json({ error: { code: error.code, message: error.message } }, error.status);
  throw error;
}

reportsRoutes.get('/', async (c) => {
  const context = contextFor(c);
  const reports = await availableReportDefinitions(context);
  return c.json({ reports: reports.map((report) => ({ id: report.id, title: report.title, description: report.description, scope: report.scope, format: report.format, requiresApplication: report.requiresApplication, applicationTypes: report.applicationTypes ?? null })) });
});

reportsRoutes.get('/:reportId', async (c) => {
  const context = contextFor(c);
  const definition = reportDefinitions(context).find((report) => report.id === c.req.param('reportId'));
  if (!definition || !(await definition.available(context))) return c.json({ error: { code: 'NOT_FOUND', message: 'Reporte no encontrado.' } }, 404);
  try {
    const file = await definition.export(context);
    if (file.rowCount === 0 && file.emptyBehavior === 'error') throw new ReportRequestError(422, 'NO_DATA', 'No hay datos para exportar en el período seleccionado.');
    return new Response(file.body, { headers: { 'Content-Type': file.contentType, 'Content-Disposition': `attachment; filename="${file.filename}"`, 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(c, error);
  }
});
