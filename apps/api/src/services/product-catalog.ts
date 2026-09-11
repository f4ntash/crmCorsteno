import { assetUrl, SUPPORTED_IMAGE_TYPES } from './assets';
import { validAssetUrl, type PublishReadinessIssue } from './roulette-config';

export const PRODUCT_CATALOG_TYPE = 'product-catalog';
export const MAX_CATALOG_PRODUCT_IMAGES = 6;

export type ProductCatalogConfig = {
  schemaVersion: 1;
  title?: string;
  intro?: string;
};

export type CatalogProductImage = {
  id: string;
  organizationId: string;
  experienceId: string;
  productId: string;
  assetId: string;
  url: string;
  sortOrder: number;
  createdAt: number;
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
  sortOrder: number;
  gallery: CatalogProductImage[];
  createdAt: number;
  updatedAt: number;
};

const MAX_NAME = 120;
const MAX_DESCRIPTION = 1000;
const MAX_CTA_LABEL = 80;
const MAX_CTA_URL = 2048;
const MAX_PRICE = 9_000_000_000_000_000;
const MAX_STOCK = 1_000_000_000;
const ORGANIZATION_ASSET_PATH = /^\/assets\/organizations\/([A-Za-z0-9_-]+)\/assets\/([0-9a-f-]+)\.(png|jpg|jpeg|webp|svg)$/i;

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
    sortOrder: Number(row.sortOrder ?? 0), gallery: Array.isArray(row.gallery) ? row.gallery as CatalogProductImage[] : [],
    createdAt: Number(row.createdAt), updatedAt: Number(row.updatedAt),
  };
}

export function catalogImageFromRow(row: Record<string, unknown>, origin: string): CatalogProductImage {
  return {
    id: String(row.id), organizationId: String(row.organizationId), experienceId: String(row.experienceId),
    productId: String(row.productId), assetId: String(row.assetId),
    url: assetUrl(origin, String(row.storageKey)), sortOrder: Number(row.sortOrder ?? 0), createdAt: Number(row.createdAt),
  };
}

export const catalogProductSelect = `SELECT id,organization_id organizationId,experience_id experienceId,name,description,price_minor_units priceMinorUnits,currency,stock,visible,main_asset_url mainAssetUrl,cta_label ctaLabel,cta_url ctaUrl,sort_order sortOrder,created_at createdAt,updated_at updatedAt FROM catalog_products`;
export const catalogImageSelect = `SELECT i.id,i.organization_id organizationId,i.experience_id experienceId,i.product_id productId,i.asset_id assetId,i.sort_order sortOrder,i.created_at createdAt,a.storage_key storageKey FROM catalog_product_images i JOIN organization_assets a ON a.id=i.asset_id AND a.organization_id=i.organization_id AND a.archived_at IS NULL`;

function organizationAssetId(value: unknown, organizationId: string) {
  if (typeof value !== 'string') return null;
  try {
    const path = new URL(value, 'http://localhost').pathname;
    const match = path.match(ORGANIZATION_ASSET_PATH);
    return match && match[1] === organizationId ? match[2] : null;
  } catch {
    return null;
  }
}

export function catalogAssetIdFromUrl(value: unknown, organizationId: string) {
  return organizationAssetId(value, organizationId);
}

export async function validateProductCatalogPublishReadiness(db: D1Database, experienceId: string, organizationId: string, config: unknown): Promise<PublishReadinessIssue[]> {
  const issues = productCatalogDraftIssues(config);
  if (issues.length) return issues;
  const products = await db.prepare(`${catalogProductSelect} WHERE experience_id=? AND organization_id=? AND archived_at IS NULL AND visible=1 ORDER BY sort_order ASC,id ASC`).bind(experienceId, organizationId).all<Record<string, unknown>>();
  if (!products.results.length) return [{ code: 'NO_VISIBLE_PRODUCTS', path: 'products', message: 'Agregá al menos un producto visible antes de publicar.' }];
  const productIssues = products.results.flatMap((row, index) => catalogProductIssues(catalogProductFromRow(row), `products[${index}]`));
  const galleryIssues = await db.prepare(`SELECT i.id,i.product_id productId,a.id assetId,a.organization_id assetOrganizationId,a.mime_type mimeType FROM catalog_product_images i JOIN catalog_products p ON p.id=i.product_id AND p.experience_id=? AND p.organization_id=? AND p.archived_at IS NULL AND p.visible=1 LEFT JOIN organization_assets a ON a.id=i.asset_id AND a.organization_id=i.organization_id AND a.archived_at IS NULL WHERE i.experience_id=? AND i.organization_id=? ORDER BY i.product_id,i.sort_order,i.id`).bind(experienceId, organizationId, experienceId, organizationId).all<Record<string, unknown>>();
  const invalidGalleryAssets = galleryIssues.results.flatMap((row, index) => typeof row.assetId !== 'string' || row.assetOrganizationId !== organizationId || !SUPPORTED_IMAGE_TYPES.includes(String(row.mimeType) as typeof SUPPORTED_IMAGE_TYPES[number]) ? [{ code: 'PRODUCT_GALLERY_ASSET_INVALID', path: `products.gallery[${index}]`, message: 'Cada imagen de galería debe ser una imagen activa de la organización.' }] : []);
  return [...productIssues, ...invalidGalleryAssets];
}

