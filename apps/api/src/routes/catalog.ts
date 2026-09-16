import { Hono } from 'hono';
import type { Context } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { requireAuth, requireOrganization, requireOrganizationPermission } from '../auth/middleware';
import type { Env } from '../index';
import { recordActivityBestEffort } from '../services/activity';
import { catalogAssetIdFromUrl, catalogImageFromRow, catalogImageSelect, catalogProductFromRow, catalogProductIssues, catalogProductSelect, MAX_CATALOG_PRODUCT_IMAGES, PRODUCT_CATALOG_TYPE, type CatalogProductInput } from '../services/product-catalog';
import { validAssetUrl } from '../services/roulette-config';
import { SUPPORTED_IMAGE_TYPES } from '../services/assets';
import { normalizeCatalogCtaUrl } from '@corsteno/types';
import {
  catalogAssociationProduct,
  catalogAssociationsChanged,
  adjustOrganizationProductStock,
  archiveOrganizationProduct,
  createOrganizationProduct,
  firstClassProductsAvailable,
  linkProductToCatalog,
  listCatalogProductsFirstClass,
  organizationProductGalleryCount,
  productImageFromRow,
  productImageSelect,
  reorderCatalogProductsFirstClass,
  updateCatalogAssociationFirstClass,
  updateOrganizationProduct,
} from '../services/organization-products';

type Variables = {
  user: { id: string; email: string; name: string; platformRole: string };
  sessionId: string;
  organization: { id: string; name: string; slug: string; role: string };
};
type CatalogContext = Context<{ Bindings: Env; Variables: Variables }>;

export const catalogRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
catalogRoutes.use('*', requireAuth, requireOrganization);

const read = requireOrganizationPermission('crm.read') as unknown as MiddlewareHandler<{ Bindings: Env; Variables: Variables }>;
const manage = requireOrganizationPermission('crm.manage') as unknown as MiddlewareHandler<{ Bindings: Env; Variables: Variables }>;

function error(message: string, code = 'BAD_REQUEST', issues?: unknown[]) {
  return { error: { code, message, ...(issues?.length ? { issues } : {}) } };
}

