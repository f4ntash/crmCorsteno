import { assetUrl, SUPPORTED_IMAGE_TYPES } from './assets';
import { catalogAssetIdFromUrl, catalogProductIssues, MAX_CATALOG_PRODUCT_IMAGES, type CatalogProductInput } from './product-catalog';
import type { PublishReadinessIssue } from './roulette-config';

export type OrganizationProduct = CatalogProductInput & {
  id: string;
  organizationId: string;
  productKey: string;
  status: 'active' | 'archived';
  published: boolean;
  hasUnpublishedChanges: boolean;
  publishedAt: number | null;
  gallery: ProductImage[];
  usages: ProductUsage[];
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
};

export type ProductImage = {
  id: string;
  organizationId: string;
  productId: string;
  assetId: string;
  url: string;
  sortOrder: number;
  createdAt: number;
};

export type ProductUsage = {
  experienceId: string;
  experienceName: string;
  sortOrder: number;
  visible: boolean;
};

export type CatalogAssociationProduct = OrganizationProduct & {
  experienceId: string;
  sortOrder: number;
  visible: boolean;
};

type ProductRow = Record<string, unknown>;

export const productSelectFields = 'SELECT p.id,p.organization_id organizationId,p.product_key productKey,p.name,p.description,p.price_minor_units priceMinorUnits,p.currency,p.stock,p.main_asset_url mainAssetUrl,p.cta_label ctaLabel,p.cta_url ctaUrl,p.status,p.published_content publishedContent,p.published_at publishedAt,p.created_at createdAt,p.updated_at updatedAt,p.archived_at archivedAt';
export const productSelect = `${productSelectFields} FROM products p`;
export const productImageSelect = `SELECT i.id,i.organization_id organizationId,i.product_id productId,i.asset_id assetId,i.sort_order sortOrder,i.created_at createdAt,a.storage_key storageKey FROM product_images i JOIN organization_assets a ON a.id=i.asset_id AND a.organization_id=i.organization_id AND a.archived_at IS NULL`;

export async function firstClassProductsAvailable(db: D1Database) {
  const row = await db.prepare("SELECT 1 value FROM sqlite_master WHERE type='table' AND name='products'").bind().first<{ value: number }>();
  return Boolean(row);
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function parsePublishedProduct(value: unknown) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const parsed = JSON.parse(value);
    return object(parsed);
  } catch {
    return null;
  }
}

