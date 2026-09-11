import { csvDocument, reportFilename } from './report-csv';
import { ReportRequestError, type ReportContext, type ReportFile } from './report-types';
import { firstClassProductsAvailable } from './organization-products';

type CatalogApplication = { id: string; name: string; applicationType: string };
type CatalogRow = { name: string; priceMinorUnits: number; currency: string; stock: number; visible: number };

export function catalogInventoryCsv(rows: CatalogRow[]) {
  return csvDocument(['producto', 'precio', 'moneda', 'stock', 'visibilidad'], rows.map((row) => [row.name, (row.priceMinorUnits / 100).toFixed(2), row.currency, row.stock, row.visible ? 'visible' : 'oculto']));
}

export async function exportCatalogInventory(context: ReportContext): Promise<ReportFile> {
  const applicationId = context.query.get('applicationId')?.trim() || '';
  const projectId = context.query.get('projectId')?.trim() || '';
  const firstClass = await firstClassProductsAvailable(context.db);
  const application = applicationId
    ? await context.db.prepare(`SELECT a.id,a.name,a.application_type applicationType FROM applications a JOIN projects p ON p.id=a.project_id AND p.organization_id=a.organization_id WHERE a.id=? AND a.organization_id=?${projectId ? ' AND a.project_id=?' : ''}`).bind(...(projectId ? [applicationId, context.organizationId, projectId] : [applicationId, context.organizationId])).first<CatalogApplication>()
    : null;
  if (applicationId && !application) throw new ReportRequestError(404, 'NOT_FOUND', 'Aplicación no encontrada.');
  if (!firstClass && !applicationId) throw new ReportRequestError(400, 'APPLICATION_REQUIRED', 'Seleccioná una aplicación para exportar este reporte.');
  if (application && application.applicationType !== 'product-catalog') throw new ReportRequestError(422, 'CATALOG_EXPORT_NOT_AVAILABLE', 'La exportación de inventario solo está disponible para catálogos de productos.');
  const rows = await (firstClass
    ? applicationId
      ? context.db.prepare('SELECT p.name,p.price_minor_units priceMinorUnits,p.currency,p.stock,cp.visible FROM products p JOIN catalog_experience_products cp ON cp.product_id=p.id AND cp.organization_id=p.organization_id JOIN experiences e ON e.id=cp.experience_id AND e.organization_id=cp.organization_id AND e.application_id=? WHERE p.organization_id=? AND p.status=\'active\' ORDER BY cp.sort_order ASC,p.id ASC').bind(applicationId, context.organizationId).all<CatalogRow>()
      : context.db.prepare('SELECT p.name,p.price_minor_units priceMinorUnits,p.currency,p.stock,1 visible FROM products p WHERE p.organization_id=? AND p.status=\'active\' ORDER BY p.name COLLATE NOCASE,p.id ASC').bind(context.organizationId).all<CatalogRow>()
    : context.db.prepare('SELECT p.name,p.price_minor_units priceMinorUnits,p.currency,p.stock,p.visible FROM catalog_products p JOIN experiences e ON e.id=p.experience_id AND e.organization_id=p.organization_id AND e.application_id=? WHERE p.organization_id=? AND p.archived_at IS NULL ORDER BY p.sort_order ASC,p.id ASC').bind(applicationId, context.organizationId).all<CatalogRow>());
  return { body: catalogInventoryCsv(rows.results), filename: reportFilename(application?.name ?? 'productos', 'inventario-productos'), contentType: 'text/csv; charset=utf-8', rowCount: rows.results.length, emptyBehavior: 'download' };
}