async function requestBody(c: CatalogContext) {
  try {
    const body = await c.req.json() as unknown;
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function catalogExperience(c: CatalogContext) {
  return c.env.DB.prepare('SELECT id,name,type FROM experiences WHERE id=? AND organization_id=? AND type=?').bind(c.req.param('id'), c.get('organization').id, PRODUCT_CATALOG_TYPE).first<{ id: string; name: string; type: string }>();
}

async function catalogProduct(c: CatalogContext, productId = c.req.param('productId')) {
  const experience = await catalogExperience(c);
  if (!experience) return { experience: null, product: null };
  const product = await c.env.DB.prepare(`${catalogProductSelect} WHERE id=? AND experience_id=? AND organization_id=? AND archived_at IS NULL`).bind(productId, experience.id, c.get('organization').id).first<Record<string, unknown>>();
  return { experience, product };
}

async function canonicalCatalogProduct(c: CatalogContext, productId = c.req.param('productId')) {
  if (!await firstClassProductsAvailable(c.env.DB)) return { experience: null, product: null };
  const experience = await catalogExperience(c);
  if (!experience) return { experience: null, product: null };
  if (!productId) return { experience, product: null };
  return { experience, product: await catalogAssociationProduct(c.env.DB, experience.id, c.get('organization').id, productId, new URL(c.req.url).origin) };
}

async function productImages(c: CatalogContext, productId: string) {
  const rows = await c.env.DB.prepare(`${catalogImageSelect} WHERE i.product_id=? AND i.experience_id=? AND i.organization_id=? ORDER BY i.sort_order ASC,i.id ASC`).bind(productId, c.req.param('id'), c.get('organization').id).all<Record<string, unknown>>();
  return rows.results.map((row) => catalogImageFromRow(row, new URL(c.req.url).origin));
}

async function catalogProducts(c: CatalogContext, experienceId: string, organizationId: string) {
  const [rows, images] = await Promise.all([
    c.env.DB.prepare(`${catalogProductSelect} WHERE experience_id=? AND organization_id=? AND archived_at IS NULL ORDER BY sort_order ASC,id ASC`).bind(experienceId, organizationId).all<Record<string, unknown>>(),
    c.env.DB.prepare(`${catalogImageSelect} WHERE i.experience_id=? AND i.organization_id=? ORDER BY i.product_id,i.sort_order,i.id`).bind(experienceId, organizationId).all<Record<string, unknown>>(),
  ]);
  const byProduct = new Map<string, ReturnType<typeof catalogImageFromRow>[]>();
  for (const row of images.results) {
    const id = String(row.productId);
    byProduct.set(id, [...(byProduct.get(id) ?? []), catalogImageFromRow(row, new URL(c.req.url).origin)]);
  }
  return rows.results.map((row) => ({ ...catalogProductFromRow(row), gallery: byProduct.get(String(row.id)) ?? [] }));
}

function optionalString(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  return typeof value === 'string' ? value.trim() : value;
}

function productFromBody(body: Record<string, unknown>, partial = false): Record<string, unknown> | null {
  const result: Record<string, unknown> = {};
  if (!partial || 'name' in body) {
    result.name = typeof body.name === 'string' ? body.name.trim() : body.name ?? '';
  }
  if (!partial || 'description' in body) {
    const description = optionalString(body.description);
    result.description = description ?? '';
  }
  if (!partial || 'priceMinorUnits' in body || 'price_minor_units' in body) {
    const value = 'priceMinorUnits' in body ? body.priceMinorUnits : body.price_minor_units;
    result.priceMinorUnits = value === undefined && !partial ? 0 : value;
  }
  if (!partial || 'currency' in body) {
    if (body.currency === undefined && !partial) result.currency = 'ARS';
    else result.currency = typeof body.currency === 'string' ? body.currency.trim().toUpperCase() : body.currency;
  }
  if (!partial || 'priceUnit' in body || 'price_unit' in body) {
    const value = 'priceUnit' in body ? body.priceUnit : body.price_unit;
    result.priceUnit = optionalString(value);
  }
  if (!partial || 'metadata' in body) result.metadata = body.metadata ?? null;
  if (!partial || 'stock' in body) {
    if (body.stock === undefined && !partial) result.stock = 0;
    else result.stock = body.stock;
  }
  if (!partial || 'visible' in body) {
    if (body.visible === undefined && !partial) result.visible = true;
    else result.visible = body.visible;
  }
  if (!partial || 'mainAssetUrl' in body || 'main_asset_url' in body) {
    const value = 'mainAssetUrl' in body ? body.mainAssetUrl : body.main_asset_url;
    result.mainAssetUrl = value === null || value === undefined || value === '' ? null : typeof value === 'string' ? value.trim() : value;
  }
  if (!partial || 'ctaLabel' in body || 'cta_label' in body) {
    const value = 'ctaLabel' in body ? body.ctaLabel : body.cta_label;
    result.ctaLabel = optionalString(value);
  }
  if (!partial || 'ctaUrl' in body || 'cta_url' in body) {
    const raw = 'ctaUrl' in body ? body.ctaUrl : body.cta_url;
    result.ctaUrl = normalizeCatalogCtaUrl(raw) ?? (raw === null || raw === undefined || raw === '' ? null : raw);
  }
  return result;
}

function completeProduct(value: Record<string, unknown>): CatalogProductInput {
  return {
    name: (value.name ?? '') as string, description: (value.description ?? '') as string, priceMinorUnits: (value.priceMinorUnits ?? 0) as number,
    currency: (value.currency ?? 'ARS') as string, stock: (value.stock ?? 0) as number, visible: (value.visible ?? true) as boolean,
    priceUnit: (value.priceUnit ?? null) as string | null, metadata: (value.metadata ?? null) as CatalogProductInput['metadata'],
    mainAssetUrl: (value.mainAssetUrl ?? null) as string | null, ctaLabel: (value.ctaLabel ?? null) as string | null, ctaUrl: normalizeCatalogCtaUrl(value.ctaUrl) ?? (value.ctaUrl ?? null) as string | null,
  };
}

function assetBelongsToOrganization(value: string | null, organizationId: string) {
  if (!value) return true;
  try { return new URL(value, 'http://localhost').pathname.startsWith(`/assets/organizations/${organizationId}/`); } catch { return false; }
}

async function organizationImageAsset(c: CatalogContext, value: unknown) {
  const organizationId = c.get('organization').id;
  const assetId = catalogAssetIdFromUrl(value, organizationId);
  if (!assetId) return null;
  return c.env.DB.prepare('SELECT id,storage_key storageKey,mime_type mimeType FROM organization_assets WHERE id=? AND organization_id=? AND archived_at IS NULL').bind(assetId, organizationId).first<{ id: string; storageKey: string; mimeType: string }>();
}

async function productMainAssetIssue(c: CatalogContext, value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const organizationId = c.get('organization').id;
  if (!assetBelongsToOrganization(typeof value === 'string' ? value : null, organizationId)) {
    return { code: 'PRODUCT_ASSET_ORGANIZATION', path: 'mainAssetUrl', message: 'La imagen principal debe pertenecer a la organización.' };
  }
  if (!validAssetUrl(value)) return null;
  const asset = await organizationImageAsset(c, value);
  return asset && SUPPORTED_IMAGE_TYPES.includes(asset.mimeType as typeof SUPPORTED_IMAGE_TYPES[number])
    ? null
    : { code: 'PRODUCT_ASSET_INVALID', path: 'mainAssetUrl', message: 'La imagen principal debe ser una imagen activa de la organización.' };
}

catalogRoutes.get('/:id/catalog-products', read, async (c) => {
  if (!await catalogExperience(c)) return c.json(error('Catálogo no encontrado.', 'NOT_FOUND'), 404);
  const experienceId = c.req.param('id');
  const organizationId = c.get('organization').id;
  if (await firstClassProductsAvailable(c.env.DB)) return c.json({ items: await listCatalogProductsFirstClass(c.env.DB, experienceId, organizationId, new URL(c.req.url).origin), hasUnpublishedChanges: await catalogAssociationsChanged(c.env.DB, experienceId, organizationId) });
  const [items, published] = await Promise.all([
    catalogProducts(c, experienceId, organizationId),
    c.env.DB.prepare('SELECT MAX(published_at) publishedAt FROM catalog_published_products WHERE experience_id=? AND organization_id=?').bind(experienceId, organizationId).first<{ publishedAt: number | null }>(),
  ]);
  const latest = items.reduce((value, row) => Math.max(value, Number(row.updatedAt) || 0), 0);
  return c.json({ items, hasUnpublishedChanges: published?.publishedAt === null || published?.publishedAt === undefined || latest > Number(published.publishedAt) });
});

catalogRoutes.post('/:id/catalog-products/reorder', manage, async (c) => {
  if (!await catalogExperience(c)) return c.json(error('Catálogo no encontrado.', 'NOT_FOUND'), 404);
  let body: { productIds?: unknown };
  try { body = await c.req.json(); } catch { return c.json(error('El cuerpo de la solicitud no es válido.'), 400); }
  if (!Array.isArray(body.productIds) || body.productIds.some((id) => typeof id !== 'string') || new Set(body.productIds).size !== body.productIds.length) return c.json(error('El orden de productos no es válido.', 'VALIDATION_ERROR'), 400);
  const organizationId = c.get('organization').id;
  const experienceId = c.req.param('id');
  if (await firstClassProductsAvailable(c.env.DB)) {
    const current = await listCatalogProductsFirstClass(c.env.DB, experienceId, organizationId, new URL(c.req.url).origin);
    const currentIds = current.map((row) => row.id);
    if (body.productIds.length !== currentIds.length || body.productIds.some((id) => !currentIds.includes(id as string))) return c.json(error('El orden debe incluir todos los productos activos.', 'VALIDATION_ERROR'), 400);
    const items = await reorderCatalogProductsFirstClass(c.env.DB, experienceId, organizationId, body.productIds as string[], new URL(c.req.url).origin);
    await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'catalog.product.reordered', resourceType: 'experience', resourceId: experienceId, metadata: { productCount: body.productIds.length } });
    return c.json({ items });
  }
  const current = await c.env.DB.prepare(`${catalogProductSelect} WHERE experience_id=? AND organization_id=? AND archived_at IS NULL ORDER BY sort_order ASC,id ASC`).bind(experienceId, organizationId).all<Record<string, unknown>>();
  const currentIds = current.results.map((row) => String(row.id));
  if (body.productIds.length !== currentIds.length || body.productIds.some((id) => !currentIds.includes(id as string))) return c.json(error('El orden debe incluir todos los productos activos.', 'VALIDATION_ERROR'), 400);
  const now = Date.now();
  await c.env.DB.batch((body.productIds as string[]).map((productId, sortOrder) => c.env.DB.prepare('UPDATE catalog_products SET sort_order=?,updated_at=? WHERE id=? AND experience_id=? AND organization_id=? AND archived_at IS NULL').bind(sortOrder, now, productId, experienceId, organizationId)));
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'catalog.product.reordered', resourceType: 'experience', resourceId: experienceId, metadata: { productCount: body.productIds.length } });
  return c.json({ items: await catalogProducts(c, experienceId, organizationId) });
});

