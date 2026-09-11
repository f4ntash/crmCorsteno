import { validAssetUrl, type PublishReadinessIssue } from './roulette-config';

export const PRODUCT_CATALOG_TYPE = 'product-catalog';

export type ProductCatalogConfig = {
  schemaVersion: 1;
  title?: string;
  intro?: string;
};

export type CatalogProductInput = {
  name: string;
  description: string;
  priceMinorUnits: number;
  currency: string;
  stock: number;
  visible: boolean;
  mainAssetUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
};

export type CatalogProduct = CatalogProductInput & {
  id: string;
  organizationId: string;
  experienceId: string;
  createdAt: number;
  updatedAt: number;
};

const MAX_NAME = 120;
const MAX_DESCRIPTION = 1000;
const MAX_CTA_LABEL = 80;
const MAX_CTA_URL = 2048;
const MAX_PRICE = 9_000_000_000_000_000;
const MAX_STOCK = 1_000_000_000;

export function createDefaultProductCatalogConfig(): ProductCatalogConfig {
  return { schemaVersion: 1, title: 'Catálogo de productos', intro: '' };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function validExternalUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > MAX_CTA_URL) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function validateProductCatalogDraft(value: unknown): value is ProductCatalogConfig {
  const config = record(value);
  return Boolean(config && config.schemaVersion === 1 &&
    (config.title === undefined || typeof config.title === 'string' && config.title.length <= 120) &&
    (config.intro === undefined || typeof config.intro === 'string' && config.intro.length <= 500));
}

export function productCatalogDraftIssues(value: unknown): PublishReadinessIssue[] {
  if (validateProductCatalogDraft(value)) return [];
  const config = record(value);
  const issues: PublishReadinessIssue[] = [];
  if (!config) return [{ code: 'CONFIG_MISSING', path: 'config', message: 'Falta configurar el catálogo.' }];
  if (config.schemaVersion !== 1) issues.push({ code: 'CONFIG_VERSION', path: 'schemaVersion', message: 'La configuración del catálogo no es compatible.' });
  if (config.title !== undefined && (typeof config.title !== 'string' || config.title.length > 120)) issues.push({ code: 'TITLE_INVALID', path: 'title', message: 'El título debe tener hasta 120 caracteres.' });
  if (config.intro !== undefined && (typeof config.intro !== 'string' || config.intro.length > 500)) issues.push({ code: 'INTRO_INVALID', path: 'intro', message: 'La introducción debe tener hasta 500 caracteres.' });
  return issues.length ? issues : [{ code: 'CONFIG_INVALID', path: 'config', message: 'La configuración del catálogo está incompleta.' }];
}

export function catalogProductIssues(product: Partial<CatalogProductInput>, path = 'products'): PublishReadinessIssue[] {
  const issues: PublishReadinessIssue[] = [];
  if (typeof product.name !== 'string' || !product.name.trim() || product.name.trim().length > MAX_NAME) issues.push({ code: 'PRODUCT_NAME_INVALID', path: `${path}.name`, message: 'Cada producto visible necesita un nombre de hasta 120 caracteres.' });
  if (typeof product.description !== 'string' || product.description.length > MAX_DESCRIPTION) issues.push({ code: 'PRODUCT_DESCRIPTION_INVALID', path: `${path}.description`, message: 'La descripción debe tener hasta 1000 caracteres.' });
  if (typeof product.priceMinorUnits !== 'number' || !Number.isSafeInteger(product.priceMinorUnits) || product.priceMinorUnits < 0 || product.priceMinorUnits > MAX_PRICE) issues.push({ code: 'PRODUCT_PRICE_INVALID', path: `${path}.priceMinorUnits`, message: 'El precio debe ser un entero no negativo en unidades menores.' });
  if (typeof product.currency !== 'string' || !/^[A-Z]{3}$/.test(product.currency)) issues.push({ code: 'PRODUCT_CURRENCY_INVALID', path: `${path}.currency`, message: 'La moneda debe usar un código de tres letras.' });
  if (typeof product.stock !== 'number' || !Number.isInteger(product.stock) || product.stock < 0 || product.stock > MAX_STOCK) issues.push({ code: 'PRODUCT_STOCK_INVALID', path: `${path}.stock`, message: 'El stock debe ser un entero no negativo.' });
  if (product.mainAssetUrl !== null && product.mainAssetUrl !== undefined && !validAssetUrl(product.mainAssetUrl)) issues.push({ code: 'PRODUCT_ASSET_INVALID', path: `${path}.mainAssetUrl`, message: 'La imagen principal debe ser un asset de la organización.' });
  if (product.ctaLabel !== null && product.ctaLabel !== undefined && (typeof product.ctaLabel !== 'string' || product.ctaLabel.length > MAX_CTA_LABEL)) issues.push({ code: 'PRODUCT_CTA_LABEL_INVALID', path: `${path}.ctaLabel`, message: 'El texto del botón debe tener hasta 80 caracteres.' });
  if (product.ctaUrl !== null && product.ctaUrl !== undefined && !validExternalUrl(product.ctaUrl)) issues.push({ code: 'PRODUCT_CTA_URL_INVALID', path: `${path}.ctaUrl`, message: 'El enlace del producto no es válido.' });
  if (typeof product.visible !== 'boolean') issues.push({ code: 'PRODUCT_VISIBILITY_INVALID', path: `${path}.visible`, message: 'La visibilidad del producto no es válida.' });
  return issues;
}

