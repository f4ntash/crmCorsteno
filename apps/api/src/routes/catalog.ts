import { Hono } from 'hono';
import type { Context } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { requireAuth, requireOrganization, requireOrganizationPermission } from '../auth/middleware';
import type { Env } from '../index';
import { recordActivityBestEffort } from '../services/activity';
import { catalogAssetIdFromUrl, catalogImageFromRow, catalogImageSelect, catalogProductFromRow, catalogProductIssues, catalogProductSelect, MAX_CATALOG_PRODUCT_IMAGES, PRODUCT_CATALOG_TYPE, type CatalogProductInput } from '../services/product-catalog';
import { validAssetUrl } from '../services/roulette-config';
import { SUPPORTED_IMAGE_TYPES } from '../services/assets';

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

async function catalogExperience(c: CatalogContext) {
  return c.env.DB.prepare('SELECT id,name,type FROM experiences WHERE id=? AND organization_id=? AND type=?').bind(c.req.param('id'), c.get('organization').id, PRODUCT_CATALOG_TYPE).first<{ id: string; name: string; type: string }>();
}

async function catalogProduct(c: CatalogContext, productId = c.req.param('productId')) {
  const experience = await catalogExperience(c);
  if (!experience) return { experience: null, product: null };
  const product = await c.env.DB.prepare(`${catalogProductSelect} WHERE id=? AND experience_id=? AND organization_id=? AND archived_at IS NULL`).bind(productId, experience.id, c.get('organization').id).first<Record<string, unknown>>();
  return { experience, product };
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

function optionalString(value: unknown, max: number) {
  if (value === undefined || value === null || value === '') return null;
  return typeof value === 'string' && value.trim().length <= max ? value.trim() : undefined;
}

function productFromBody(body: Record<string, unknown>, partial = false): Partial<CatalogProductInput> | null {
  const result: Partial<CatalogProductInput> = {};
  if (!partial || 'name' in body) {
    if (typeof body.name !== 'string') return null;
    result.name = body.name.trim();
  }
  if (!partial || 'description' in body) {
    const description = optionalString(body.description, 1000);
    if (description === undefined) return null;
    result.description = description ?? '';
  }
  if (!partial || 'priceMinorUnits' in body || 'price_minor_units' in body) {
    const value = body.priceMinorUnits ?? body.price_minor_units;
    if (value === undefined && !partial) result.priceMinorUnits = 0;
    else if (typeof value !== 'number' || !Number.isSafeInteger(value)) return null;
    else result.priceMinorUnits = value;
  }
  if (!partial || 'currency' in body) {
    if (body.currency === undefined && !partial) result.currency = 'ARS';
    else if (typeof body.currency !== 'string') return null;
    else result.currency = body.currency.trim().toUpperCase();
  }
  if (!partial || 'stock' in body) {
    if (body.stock === undefined && !partial) result.stock = 0;
    else if (typeof body.stock !== 'number' || !Number.isInteger(body.stock)) return null;
    else result.stock = body.stock;
  }
  if (!partial || 'visible' in body) {
    if (body.visible === undefined && !partial) result.visible = true;
    else if (typeof body.visible !== 'boolean') return null;
    else result.visible = body.visible;
  }
  if (!partial || 'mainAssetUrl' in body || 'main_asset_url' in body) {
    const value = body.mainAssetUrl ?? body.main_asset_url;
    if (value !== null && value !== undefined && value !== '' && !validAssetUrl(value)) return null;
    result.mainAssetUrl = value === null || value === undefined || value === '' ? null : value as string;
  }
  if (!partial || 'ctaLabel' in body || 'cta_label' in body) {
    const value = optionalString(body.ctaLabel ?? body.cta_label, 80);
    if (value === undefined) return null;
    result.ctaLabel = value;
  }
  if (!partial || 'ctaUrl' in body || 'cta_url' in body) {
    const raw = body.ctaUrl ?? body.cta_url;
    if (raw !== null && raw !== undefined && raw !== '' && typeof raw !== 'string') return null;
    result.ctaUrl = raw === null || raw === undefined || raw === '' ? null : String(raw).trim();
  }
  return result;
}

function completeProduct(value: Partial<CatalogProductInput>): CatalogProductInput {
  return {
    name: value.name ?? '', description: value.description ?? '', priceMinorUnits: value.priceMinorUnits ?? 0,
    currency: value.currency ?? 'ARS', stock: value.stock ?? 0, visible: value.visible ?? true,
    mainAssetUrl: value.mainAssetUrl ?? null, ctaLabel: value.ctaLabel ?? null, ctaUrl: value.ctaUrl ?? null,
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

catalogRoutes.get('/:id/catalog-products', read, async (c) => {
  if (!await catalogExperience(c)) return c.json(error('Catálogo no encontrado.', 'NOT_FOUND'), 404);
  const experienceId = c.req.param('id');
  const organizationId = c.get('organization').id;
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
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json(error('El cuerpo de la solicitud no es válido.'), 400); }
  const value = productFromBody(body);
  const product = value ? completeProduct(value) : null;
  const issues = product ? catalogProductIssues(product) : [{ code: 'PRODUCT_INVALID', path: 'product', message: 'Los datos del producto no son válidos.' }];
  if (product && !assetBelongsToOrganization(product.mainAssetUrl, c.get('organization').id)) issues.push({ code: 'PRODUCT_ASSET_ORGANIZATION', path: 'mainAssetUrl', message: 'La imagen principal debe pertenecer a la organización.' });
  if (issues.length) return c.json(error('Revisá los datos del producto.', 'VALIDATION_ERROR', issues), 400);
  const organizationId = c.get('organization').id;
  const order = await c.env.DB.prepare('SELECT COALESCE(MAX(sort_order),-1)+1 sortOrder FROM catalog_products WHERE experience_id=? AND organization_id=?').bind(experience.id, organizationId).first<{ sortOrder: number }>();
  const complete = product!;
  const now = Date.now();
  const id = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO catalog_products (id,organization_id,experience_id,name,description,price_minor_units,currency,stock,sort_order,visible,main_asset_url,cta_label,cta_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, organizationId, experience.id, complete.name, complete.description, complete.priceMinorUnits, complete.currency, complete.stock, Number(order?.sortOrder ?? 0), complete.visible ? 1 : 0, complete.mainAssetUrl, complete.ctaLabel, complete.ctaUrl, now, now).run();
  const row = await c.env.DB.prepare(`${catalogProductSelect} WHERE id=? AND organization_id=?`).bind(id, organizationId).first<Record<string, unknown>>();
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'catalog.product.created', resourceType: 'catalog_product', resourceId: id, metadata: { experienceId: experience.id, name: complete.name.slice(0, 120) } });
  return c.json(catalogProductFromRow(row ?? { id, organizationId, experienceId: experience.id, ...complete, sortOrder: Number(order?.sortOrder ?? 0), createdAt: now, updatedAt: now }), 201);
});