catalogRoutes.post('/:id/catalog-products', manage, async (c) => {
  const experience = await catalogExperience(c);
  if (!experience) return c.json(error('Catálogo no encontrado.', 'NOT_FOUND'), 404);
  const body = await requestBody(c);
  if (!body) return c.json(error('El cuerpo de la solicitud no es válido.'), 400);
  const linkingExistingProduct = typeof body.productId === 'string' && body.productId.trim().length > 0;
  const value = linkingExistingProduct ? null : productFromBody(body);
  const product = value ? completeProduct(value) : null;
  const issues = linkingExistingProduct ? [] : product ? catalogProductIssues(product) : [{ code: 'PRODUCT_INVALID', path: 'product', message: 'Los datos del producto no son válidos.' }];
  if (product && !issues.some((issue) => issue.path.endsWith('.mainAssetUrl'))) {
    const assetIssue = await productMainAssetIssue(c, product.mainAssetUrl);
    if (assetIssue) issues.push(assetIssue);
  }
  if (issues.length) return c.json(error('Revisá los datos del producto.', 'VALIDATION_ERROR', issues), 400);
  const organizationId = c.get('organization').id;
  const complete = product!;
  if (await firstClassProductsAvailable(c.env.DB)) {
    const created = await (async () => {
      if (typeof body.productId === 'string') return linkProductToCatalog(c.env.DB, experience.id, organizationId, body.productId, body.visible !== false, new URL(c.req.url).origin);
      const product = await createOrganizationProduct(c.env.DB, organizationId, complete, new URL(c.req.url).origin, true);
      return product ? linkProductToCatalog(c.env.DB, experience.id, organizationId, product.id, complete.visible, new URL(c.req.url).origin) : null;
    })();
    if (!created) return c.json(error('El producto no existe o no se pudo agregar al catálogo.', 'NOT_FOUND'), 404);
    await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'catalog.product.linked', resourceType: 'product', resourceId: created.id, metadata: { experienceId: experience.id, name: created.name } });
    return c.json(created, 201);
  }
  const order = await c.env.DB.prepare('SELECT COALESCE(MAX(sort_order),-1)+1 sortOrder FROM catalog_products WHERE experience_id=? AND organization_id=?').bind(experience.id, organizationId).first<{ sortOrder: number }>();
  const now = Date.now();
  const id = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO catalog_products (id,organization_id,experience_id,name,description,price_minor_units,currency,price_unit,metadata,stock,sort_order,visible,main_asset_url,cta_label,cta_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, organizationId, experience.id, complete.name, complete.description, complete.priceMinorUnits, complete.currency, complete.priceUnit ?? null, complete.metadata ? JSON.stringify(complete.metadata) : null, complete.stock, Number(order?.sortOrder ?? 0), complete.visible ? 1 : 0, complete.mainAssetUrl, complete.ctaLabel, complete.ctaUrl, now, now).run();
  const row = await c.env.DB.prepare(`${catalogProductSelect} WHERE id=? AND organization_id=?`).bind(id, organizationId).first<Record<string, unknown>>();
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'catalog.product.created', resourceType: 'catalog_product', resourceId: id, metadata: { experienceId: experience.id, name: complete.name.slice(0, 120) } });
  return c.json(catalogProductFromRow(row ?? { id, organizationId, experienceId: experience.id, ...complete, sortOrder: Number(order?.sortOrder ?? 0), createdAt: now, updatedAt: now }), 201);
});