export async function publishCatalogSnapshot(db: D1Database, experienceId: string, organizationId: string, origin = '') {
  const products = await db.prepare(`${catalogProductSelect} WHERE experience_id=? AND organization_id=? AND archived_at IS NULL AND visible=1 ORDER BY sort_order ASC,id ASC`).bind(experienceId, organizationId).all<Record<string, unknown>>();
  const images = await db.prepare(`${catalogImageSelect} WHERE i.experience_id=? AND i.organization_id=? ORDER BY i.product_id,i.sort_order,i.id`).bind(experienceId, organizationId).all<Record<string, unknown>>();
  const now = Date.now();
  const publishedIds = new Map<string, string>();
  const statements = [
    db.prepare('DELETE FROM catalog_published_product_images WHERE experience_id=? AND organization_id=?').bind(experienceId, organizationId),
    db.prepare('DELETE FROM catalog_published_products WHERE experience_id=? AND organization_id=?').bind(experienceId, organizationId),
  ];
  for (const row of products.results) {
    const publishedId = crypto.randomUUID();
    publishedIds.set(String(row.id), publishedId);
    statements.push(db.prepare('INSERT INTO catalog_published_products (id,organization_id,experience_id,source_product_id,name,description,price_minor_units,currency,stock,sort_order,main_asset_url,cta_label,cta_url,published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(publishedId, organizationId, experienceId, row.id, row.name, row.description ?? '', row.priceMinorUnits, row.currency, row.stock, row.sortOrder ?? 0, row.mainAssetUrl ?? null, row.ctaLabel ?? null, row.ctaUrl ?? null, now));
  }
  for (const row of images.results) {
    const publishedProductId = publishedIds.get(String(row.productId));
    if (!publishedProductId) continue;
    const storedUrl = origin ? assetUrl(origin, String(row.storageKey)) : `/assets/${String(row.storageKey)}`;
    statements.push(db.prepare('INSERT INTO catalog_published_product_images (id,organization_id,experience_id,published_product_id,source_image_id,asset_url,sort_order,published_at) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), organizationId, experienceId, publishedProductId, row.id, storedUrl, row.sortOrder ?? 0, now));
  }
  await db.batch(statements);
}

export async function cloneCatalogProducts(db: D1Database, sourceExperienceId: string, organizationId: string, targetExperienceId: string) {
  const rows = await db.prepare(`${catalogProductSelect} WHERE experience_id=? AND organization_id=? AND archived_at IS NULL ORDER BY sort_order ASC,id ASC`).bind(sourceExperienceId, organizationId).all<Record<string, unknown>>();
  if (!rows.results.length) return;
  const productIds = new Map<string, string>();
  const statements = rows.results.map((row) => {
    const id = crypto.randomUUID();
    productIds.set(String(row.id), id);
    const now = Date.now();
    return db.prepare('INSERT INTO catalog_products (id,organization_id,experience_id,name,description,price_minor_units,currency,stock,sort_order,visible,main_asset_url,cta_label,cta_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, organizationId, targetExperienceId, row.name, row.description ?? '', row.priceMinorUnits, row.currency, row.stock, row.sortOrder ?? 0, row.visible, row.mainAssetUrl ?? null, row.ctaLabel ?? null, row.ctaUrl ?? null, now, now);
  });
  const images = await db.prepare('SELECT id,product_id productId,asset_id assetId,sort_order sortOrder,created_at createdAt FROM catalog_product_images WHERE experience_id=? AND organization_id=? ORDER BY product_id,sort_order,id').bind(sourceExperienceId, organizationId).all<Record<string, unknown>>();
  statements.push(...images.results.flatMap((row) => {
    const productId = productIds.get(String(row.productId));
    if (!productId) return [];
    return [db.prepare('INSERT INTO catalog_product_images (id,organization_id,experience_id,product_id,asset_id,sort_order,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(), organizationId, targetExperienceId, productId, row.assetId, row.sortOrder ?? 0, Date.now())];
  }));
  await db.batch(statements);
}