export function catalogProductFromRow(row: Record<string, unknown>): CatalogProduct {
  return {
    id: String(row.id), organizationId: String(row.organizationId), experienceId: String(row.experienceId),
    name: String(row.name), description: String(row.description ?? ''), priceMinorUnits: Number(row.priceMinorUnits),
    currency: String(row.currency ?? 'ARS'), stock: Number(row.stock), visible: Boolean(Number(row.visible)),
    mainAssetUrl: typeof row.mainAssetUrl === 'string' ? row.mainAssetUrl : null,
    ctaLabel: typeof row.ctaLabel === 'string' ? row.ctaLabel : null,
    ctaUrl: typeof row.ctaUrl === 'string' ? row.ctaUrl : null,
    createdAt: Number(row.createdAt), updatedAt: Number(row.updatedAt),
  };
}

export const catalogProductSelect = `SELECT id,organization_id organizationId,experience_id experienceId,name,description,price_minor_units priceMinorUnits,currency,stock,visible,main_asset_url mainAssetUrl,cta_label ctaLabel,cta_url ctaUrl,created_at createdAt,updated_at updatedAt FROM catalog_products`;

export async function validateProductCatalogPublishReadiness(db: D1Database, experienceId: string, organizationId: string, config: unknown): Promise<PublishReadinessIssue[]> {
  const issues = productCatalogDraftIssues(config);
  if (issues.length) return issues;
  const products = await db.prepare(`${catalogProductSelect} WHERE experience_id=? AND organization_id=? AND archived_at IS NULL AND visible=1 ORDER BY created_at ASC,id ASC`).bind(experienceId, organizationId).all<Record<string, unknown>>();
  if (!products.results.length) return [{ code: 'NO_VISIBLE_PRODUCTS', path: 'products', message: 'Agregá al menos un producto visible antes de publicar.' }];
  const productIssues = products.results.flatMap((row, index) => catalogProductIssues(catalogProductFromRow(row), `products[${index}]`));
  const assetIssues = products.results.flatMap((row, index) => typeof row.mainAssetUrl === 'string' && !assetReferencesBelongToOrganization(row.mainAssetUrl, organizationId) ? [{ code: 'PRODUCT_ASSET_ORGANIZATION', path: `products[${index}].mainAssetUrl`, message: 'La imagen principal debe pertenecer a la organización.' }] : []);
  return [...productIssues, ...assetIssues];
}

function assetReferencesBelongToOrganization(value: string, organizationId: string) {
  try { return new URL(value, 'http://localhost').pathname.startsWith(`/assets/organizations/${organizationId}/`); } catch { return false; }
}

export async function publishCatalogSnapshot(db: D1Database, experienceId: string, organizationId: string) {
  const products = await db.prepare(`${catalogProductSelect} WHERE experience_id=? AND organization_id=? AND archived_at IS NULL AND visible=1 ORDER BY created_at ASC,id ASC`).bind(experienceId, organizationId).all<Record<string, unknown>>();
  const now = Date.now();
  const statements = [db.prepare('DELETE FROM catalog_published_products WHERE experience_id=? AND organization_id=?').bind(experienceId, organizationId)];
  statements.push(...products.results.map((row) => db.prepare('INSERT INTO catalog_published_products (id,organization_id,experience_id,source_product_id,name,description,price_minor_units,currency,stock,main_asset_url,cta_label,cta_url,published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), organizationId, experienceId, row.id, row.name, row.description ?? '', row.priceMinorUnits, row.currency, row.stock, row.mainAssetUrl ?? null, row.ctaLabel ?? null, row.ctaUrl ?? null, now)));
  await db.batch(statements);
}

export async function cloneCatalogProducts(db: D1Database, sourceExperienceId: string, organizationId: string, targetExperienceId: string) {
  const rows = await db.prepare(`${catalogProductSelect} WHERE experience_id=? AND organization_id=? AND archived_at IS NULL ORDER BY created_at ASC,id ASC`).bind(sourceExperienceId, organizationId).all<Record<string, unknown>>();
  if (!rows.results.length) return;
  await db.batch(rows.results.map((row) => db.prepare('INSERT INTO catalog_products (id,organization_id,experience_id,name,description,price_minor_units,currency,stock,visible,main_asset_url,cta_label,cta_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), organizationId, targetExperienceId, row.name, row.description ?? '', row.priceMinorUnits, row.currency, row.stock, row.visible, row.mainAssetUrl ?? null, row.ctaLabel ?? null, row.ctaUrl ?? null, Date.now(), Date.now())));
}