catalogRoutes.get('/:id/catalog-products/:productId/images', read, async (c) => {
  if (await firstClassProductsAvailable(c.env.DB)) {
    const { experience, product } = await canonicalCatalogProduct(c);
    if (!experience || !product) return c.json(error('Producto no encontrado.', 'NOT_FOUND'), 404);
    return c.json({ items: product.gallery });
  }
  const { experience, product } = await catalogProduct(c);
  if (!experience || !product) return c.json(error('Producto no encontrado.', 'NOT_FOUND'), 404);
  return c.json({ items: await productImages(c, String(product.id)) });
});

catalogRoutes.post('/:id/catalog-products/:productId/images/reorder', manage, async (c) => {
  if (await firstClassProductsAvailable(c.env.DB)) {
    const { experience, product } = await canonicalCatalogProduct(c);
    if (!experience || !product) return c.json(error('Producto no encontrado.', 'NOT_FOUND'), 404);
    let body: { imageIds?: unknown };
    try { body = await c.req.json(); } catch { return c.json(error('El cuerpo de la solicitud no es válido.'), 400); }
    if (!Array.isArray(body.imageIds) || body.imageIds.some((imageId) => typeof imageId !== 'string') || body.imageIds.length !== product.gallery.length || new Set(body.imageIds).size !== product.gallery.length || body.imageIds.some((imageId) => !product.gallery.some((image) => image.id === imageId))) return c.json(error('El orden de imágenes no es válido.', 'VALIDATION_ERROR'), 400);
    await c.env.DB.batch((body.imageIds as string[]).map((imageId, sortOrder) => c.env.DB.prepare('UPDATE product_images SET sort_order=? WHERE id=? AND product_id=? AND organization_id=?').bind(sortOrder, imageId, product.id, c.get('organization').id)));
    await recordActivityBestEffort(c.env.DB, { organizationId: c.get('organization').id, actorUserId: c.get('user').id }, { action: 'product.gallery.updated', resourceType: 'product', resourceId: product.id, metadata: { experienceId: experience.id, operation: 'reordered', imageCount: body.imageIds.length } });
    return c.json({ items: (await canonicalCatalogProduct(c, product.id))?.product?.gallery ?? [] });
  }
  const { experience, product } = await catalogProduct(c);
  if (!experience || !product) return c.json(error('Producto no encontrado.', 'NOT_FOUND'), 404);
  let body: { imageIds?: unknown };
  try { body = await c.req.json(); } catch { return c.json(error('El cuerpo de la solicitud no es válido.'), 400); }
  if (!Array.isArray(body.imageIds) || body.imageIds.some((id) => typeof id !== 'string') || new Set(body.imageIds).size !== body.imageIds.length) return c.json(error('El orden de imágenes no es válido.', 'VALIDATION_ERROR'), 400);
  const organizationId = c.get('organization').id;
  const imageRows = await c.env.DB.prepare('SELECT id FROM catalog_product_images WHERE product_id=? AND experience_id=? AND organization_id=? ORDER BY sort_order ASC,id ASC').bind(product.id, experience.id, organizationId).all<{ id: string }>();
  const currentIds = imageRows.results.map((row) => row.id);
  if (body.imageIds.length !== currentIds.length || body.imageIds.some((id) => !currentIds.includes(id as string))) return c.json(error('El orden debe incluir todas las imágenes.', 'VALIDATION_ERROR'), 400);
  const now = Date.now();
  const statements = (body.imageIds as string[]).map((imageId, sortOrder) => c.env.DB.prepare('UPDATE catalog_product_images SET sort_order=? WHERE id=? AND product_id=? AND experience_id=? AND organization_id=?').bind(sortOrder, imageId, product.id, experience.id, organizationId));
  statements.push(c.env.DB.prepare('UPDATE catalog_products SET updated_at=? WHERE id=? AND experience_id=? AND organization_id=? AND archived_at IS NULL').bind(now, product.id, experience.id, organizationId));
  await c.env.DB.batch(statements);
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'catalog.gallery.updated', resourceType: 'catalog_product', resourceId: String(product.id), metadata: { operation: 'reordered', imageCount: body.imageIds.length } });
  return c.json({ items: await productImages(c, String(product.id)) });
});