catalogRoutes.get('/:id/catalog-products/:productId/images', read, async (c) => {
  const { experience, product } = await catalogProduct(c);
  if (!experience || !product) return c.json(error('Producto no encontrado.', 'NOT_FOUND'), 404);
  return c.json({ items: await productImages(c, String(product.id)) });
});

catalogRoutes.post('/:id/catalog-products/:productId/images/reorder', manage, async (c) => {
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
  const { experience, product: current } = await catalogProduct(c);
  if (!experience || !current) return c.json(error('Producto no encontrado.', 'NOT_FOUND'), 404);
  const organizationId = c.get('organization').id;
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json(error('El cuerpo de la solicitud no es válido.'), 400); }
  const changes = productFromBody(body, true);
  if (!changes || !Object.keys(changes).length) return c.json(error('No hay cambios válidos para guardar.'), 400);
  const merged = { ...catalogProductFromRow(current), ...changes };
  const issues = catalogProductIssues(merged);
  if (!assetBelongsToOrganization(merged.mainAssetUrl, organizationId)) issues.push({ code: 'PRODUCT_ASSET_ORGANIZATION', path: 'mainAssetUrl', message: 'La imagen principal debe pertenecer a la organización.' });
  if (issues.length) return c.json(error('Revisá los datos del producto.', 'VALIDATION_ERROR', issues), 400);
  const columns: string[] = [];
  const values: unknown[] = [];
  const columnMap: Record<string, string> = { name: 'name', description: 'description', priceMinorUnits: 'price_minor_units', currency: 'currency', stock: 'stock', visible: 'visible', mainAssetUrl: 'main_asset_url', ctaLabel: 'cta_label', ctaUrl: 'cta_url' };
  for (const [key, column] of Object.entries(columnMap)) if (key in changes) { columns.push(`${column}=?`); values.push(key === 'visible' ? (changes[key as keyof CatalogProductInput] ? 1 : 0) : changes[key as keyof CatalogProductInput]); }
  columns.push('updated_at=?'); values.push(Date.now(), current.id, experience.id, organizationId);
  await c.env.DB.prepare(`UPDATE catalog_products SET ${columns.join(',')} WHERE id=? AND experience_id=? AND organization_id=? AND archived_at IS NULL`).bind(...values).run();
  const row = await c.env.DB.prepare(`${catalogProductSelect} WHERE id=? AND organization_id=?`).bind(current.id, organizationId).first<Record<string, unknown>>();
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'catalog.product.updated', resourceType: 'catalog_product', resourceId: String(current.id), metadata: { experienceId: experience.id, name: String(merged.name).slice(0, 120), changedFields: Object.keys(changes) } });
  return c.json(catalogProductFromRow(row ?? current));
});

catalogRoutes.delete('/:id/catalog-products/:productId', manage, async (c) => {
  const { experience, product: row } = await catalogProduct(c);
  if (!experience || !row) return c.json(error('Producto no encontrado.', 'NOT_FOUND'), 404);
  const organizationId = c.get('organization').id;
  const now = Date.now();
  await c.env.DB.prepare('UPDATE catalog_products SET archived_at=?,updated_at=? WHERE id=? AND experience_id=? AND organization_id=? AND archived_at IS NULL').bind(now, now, row.id, experience.id, organizationId).run();
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'catalog.product.archived', resourceType: 'catalog_product', resourceId: String(row.id), metadata: { experienceId: experience.id, name: String(row.name).slice(0, 120) } });
  return c.json({ id: row.id, archived: true });
});

catalogRoutes.post('/:id/catalog-products/:productId/stock', manage, async (c) => {
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