function numeric(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

export function productImageFromRow(row: ProductRow, origin: string): ProductImage {
  return {
    id: String(row.id),
    organizationId: String(row.organizationId),
    productId: String(row.productId),
    assetId: String(row.assetId),
    url: assetUrl(origin, String(row.storageKey)),
    sortOrder: numeric(row.sortOrder),
    createdAt: numeric(row.createdAt),
  };
}

function productCoreFromRow(row: ProductRow): CatalogProductInput {
  return {
    name: text(row.name),
    description: text(row.description),
    priceMinorUnits: numeric(row.priceMinorUnits),
    currency: text(row.currency, 'ARS'),
    stock: numeric(row.stock),
    visible: row.visible === undefined ? true : Boolean(Number(row.visible)),
    mainAssetUrl: typeof row.mainAssetUrl === 'string' ? row.mainAssetUrl : null,
    ctaLabel: typeof row.ctaLabel === 'string' ? row.ctaLabel : null,
    ctaUrl: typeof row.ctaUrl === 'string' ? row.ctaUrl : null,
  };
}

export function organizationProductFromRow(row: ProductRow, gallery: ProductImage[] = [], usages: ProductUsage[] = []): OrganizationProduct {
  const core = productCoreFromRow(row);
  const publishedContent = parsePublishedProduct(row.publishedContent);
  return {
    ...core,
    id: String(row.id),
    organizationId: String(row.organizationId),
    productKey: text(row.productKey),
    status: row.status === 'archived' ? 'archived' : 'active',
    published: Boolean(publishedContent),
    hasUnpublishedChanges: Boolean(publishedContent && !publishedProductMatches(core, gallery, publishedContent)),
    publishedAt: row.publishedAt === null || row.publishedAt === undefined ? null : numeric(row.publishedAt),
    gallery,
    usages,
    createdAt: numeric(row.createdAt),
    updatedAt: numeric(row.updatedAt),
    archivedAt: row.archivedAt === null || row.archivedAt === undefined ? null : numeric(row.archivedAt),
  };
}

async function galleryByProduct(db: D1Database, organizationId: string, origin: string, productIds?: readonly string[]) {
  const rows = productIds?.length
    ? await db.prepare(`${productImageSelect} WHERE i.organization_id=? AND i.product_id IN (${productIds.map(() => '?').join(',')}) ORDER BY i.product_id,i.sort_order,i.id`).bind(organizationId, ...productIds).all<ProductRow>()
    : await db.prepare(`${productImageSelect} WHERE i.organization_id=? ORDER BY i.product_id,i.sort_order,i.id`).bind(organizationId).all<ProductRow>();
  const result = new Map<string, ProductImage[]>();
  for (const row of rows.results) result.set(String(row.productId), [...(result.get(String(row.productId)) ?? []), productImageFromRow(row, origin)]);
  return result;
}

async function usagesByProduct(db: D1Database, organizationId: string, productIds?: readonly string[]) {
  const rows = productIds?.length
    ? await db.prepare(`SELECT cp.product_id productId,cp.experience_id experienceId,e.name experienceName,cp.sort_order sortOrder,cp.visible FROM catalog_experience_products cp JOIN experiences e ON e.id=cp.experience_id AND e.organization_id=cp.organization_id WHERE cp.organization_id=? AND cp.product_id IN (${productIds.map(() => '?').join(',')}) ORDER BY cp.product_id,cp.sort_order,cp.id`).bind(organizationId, ...productIds).all<ProductRow>()
    : await db.prepare('SELECT cp.product_id productId,cp.experience_id experienceId,e.name experienceName,cp.sort_order sortOrder,cp.visible FROM catalog_experience_products cp JOIN experiences e ON e.id=cp.experience_id AND e.organization_id=cp.organization_id WHERE cp.organization_id=? ORDER BY cp.product_id,cp.sort_order,cp.id').bind(organizationId).all<ProductRow>();
  const result = new Map<string, ProductUsage[]>();
  for (const row of rows.results) {
    const usage: ProductUsage = { experienceId: String(row.experienceId), experienceName: text(row.experienceName), sortOrder: numeric(row.sortOrder), visible: Boolean(Number(row.visible)) };
    result.set(String(row.productId), [...(result.get(String(row.productId)) ?? []), usage]);
  }
  return result;
}

export async function listOrganizationProducts(db: D1Database, organizationId: string, origin: string, includeArchived = true) {
  const rows = await db.prepare(`${productSelect} WHERE p.organization_id=?${includeArchived ? '' : " AND p.status='active'"} ORDER BY CASE WHEN p.status='active' THEN 0 ELSE 1 END,p.name COLLATE NOCASE,p.id`).bind(organizationId).all<ProductRow>();
  const ids = rows.results.map((row) => String(row.id));
  const [galleries, usages] = await Promise.all([galleryByProduct(db, organizationId, origin, ids), usagesByProduct(db, organizationId, ids)]);
  return rows.results.map((row) => organizationProductFromRow(row, galleries.get(String(row.id)) ?? [], usages.get(String(row.id)) ?? []));
}

export async function getOrganizationProduct(db: D1Database, organizationId: string, productId: string, origin: string) {
  const row = await db.prepare(`${productSelect} WHERE p.id=? AND p.organization_id=?`).bind(productId, organizationId).first<ProductRow>();
  if (!row) return null;
  const [galleries, usages] = await Promise.all([galleryByProduct(db, organizationId, origin, [productId]), usagesByProduct(db, organizationId, [productId])]);
  return organizationProductFromRow(row, galleries.get(productId) ?? [], usages.get(productId) ?? []);
}

export async function validateProductAsset(db: D1Database, value: string | null, organizationId: string, path = 'product.mainAssetUrl'): Promise<PublishReadinessIssue | null> {
  if (!value) return null;
  const assetId = catalogAssetIdFromUrl(value, organizationId);
  if (!assetId) return { code: 'PRODUCT_ASSET_INVALID', path, message: 'La imagen principal debe ser un asset de imagen de la organización.' };
  const asset = await db.prepare('SELECT mime_type mimeType FROM organization_assets WHERE id=? AND organization_id=? AND archived_at IS NULL').bind(assetId, organizationId).first<{ mimeType: string }>();
  return asset && SUPPORTED_IMAGE_TYPES.includes(asset.mimeType as typeof SUPPORTED_IMAGE_TYPES[number]) ? null : { code: 'PRODUCT_ASSET_INVALID', path, message: 'La imagen principal debe ser una imagen activa de la organización.' };
}

export async function productIssues(value: Partial<CatalogProductInput>, path = 'product') {
  return catalogProductIssues(value, path);
}

function productSnapshot(value: CatalogProductInput, gallery: ProductImage[] = []) {
  return {
    name: value.name,
    description: value.description,
    priceMinorUnits: value.priceMinorUnits,
    currency: value.currency,
    stock: value.stock,
    mainAssetUrl: value.mainAssetUrl,
    ctaLabel: value.ctaLabel,
    ctaUrl: value.ctaUrl,
    // Older migrated snapshots do not have this optional field. They remain
    // compatible and are considered clean until the product is published once.
    gallery: gallery.map((image) => ({ assetId: image.assetId, sortOrder: image.sortOrder })),
  };
}

function publishedProductMatches(value: CatalogProductInput, gallery: ProductImage[], snapshot: Record<string, unknown>) {
  const matches = ['name', 'description', 'priceMinorUnits', 'currency', 'stock', 'mainAssetUrl', 'ctaLabel', 'ctaUrl']
    .every((key) => snapshot[key] === value[key as keyof CatalogProductInput]);
  if (!matches || !Array.isArray(snapshot.gallery)) return matches;
  const publishedGallery = snapshot.gallery.filter((item): item is { assetId: string; sortOrder: number } => Boolean(item && typeof item === 'object' && typeof (item as { assetId?: unknown }).assetId === 'string' && typeof (item as { sortOrder?: unknown }).sortOrder === 'number'));
  return publishedGallery.length === gallery.length && publishedGallery.every((image, index) => image.assetId === gallery[index]?.assetId && image.sortOrder === gallery[index]?.sortOrder);
}

function publishedContent(value: CatalogProductInput, gallery: ProductImage[] = []) {
  return JSON.stringify(productSnapshot(value, gallery));
}

export async function createOrganizationProduct(db: D1Database, organizationId: string, value: CatalogProductInput, origin: string, publishInitial = false) {
  const id = crypto.randomUUID();
  const now = Date.now();
  const content = publishInitial ? publishedContent(value) : null;
  await db.prepare('INSERT INTO products (id,organization_id,product_key,name,description,price_minor_units,currency,stock,main_asset_url,cta_label,cta_url,status,published_content,published_at,created_at,updated_at,archived_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,\'active\',?,?,?, ?,NULL)')
    .bind(id, organizationId, `product-${id}`, value.name, value.description, value.priceMinorUnits, value.currency, value.stock, value.mainAssetUrl, value.ctaLabel, value.ctaUrl, content, publishInitial ? now : null, now, now).run();
  return getOrganizationProduct(db, organizationId, id, origin);
}

export async function updateOrganizationProduct(db: D1Database, organizationId: string, productId: string, current: OrganizationProduct, changes: Partial<CatalogProductInput>, origin: string) {
  const merged = { ...current, ...changes } as CatalogProductInput;
  const fields: string[] = [];
  const values: unknown[] = [];
  const columns: Record<string, keyof CatalogProductInput> = { name: 'name', description: 'description', priceMinorUnits: 'priceMinorUnits', currency: 'currency', stock: 'stock', mainAssetUrl: 'mainAssetUrl', ctaLabel: 'ctaLabel', ctaUrl: 'ctaUrl' };
  for (const [column, key] of Object.entries(columns)) if (key in changes) { fields.push(`${column === 'priceMinorUnits' ? 'price_minor_units' : column === 'mainAssetUrl' ? 'main_asset_url' : column === 'ctaLabel' ? 'cta_label' : column === 'ctaUrl' ? 'cta_url' : column}=?`); values.push(merged[key]); }
  if (!fields.length) return current;
  fields.push('updated_at=?');
  values.push(Date.now(), productId, organizationId);
  await db.prepare(`UPDATE products SET ${fields.join(',')} WHERE id=? AND organization_id=? AND status='active'`).bind(...values).run();
  return getOrganizationProduct(db, organizationId, productId, origin);
}

export async function publishOrganizationProduct(db: D1Database, organizationId: string, product: OrganizationProduct, origin: string) {
  const issues = await productIssues(product);
  const assetIssue = await validateProductAsset(db, product.mainAssetUrl, organizationId);
  if (assetIssue) issues.push(assetIssue);
  if (issues.length) return { product: null, issues };
  const now = Date.now();
  const snapshot = publishedContent(product, product.gallery);
  const statements = [
    db.prepare('UPDATE products SET published_content=?,published_at=?,updated_at=? WHERE id=? AND organization_id=? AND status=\'active\'').bind(snapshot, now, now, product.id, organizationId),
    db.prepare('DELETE FROM product_published_images WHERE product_id=? AND organization_id=?').bind(product.id, organizationId),
  ];
  product.gallery.forEach((image) => statements.push(db.prepare('INSERT INTO product_published_images (id,organization_id,product_id,asset_url,sort_order,published_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(), organizationId, product.id, image.url.startsWith('http') ? image.url : `${origin}${image.url}`, image.sortOrder, now)));
  await db.batch(statements);
  return { product: await getOrganizationProduct(db, organizationId, product.id, origin), issues: [] as PublishReadinessIssue[] };
}

export async function archiveOrganizationProduct(db: D1Database, organizationId: string, productId: string) {
  const now = Date.now();
  const result = await db.prepare("UPDATE products SET status='archived',archived_at=?,updated_at=? WHERE id=? AND organization_id=? AND status='active'").bind(now, now, productId, organizationId).run();
  return Boolean(result.meta?.changes);
}

export async function adjustOrganizationProductStock(db: D1Database, organizationId: string, product: OrganizationProduct, delta: number, origin: string) {
  const after = product.stock + delta;
  if (after < 0) return { product: null, error: 'El stock no puede quedar negativo.' };
  const published = parsePublishedProduct((await db.prepare('SELECT published_content publishedContent FROM products WHERE id=? AND organization_id=?').bind(product.id, organizationId).first<{ publishedContent: string | null }>())?.publishedContent);
  if (published) published.stock = after;
  await db.prepare('UPDATE products SET stock=?,published_content=?,updated_at=? WHERE id=? AND organization_id=? AND status=\'active\'').bind(after, published ? JSON.stringify(published) : null, Date.now(), product.id, organizationId).run();
  return { product: await getOrganizationProduct(db, organizationId, product.id, origin), error: null };
}

export async function listCatalogProductsFirstClass(db: D1Database, experienceId: string, organizationId: string, origin: string) {
  const rows = await db.prepare(`${productSelectFields},cp.experience_id experienceId,cp.sort_order sortOrder,cp.visible FROM catalog_experience_products cp JOIN products p ON p.id=cp.product_id AND p.organization_id=cp.organization_id WHERE cp.experience_id=? AND cp.organization_id=? ORDER BY cp.sort_order,cp.id`).bind(experienceId, organizationId).all<ProductRow>();
  const ids = rows.results.map((row) => String(row.id));
  const galleries = await galleryByProduct(db, organizationId, origin, ids);
  return rows.results.map((row) => ({ ...organizationProductFromRow(row, galleries.get(String(row.id)) ?? []), experienceId, sortOrder: numeric(row.sortOrder), visible: Boolean(Number(row.visible)) }));
}

export async function catalogAssociationProduct(db: D1Database, experienceId: string, organizationId: string, productId: string, origin: string) {
  const rows = await db.prepare(`${productSelectFields},cp.experience_id experienceId,cp.sort_order sortOrder,cp.visible FROM catalog_experience_products cp JOIN products p ON p.id=cp.product_id AND p.organization_id=cp.organization_id WHERE cp.experience_id=? AND cp.organization_id=? AND cp.product_id=?`).bind(experienceId, organizationId, productId).all<ProductRow>();
  if (!rows.results[0]) return null;
  const galleries = await galleryByProduct(db, organizationId, origin, [productId]);
  const row = rows.results[0];
  return { ...organizationProductFromRow(row, galleries.get(productId) ?? []), experienceId, sortOrder: numeric(row.sortOrder), visible: Boolean(Number(row.visible)) } as CatalogAssociationProduct;
}

export async function catalogAssociationsChanged(db: D1Database, experienceId: string, organizationId: string) {
  const current = await db.prepare('SELECT COUNT(*) count,MAX(updated_at) updatedAt FROM catalog_experience_products WHERE experience_id=? AND organization_id=?').bind(experienceId, organizationId).first<{ count: number; updatedAt: number | null }>();
  const published = await db.prepare('SELECT COUNT(*) count,MAX(published_at) publishedAt FROM catalog_published_experience_products WHERE experience_id=? AND organization_id=?').bind(experienceId, organizationId).first<{ count: number; publishedAt: number | null }>();
  return published?.publishedAt === null || published?.publishedAt === undefined || Number(current?.count ?? 0) !== Number(published.count ?? 0) || Number(current?.updatedAt ?? 0) > Number(published.publishedAt);
}

export async function linkProductToCatalog(db: D1Database, experienceId: string, organizationId: string, productId: string, visible: boolean, origin: string) {
  const product = await getOrganizationProduct(db, organizationId, productId, origin);
  if (!product || product.status !== 'active') return null;
  const existing = await db.prepare('SELECT id FROM catalog_experience_products WHERE experience_id=? AND organization_id=? AND product_id=?').bind(experienceId, organizationId, productId).first();
  if (existing) return catalogAssociationProduct(db, experienceId, organizationId, productId, origin);
  const order = await db.prepare('SELECT COALESCE(MAX(sort_order),-1)+1 sortOrder FROM catalog_experience_products WHERE experience_id=? AND organization_id=?').bind(experienceId, organizationId).first<{ sortOrder: number }>();
  const now = Date.now();
  await db.prepare('INSERT INTO catalog_experience_products (id,organization_id,experience_id,product_id,sort_order,visible,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), organizationId, experienceId, productId, numeric(order?.sortOrder), visible ? 1 : 0, now, now).run();
  return catalogAssociationProduct(db, experienceId, organizationId, productId, origin);
}

export async function unlinkProductFromCatalog(db: D1Database, experienceId: string, organizationId: string, productId: string) {
  const result = await db.prepare('DELETE FROM catalog_experience_products WHERE experience_id=? AND organization_id=? AND product_id=?').bind(experienceId, organizationId, productId).run();
  return Boolean(result.meta?.changes);
}

export async function reorderCatalogProductsFirstClass(db: D1Database, experienceId: string, organizationId: string, productIds: readonly string[], origin = '') {
  const statements = productIds.map((productId, sortOrder) => db.prepare('UPDATE catalog_experience_products SET sort_order=?,updated_at=? WHERE experience_id=? AND organization_id=? AND product_id=?').bind(sortOrder, Date.now(), experienceId, organizationId, productId));
  await db.batch(statements);
  return listCatalogProductsFirstClass(db, experienceId, organizationId, origin);
}

export async function updateCatalogAssociationFirstClass(db: D1Database, experienceId: string, organizationId: string, productId: string, changes: { visible?: boolean }, origin: string) {
  if (changes.visible === undefined) return catalogAssociationProduct(db, experienceId, organizationId, productId, origin);
  await db.prepare('UPDATE catalog_experience_products SET visible=?,updated_at=? WHERE experience_id=? AND organization_id=? AND product_id=?').bind(changes.visible ? 1 : 0, Date.now(), experienceId, organizationId, productId).run();
  return catalogAssociationProduct(db, experienceId, organizationId, productId, origin);
}

export async function publishCatalogFirstClass(db: D1Database, experienceId: string, organizationId: string) {
  const rows = await db.prepare('SELECT product_id productId,sort_order sortOrder,visible FROM catalog_experience_products WHERE experience_id=? AND organization_id=? ORDER BY sort_order,id').bind(experienceId, organizationId).all<{ productId: string; sortOrder: number; visible: number }>();
  const now = Date.now();
  const statements = [db.prepare('DELETE FROM catalog_published_experience_products WHERE experience_id=? AND organization_id=?').bind(experienceId, organizationId)];
  for (const row of rows.results) statements.push(db.prepare('INSERT INTO catalog_published_experience_products (id,organization_id,experience_id,product_id,sort_order,visible,published_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(), organizationId, experienceId, row.productId, row.sortOrder, row.visible, now));
  await db.batch(statements);
}

export async function publishedCatalogProductsFirstClass(db: D1Database, experienceId: string, organizationId: string) {
  const rows = await db.prepare('SELECT p.id,p.organization_id organizationId,p.product_key productKey,p.name,p.description,p.price_minor_units priceMinorUnits,p.currency,p.stock,p.main_asset_url mainAssetUrl,p.cta_label ctaLabel,p.cta_url ctaUrl,p.status,p.published_content publishedContent,p.published_at publishedAt,p.created_at createdAt,p.updated_at updatedAt,p.archived_at archivedAt,cp.sort_order sortOrder,cp.visible FROM catalog_published_experience_products cp JOIN products p ON p.id=cp.product_id AND p.organization_id=cp.organization_id WHERE cp.experience_id=? AND cp.organization_id=? AND cp.visible=1 AND p.status=\'active\' ORDER BY cp.sort_order,cp.id').bind(experienceId, organizationId).all<ProductRow>();
  const ids = rows.results.map((row) => String(row.id));
  const images = ids.length ? await db.prepare('SELECT product_id productId,asset_url assetUrl,sort_order sortOrder,id FROM product_published_images WHERE organization_id=? AND product_id IN (' + ids.map(() => '?').join(',') + ') ORDER BY product_id,sort_order,id').bind(organizationId, ...ids).all<ProductRow>() : { results: [] as ProductRow[] };
  const galleries = new Map<string, string[]>();
  for (const image of images.results) if (typeof image.assetUrl === 'string') galleries.set(String(image.productId), [...(galleries.get(String(image.productId)) ?? []), image.assetUrl]);
  return rows.results.map((row) => {
    const published = parsePublishedProduct(row.publishedContent) ?? productCoreFromRow(row) as unknown as Record<string, unknown>;
    return { name: text(published.name, text(row.name)), description: text(published.description, text(row.description)), priceMinorUnits: numeric(published.priceMinorUnits, numeric(row.priceMinorUnits)), currency: text(published.currency, text(row.currency, 'ARS')), stock: numeric(published.stock, numeric(row.stock)), mainImageUrl: typeof published.mainAssetUrl === 'string' ? published.mainAssetUrl : typeof row.mainAssetUrl === 'string' ? row.mainAssetUrl : null, gallery: galleries.get(String(row.id)) ?? [], ctaLabel: typeof published.ctaLabel === 'string' ? published.ctaLabel : typeof row.ctaLabel === 'string' ? row.ctaLabel : null, ctaUrl: typeof published.ctaUrl === 'string' ? published.ctaUrl : typeof row.ctaUrl === 'string' ? row.ctaUrl : null };
  });
}

export async function organizationProductGalleryCount(db: D1Database, organizationId: string, productId: string) {
  const row = await db.prepare('SELECT COUNT(*) count FROM product_images WHERE organization_id=? AND product_id=?').bind(organizationId, productId).first<{ count: number }>();
  return numeric(row?.count);
}

export { MAX_CATALOG_PRODUCT_IMAGES };