catalogRoutes.post('/:id/catalog-products/:productId/images', manage, async (c) => {
  if (await firstClassProductsAvailable(c.env.DB)) {
    const { experience, product } = await canonicalCatalogProduct(c);
    if (!experience || !product) return c.json(error('Producto no encontrado.', 'NOT_FOUND'), 404);
    if (await organizationProductGalleryCount(c.env.DB, c.get('organization').id, product.id) >= MAX_CATALOG_PRODUCT_IMAGES) return c.json(error(`Cada producto puede tener hasta ${MAX_CATALOG_PRODUCT_IMAGES} imágenes de galería.`, 'GALLERY_LIMIT_REACHED'), 422);
    let body: { assetUrl?: unknown };
    try { body = await c.req.json(); } catch { return c.json(error('El cuerpo de la solicitud no es válido.'), 400); }
    const assetId = catalogAssetIdFromUrl(body.assetUrl, c.get('organization').id);
    const asset = assetId ? await c.env.DB.prepare('SELECT id,mime_type mimeType,storage_key storageKey FROM organization_assets WHERE id=? AND organization_id=? AND archived_at IS NULL').bind(assetId, c.get('organization').id).first<{ id: string; mimeType: string; storageKey: string }>() : null;
    if (!asset || !SUPPORTED_IMAGE_TYPES.includes(asset.mimeType as typeof SUPPORTED_IMAGE_TYPES[number])) return c.json(error('Seleccioná una imagen activa de la organización.', 'VALIDATION_ERROR', [{ code: 'GALLERY_ASSET_INVALID', path: 'assetUrl', message: 'La imagen debe ser un asset de imagen activo de la organización.' }]), 400);
    if (product.gallery.some((image) => image.assetId === asset.id)) return c.json(error('Esta imagen ya está en la galería.', 'IMAGE_ALREADY_ADDED'), 409);
    const imageId = crypto.randomUUID(); const now = Date.now();
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO product_images (id,organization_id,product_id,asset_id,sort_order,created_at) VALUES (?,?,?,?,?,?)').bind(imageId, c.get('organization').id, product.id, asset.id, product.gallery.length, now),
      c.env.DB.prepare('UPDATE products SET updated_at=? WHERE id=? AND organization_id=?').bind(now, product.id, c.get('organization').id),
    ]);
    await recordActivityBestEffort(c.env.DB, { organizationId: c.get('organization').id, actorUserId: c.get('user').id }, { action: 'product.gallery.updated', resourceType: 'product', resourceId: product.id, metadata: { experienceId: experience.id, operation: 'added', imageCount: product.gallery.length + 1 } });
    const row = await c.env.DB.prepare(`${productImageSelect} WHERE i.id=? AND i.organization_id=?`).bind(imageId, c.get('organization').id).first<Record<string, unknown>>();
    return c.json({ image: row ? productImageFromRow(row, new URL(c.req.url).origin) : null }, 201);
  }
  const { experience, product } = await catalogProduct(c);
  if (!experience || !product) return c.json(error('Producto no encontrado.', 'NOT_FOUND'), 404);
  let body: { assetUrl?: unknown };
  try { body = await c.req.json(); } catch { return c.json(error('El cuerpo de la solicitud no es válido.'), 400); }
  const asset = await organizationImageAsset(c, body.assetUrl);
  if (!asset || !SUPPORTED_IMAGE_TYPES.includes(asset.mimeType as typeof SUPPORTED_IMAGE_TYPES[number])) return c.json(error('Seleccioná una imagen activa de la organización.', 'VALIDATION_ERROR', [{ code: 'GALLERY_ASSET_INVALID', path: 'assetUrl', message: 'La imagen debe ser un asset de imagen activo de la organización.' }]), 400);
  const organizationId = c.get('organization').id;
  const count = await c.env.DB.prepare('SELECT COUNT(*) count FROM catalog_product_images WHERE product_id=? AND experience_id=? AND organization_id=?').bind(product.id, experience.id, organizationId).first<{ count: number }>();
  if (Number(count?.count ?? 0) >= MAX_CATALOG_PRODUCT_IMAGES) return c.json(error(`Cada producto puede tener hasta ${MAX_CATALOG_PRODUCT_IMAGES} imágenes de galería.`, 'GALLERY_LIMIT_REACHED'), 422);
  const duplicate = await c.env.DB.prepare('SELECT id FROM catalog_product_images WHERE product_id=? AND asset_id=? AND experience_id=? AND organization_id=?').bind(product.id, asset.id, experience.id, organizationId).first();
  if (duplicate) return c.json(error('Esta imagen ya está en la galería.', 'IMAGE_ALREADY_ADDED'), 409);
  const order = await c.env.DB.prepare('SELECT COALESCE(MAX(sort_order),-1)+1 sortOrder FROM catalog_product_images WHERE product_id=? AND experience_id=? AND organization_id=?').bind(product.id, experience.id, organizationId).first<{ sortOrder: number }>();
  const imageId = crypto.randomUUID();
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO catalog_product_images (id,organization_id,experience_id,product_id,asset_id,sort_order,created_at) VALUES (?,?,?,?,?,?,?)').bind(imageId, organizationId, experience.id, product.id, asset.id, Number(order?.sortOrder ?? 0), now),
    c.env.DB.prepare('UPDATE catalog_products SET updated_at=? WHERE id=? AND experience_id=? AND organization_id=? AND archived_at IS NULL').bind(now, product.id, experience.id, organizationId),
  ]);
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'catalog.gallery.updated', resourceType: 'catalog_product', resourceId: String(product.id), metadata: { operation: 'added', imageCount: Number(count?.count ?? 0) + 1 } });
  const row = await c.env.DB.prepare(`${catalogImageSelect} WHERE i.id=? AND i.product_id=? AND i.organization_id=?`).bind(imageId, product.id, organizationId).first<Record<string, unknown>>();
  return c.json({ image: row ? catalogImageFromRow(row, new URL(c.req.url).origin) : null }, 201);
});

