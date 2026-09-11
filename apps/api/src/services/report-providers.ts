import { csvDocument, reportFilename } from './report-csv';
import { reportRangeOf, reportSinceOf } from './report-filters';
import { exportRouletteResults } from './roulette-report';
import { exportCatalogInventory } from './catalog-report';
import { firstClassProductsAvailable } from './organization-products';
import { ReportRequestError, type ReportContext, type ReportProvider } from './report-types';

type ApplicationRow = { id: string; name: string; projectName: string; applicationType: string };
type EventRow = { occurredAt: number; event: string; application: string; project: string; id: string };

async function selectedApplication(context: ReportContext): Promise<ApplicationRow> {
  const applicationId = context.query.get('applicationId')?.trim() || '';
  const projectId = context.query.get('projectId')?.trim() || '';
  if (!applicationId) throw new ReportRequestError(400, 'APPLICATION_REQUIRED', 'Seleccioná una aplicación para exportar este reporte.');
  const row = await context.db.prepare(`SELECT a.id,a.name,p.name projectName,COALESCE(a.application_type,'generic') applicationType FROM applications a JOIN projects p ON p.id=a.project_id AND p.organization_id=a.organization_id WHERE a.id=? AND a.organization_id=?${projectId ? ' AND a.project_id=?' : ''}`).bind(...(projectId ? [applicationId, context.organizationId, projectId] : [applicationId, context.organizationId])).first<ApplicationRow>();
  if (!row) throw new ReportRequestError(404, 'NOT_FOUND', 'Aplicación no encontrada.');
  return row;
}

async function exportApplicationActivity(context: ReportContext) {
  const application = await selectedApplication(context);
  const range = reportRangeOf(context.query.get('range'));
  const rows: EventRow[] = [];
  let cursorAt: number | null = null;
  let cursorId: string | null = null;

  while (true) {
    const values: (string | number)[] = [context.organizationId, application.id, reportSinceOf(range)];
    let where = 'e.organization_id=? AND e.application_id=? AND e.occurred_at>=?';
    if (cursorAt !== null && cursorId !== null) {
      where += ' AND (e.occurred_at>? OR (e.occurred_at=? AND e.id>?))';
      values.push(cursorAt, cursorAt, cursorId);
    }
    values.push(500);
    const page = await context.db.prepare(`SELECT e.id,e.occurred_at occurredAt,e.event_name event,a.name application,p.name project FROM events e JOIN applications a ON a.id=e.application_id AND a.organization_id=e.organization_id JOIN projects p ON p.id=e.project_id AND p.organization_id=e.organization_id WHERE ${where} ORDER BY e.occurred_at ASC,e.id ASC LIMIT ?`).bind(...values).all<EventRow>();
    rows.push(...page.results);
    const last = page.results.at(-1);
    if (!last || page.results.length < 500) break;
    cursorAt = last.occurredAt;
    cursorId = last.id;
  }

  const csvRows = rows.map((row) => [new Date(row.occurredAt).toISOString(), row.project, row.application, row.event]);
  return {
    body: csvDocument(['fecha_hora_utc', 'proyecto', 'aplicacion', 'evento'], csvRows),
    filename: reportFilename(application.name, 'actividad'),
    contentType: 'text/csv; charset=utf-8',
    rowCount: rows.length,
    emptyBehavior: 'error' as const,
  };
}

async function rouletteAvailable(context: ReportContext) {
  const applicationId = context.query.get('applicationId')?.trim() || '';
  if (applicationId) {
    const row = await context.db.prepare('SELECT application_type applicationType FROM applications WHERE id=? AND organization_id=?').bind(applicationId, context.organizationId).first<{ applicationType: string }>();
    return row?.applicationType === 'roulette';
  }
  const row = await context.db.prepare("SELECT 1 value FROM applications WHERE organization_id=? AND application_type='roulette' LIMIT 1").bind(context.organizationId).first();
  return Boolean(row);
}

async function catalogAvailable(context: ReportContext) {
  if (await firstClassProductsAvailable(context.db)) {
    const row = await context.db.prepare("SELECT 1 value FROM products WHERE organization_id=? AND status='active' LIMIT 1").bind(context.organizationId).first();
    return Boolean(row);
  }
  const applicationId = context.query.get('applicationId')?.trim() || '';
  if (applicationId) {
    const row = await context.db.prepare('SELECT application_type applicationType FROM applications WHERE id=? AND organization_id=?').bind(applicationId, context.organizationId).first<{ applicationType: string }>();
    return row?.applicationType === 'product-catalog';
  }
  const row = await context.db.prepare("SELECT 1 value FROM applications WHERE organization_id=? AND application_type='product-catalog' LIMIT 1").bind(context.organizationId).first();
  return Boolean(row);
}

export const genericReportProvider: ReportProvider = () => [{
  id: 'analytics.application-activity.csv',
  title: 'Actividad de aplicación',
  description: 'Eventos de una aplicación seleccionada dentro del período elegido.',
  scope: 'application',
  format: 'csv',
  requiresApplication: true,
  emptyBehavior: 'error',
  available: () => true,
  export: exportApplicationActivity,
}];

export const rouletteReportProvider: ReportProvider = () => [{
  id: 'roulette.results.csv',
  title: 'Resultados Roulette',
  description: 'Giros, resultados, claims y bloqueos operativos de una aplicación Roulette.',
  scope: 'application',
  format: 'csv',
  requiresApplication: true,
  applicationTypes: ['roulette'],
  emptyBehavior: 'download',
  available: rouletteAvailable,
  export: exportRouletteResults,
}];

export const catalogReportProvider: ReportProvider = () => [{
  id: 'catalog.inventory.csv',
  title: 'Inventario de productos',
  description: 'Productos, precios, stock y visibilidad de los productos de la organización.',
  scope: 'organization',
  format: 'csv',
  requiresApplication: false,
  emptyBehavior: 'download',
  available: catalogAvailable,
  export: exportCatalogInventory,
}];

export const defaultReportProviders: readonly ReportProvider[] = [genericReportProvider, rouletteReportProvider, catalogReportProvider];

export function reportDefinitions(context: ReportContext, providers: readonly ReportProvider[] = defaultReportProviders) {
  return providers.flatMap((provider) => provider(context));
}

export async function availableReportDefinitions(context: ReportContext, providers: readonly ReportProvider[] = defaultReportProviders) {
  const definitions = reportDefinitions(context, providers);
  const availability = await Promise.all(definitions.map((definition) => definition.available(context)));
  return definitions.filter((_, index) => availability[index]);
}