catalogRoutes.delete('/:id/catalog-products/:productId/images/:imageId', manage, async (c) => {
  if (await firstClassProductsAvailable(c.env.DB)) {
    const { experience, product } = await canonicalCatalogProduct(c);
    if (!experience || !product) return c.json(error('Producto no encontrado.', 'NOT_FOUND'), 404);
    const result = await c.env.DB.prepare('DELETE FROM product_images WHERE id=? AND product_id=? AND organization_id=?').bind(c.req.param('imageId'), product.id, c.get('organization').id).run();
    if (!result.meta?.changes) return c.json(error('Imagen no encontrada.', 'NOT_FOUND'), 404);
    await recordActivityBestEffort(c.env.DB, { organizationId: c.get('organization').id, actorUserId: c.get('user').id }, { action: 'product.gallery.updated', resourceType: 'product', resourceId: product.id, metadata: { experienceId: experience.id, operation: 'removed', imageCount: Math.max(0, product.gallery.length - 1) } });
    return c.json({ id: c.req.param('imageId'), removed: true });
  }
  const { experience, product } = await catalogProduct(c);
  if (!experience || !product) return c.json(error('Producto no encontrado.', 'NOT_FOUND'), 404);
  const organizationId = c.get('organization').id;
  const imageId = c.req.param('imageId');
  const image = await c.env.DB.prepare('SELECT id FROM catalog_product_images WHERE id=? AND product_id=? AND experience_id=? AND organization_id=?').bind(imageId, product.id, experience.id, organizationId).first();
  if (!image) return c.json(error('Imagen no encontrada.', 'NOT_FOUND'), 404);
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM catalog_product_images WHERE id=? AND product_id=? AND experience_id=? AND organization_id=?').bind(imageId, product.id, experience.id, organizationId),
    c.env.DB.prepare('UPDATE catalog_products SET updated_at=? WHERE id=? AND experience_id=? AND organization_id=? AND archived_at IS NULL').bind(now, product.id, experience.id, organizationId),
  ]);
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'catalog.gallery.updated', resourceType: 'catalog_product', resourceId: String(product.id), metadata: { operation: 'removed' } });
  return c.json({ id: imageId, removed: true });
});

catalogRoutes.patch('/:id/catalog-products/:productId', manage, async (c) => {
  if (await firstClassProductsAvailable(c.env.DB)) {
    const { experience, product: current } = await canonicalCatalogProduct(c);
    if (!experience || !current) return c.json(error('Producto no encontrado.', 'NOT_FOUND'), 404);
    const body = await requestBody(c);
    if (!body) return c.json(error('El cuerpo de la solicitud no es válido.'), 400);
    const changes = productFromBody(body, true) ?? {};
    const productChanges = { ...changes };
    delete productChanges.visible;
    const merged = { ...current, ...productChanges, visible: true };
    const issues = catalogProductIssues(merged as CatalogProductInput);
    if (!issues.some((issue) => issue.path.endsWith('.mainAssetUrl'))) {
      const assetIssue = await productMainAssetIssue(c, merged.mainAssetUrl);
      if (assetIssue) issues.push(assetIssue);
    }
    if (issues.length) return c.json(error('Revisá los datos del producto.', 'VALIDATION_ERROR', issues), 400);
    const updated = Object.keys(productChanges).length
      ? await updateOrganizationProduct(c.env.DB, c.get('organization').id, current.id, current, productChanges as never, new URL(c.req.url).origin)
      : current;
    const withAssociation = 'visible' in changes
      ? await updateCatalogAssociationFirstClass(c.env.DB, experience.id, c.get('organization').id, current.id, { visible: Boolean(changes.visible) }, new URL(c.req.url).origin)
      : updated;
    await recordActivityBestEffort(c.env.DB, { organizationId: c.get('organization').id, actorUserId: c.get('user').id }, { action: 'product.updated', resourceType: 'product', resourceId: current.id, metadata: { experienceId: experience.id, name: merged.name, changedFields: Object.keys(body) } });
    return c.json(withAssociation ?? current);
  }
  const { experience, product: current } = await catalogProduct(c);
  if (!experience || !current) return c.json(error('Producto no encontrado.', 'NOT_FOUND'), 404);
  const organizationId = c.get('organization').id;
  const body = await requestBody(c);
  if (!body) return c.json(error('El cuerpo de la solicitud no es válido.'), 400);
  const changes = productFromBody(body, true);
  if (!changes || !Object.keys(changes).length) return c.json(error('No hay cambios válidos para guardar.'), 400);
  const merged = { ...catalogProductFromRow(current), ...changes };
  const issues = catalogProductIssues(merged as CatalogProductInput);
  if (!issues.some((issue) => issue.path.endsWith('.mainAssetUrl'))) {
    const assetIssue = await productMainAssetIssue(c, merged.mainAssetUrl);
    if (assetIssue) issues.push(assetIssue);
  }
  if (issues.length) return c.json(error('Revisá los datos del producto.', 'VALIDATION_ERROR', issues), 400);
  const columns: string[] = [];
  const values: unknown[] = [];
  const columnMap: Record<string, string> = { name: 'name', description: 'description', priceMinorUnits: 'price_minor_units', currency: 'currency', priceUnit: 'price_unit', metadata: 'metadata', stock: 'stock', visible: 'visible', mainAssetUrl: 'main_asset_url', ctaLabel: 'cta_label', ctaUrl: 'cta_url' };
  for (const [key, column] of Object.entries(columnMap)) if (key in changes) { columns.push(`${column}=?`); const value = changes[key as keyof CatalogProductInput]; values.push(key === 'visible' ? (value ? 1 : 0) : key === 'metadata' && value ? JSON.stringify(value) : value); }
  columns.push('updated_at=?'); values.push(Date.now(), current.id, experience.id, organizationId);
  await c.env.DB.prepare(`UPDATE catalog_products SET ${columns.join(',')} WHERE id=? AND experience_id=? AND organization_id=? AND archived_at IS NULL`).bind(...values).run();
  const row = await c.env.DB.prepare(`${catalogProductSelect} WHERE id=? AND organization_id=?`).bind(current.id, organizationId).first<Record<string, unknown>>();
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'catalog.product.updated', resourceType: 'catalog_product', resourceId: String(current.id), metadata: { experienceId: experience.id, name: String(merged.name).slice(0, 120), changedFields: Object.keys(changes) } });
  return c.json(catalogProductFromRow(row ?? current));
});

catalogRoutes.delete('/:id/catalog-products/:productId', manage, async (c) => {
  if (await firstClassProductsAvailable(c.env.DB)) {
    const { experience, product: current } = await canonicalCatalogProduct(c);
    if (!experience || !current) return c.json(error('Producto no encontrado.', 'NOT_FOUND'), 404);
    const archived = await archiveOrganizationProduct(c.env.DB, c.get('organization').id, current.id);
    if (!archived) return c.json(error('El producto ya está archivado.', 'PRODUCT_ARCHIVED'), 409);
    await recordActivityBestEffort(c.env.DB, { organizationId: c.get('organization').id, actorUserId: c.get('user').id }, { action: 'product.archived', resourceType: 'product', resourceId: current.id, metadata: { experienceId: experience.id, name: current.name } });
    return c.json({ id: current.id, archived: true });
  }
  const { experience, product: row } = await catalogProduct(c);
  if (!experience || !row) return c.json(error('Producto no encontrado.', 'NOT_FOUND'), 404);
  const organizationId = c.get('organization').id;
  const now = Date.now();
  await c.env.DB.prepare('UPDATE catalog_products SET archived_at=?,updated_at=? WHERE id=? AND experience_id=? AND organization_id=? AND archived_at IS NULL').bind(now, now, row.id, experience.id, organizationId).run();
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'catalog.product.archived', resourceType: 'catalog_product', resourceId: String(row.id), metadata: { experienceId: experience.id, name: String(row.name).slice(0, 120) } });
  return c.json({ id: row.id, archived: true });
});

catalogRoutes.post('/:id/catalog-products/:productId/stock', manage, async (c) => {
  if (await firstClassProductsAvailable(c.env.DB)) {
    const { experience, product: current } = await canonicalCatalogProduct(c);
    if (!experience || !current) return c.json(error('Producto no encontrado.', 'NOT_FOUND'), 404);
    let body: { delta?: unknown };
    try { body = await c.req.json(); } catch { return c.json(error('El cuerpo de la solicitud no es válido.'), 400); }
    const delta = body.delta;
    if (typeof delta !== 'number' || !Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1_000_000_000) return c.json(error('El ajuste debe ser un entero distinto de cero.'), 400);
    const result = await adjustOrganizationProductStock(c.env.DB, c.get('organization').id, current, delta, new URL(c.req.url).origin);
    if (result.error) return c.json(error(result.error), 400);
    return c.json(result.product ?? current);
  }
  const { experience, product: current } = await catalogProduct(c);
  if (!experience || !current) return c.json(error('Producto no encontrado.', 'NOT_FOUND'), 404);
  const organizationId = c.get('organization').id;
  let body: { delta?: unknown };
  try { body = await c.req.json(); } catch { return c.json(error('El cuerpo de la solicitud no es válido.'), 400); }
  const delta = body.delta;
  if (typeof delta !== 'number' || !Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1_000_000_000) return c.json(error('El ajuste debe ser un entero distinto de cero.'), 400);
  const before = Number(current.stock);
  const after = before + delta;
  if (after < 0) return c.json(error('El stock no puede quedar negativo.'), 400);
  await c.env.DB.prepare('UPDATE catalog_products SET stock=?,updated_at=? WHERE id=? AND experience_id=? AND organization_id=? AND archived_at IS NULL').bind(after, Date.now(), current.id, experience.id, organizationId).run();
  const row = await c.env.DB.prepare(`${catalogProductSelect} WHERE id=? AND organization_id=?`).bind(current.id, organizationId).first<Record<string, unknown>>();
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'catalog.stock.adjusted', resourceType: 'catalog_product', resourceId: String(current.id), metadata: { experienceId: experience.id, delta, before, after } });
  return c.json(catalogProductFromRow(row ?? { ...current, stock: after, updatedAt: Date.now() }));
});
