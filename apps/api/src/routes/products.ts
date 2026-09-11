import { Hono } from 'hono';
import type { Context } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { requireAuth, requireOrganization, requireOrganizationPermission } from '../auth/middleware';
import type { Env } from '../index';
import { recordActivityBestEffort } from '../services/activity';
import { catalogAssetIdFromUrl, MAX_CATALOG_PRODUCT_IMAGES } from '../services/product-catalog';
import { SUPPORTED_IMAGE_TYPES } from '../services/assets';
import {
  adjustOrganizationProductStock,
  archiveOrganizationProduct,
  createOrganizationProduct,
  getOrganizationProduct,
  listOrganizationProducts,
  organizationProductGalleryCount,
  productIssues,
  productImageFromRow,
  productImageSelect,
  publishOrganizationProduct,
  updateOrganizationProduct,
  validateProductAsset,
} from '../services/organization-products';

type Variables = {
  user: { id: string; email: string; name: string; platformRole: string };
  sessionId: string;
  organization: { id: string; name: string; slug: string; role: string };
};
type ProductContext = Context<{ Bindings: Env; Variables: Variables }>;

export const productRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
productRoutes.use('*', requireAuth, requireOrganization);
const read = requireOrganizationPermission('crm.read') as unknown as MiddlewareHandler<{ Bindings: Env; Variables: Variables }>;
const manage = requireOrganizationPermission('crm.manage') as unknown as MiddlewareHandler<{ Bindings: Env; Variables: Variables }>;

function error(message: string, code = 'BAD_REQUEST', issues?: unknown[]) {
  return { error: { code, message, ...(issues?.length ? { issues } : {}) } };
}

async function body(c: ProductContext) {
  try {
    const value = await c.req.json() as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function optionalString(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  return typeof value === 'string' ? value.trim() : value;
}

function input(value: Record<string, unknown>, partial = false): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const read = (key: string, ...aliases: string[]) => aliases.find((alias) => alias in value) ?? (key in value ? key : null);
  const fields: Array<[string, (value: unknown) => unknown]> = [
    ['name', (item) => typeof item === 'string' ? item.trim() : item ?? ''],
    ['description', (item) => optionalString(item) ?? ''],
    ['priceMinorUnits', (item) => item],
    ['currency', (item) => typeof item === 'string' ? item.trim().toUpperCase() : item],
    ['stock', (item) => item],
    ['mainAssetUrl', (item) => item === null || item === undefined || item === '' ? null : typeof item === 'string' ? item.trim() : item],
    ['ctaLabel', (item) => optionalString(item)],
    ['ctaUrl', (item) => item === null || item === undefined || item === '' ? null : typeof item === 'string' ? item.trim() : item],
  ];
  for (const [key, transform] of fields) {
    const actual = read(key, key === 'priceMinorUnits' ? 'price_minor_units' : key === 'mainAssetUrl' ? 'main_asset_url' : key === 'ctaLabel' ? 'cta_label' : key === 'ctaUrl' ? 'cta_url' : '');
    if (actual || !partial) result[key] = transform(actual ? value[actual] : key === 'currency' ? 'ARS' : key === 'description' ? '' : key === 'stock' || key === 'priceMinorUnits' ? 0 : null);
  }
  result.visible = true;
  return result;
}

function complete(value: Record<string, unknown>) {
  return {
    name: value.name as string,
    description: value.description as string,
    priceMinorUnits: value.priceMinorUnits as number,
    currency: value.currency as string,
    stock: value.stock as number,
    visible: true,
    mainAssetUrl: value.mainAssetUrl as string | null,
    ctaLabel: value.ctaLabel as string | null,
    ctaUrl: value.ctaUrl as string | null,
  };
}

productRoutes.get('/', read, async (c) => {
  const includeArchived = c.req.query('includeArchived') !== 'false';
  return c.json({ items: await listOrganizationProducts(c.env.DB, c.get('organization').id, new URL(c.req.url).origin, includeArchived) });
});

productRoutes.post('/', manage, async (c) => {
  const value = input(await body(c) ?? {});
  const product = complete(value);
  const issues = await productIssues(product);
  const assetIssue = await validateProductAsset(c.env.DB, product.mainAssetUrl, c.get('organization').id);
  if (assetIssue) issues.push(assetIssue);
  if (issues.length) return c.json(error('Revisá los datos del producto.', 'VALIDATION_ERROR', issues), 400);
  const created = await createOrganizationProduct(c.env.DB, c.get('organization').id, product, new URL(c.req.url).origin);
  if (!created) return c.json(error('No se pudo crear el producto.', 'INTERNAL_ERROR'), 500);
  await recordActivityBestEffort(c.env.DB, { organizationId: c.get('organization').id, actorUserId: c.get('user').id }, { action: 'product.created', resourceType: 'product', resourceId: created.id, metadata: { name: created.name } });
  return c.json(created, 201);
});

productRoutes.get('/:id', read, async (c) => {
  const product = await getOrganizationProduct(c.env.DB, c.get('organization').id, c.req.param('id'), new URL(c.req.url).origin);
  return product ? c.json(product) : c.json(error('Producto no encontrado.', 'NOT_FOUND'), 404);
});

productRoutes.patch('/:id', manage, async (c) => {
  const current = await getOrganizationProduct(c.env.DB, c.get('organization').id, c.req.param('id'), new URL(c.req.url).origin);
  if (!current) return c.json(error('Producto no encontrado.', 'NOT_FOUND'), 404);
  if (current.status === 'archived') return c.json(error('Los productos archivados no se pueden editar.', 'PRODUCT_ARCHIVED'), 409);
  const raw = await body(c);
  if (!raw) return c.json(error('El cuerpo de la solicitud no es válido.'), 400);
  const changes = input(raw, true);
  const merged = { ...current, ...changes, visible: true };
  const issues = await productIssues(merged);
  const assetIssue = await validateProductAsset(c.env.DB, merged.mainAssetUrl as string | null, c.get('organization').id);
  if (assetIssue) issues.push(assetIssue);
  if (issues.length) return c.json(error('Revisá los datos del producto.', 'VALIDATION_ERROR', issues), 400);
  const updated = await updateOrganizationProduct(c.env.DB, c.get('organization').id, current.id, current, changes as never, new URL(c.req.url).origin);
  await recordActivityBestEffort(c.env.DB, { organizationId: c.get('organization').id, actorUserId: c.get('user').id }, { action: 'product.updated', resourceType: 'product', resourceId: current.id, metadata: { name: merged.name, changedFields: Object.keys(changes) } });
  return c.json(updated ?? current);
});

productRoutes.post('/:id/publish', manage, async (c) => {
  const product = await getOrganizationProduct(c.env.DB, c.get('organization').id, c.req.param('id'), new URL(c.req.url).origin);
  if (!product) return c.json(error('Producto no encontrado.', 'NOT_FOUND'), 404);
  if (product.status === 'archived') return c.json(error('Los productos archivados no se pueden publicar.', 'PRODUCT_ARCHIVED'), 409);
  const result = await publishOrganizationProduct(c.env.DB, c.get('organization').id, product, new URL(c.req.url).origin);
  if (result.issues.length) return c.json(error('El producto no está listo para publicar.', 'PUBLISH_NOT_READY', result.issues), 422);
  await recordActivityBestEffort(c.env.DB, { organizationId: c.get('organization').id, actorUserId: c.get('user').id }, { action: 'product.published', resourceType: 'product', resourceId: product.id, metadata: { name: product.name } });
  return c.json(result.product);
});

productRoutes.post('/:id/archive', manage, async (c) => {
  const product = await getOrganizationProduct(c.env.DB, c.get('organization').id, c.req.param('id'), new URL(c.req.url).origin);
  if (!product) return c.json(error('Producto no encontrado.', 'NOT_FOUND'), 404);
  const archived = await archiveOrganizationProduct(c.env.DB, c.get('organization').id, product.id);
  if (!archived) return c.json(error('El producto ya está archivado.', 'PRODUCT_ARCHIVED'), 409);
  await recordActivityBestEffort(c.env.DB, { organizationId: c.get('organization').id, actorUserId: c.get('user').id }, { action: 'product.archived', resourceType: 'product', resourceId: product.id, metadata: { name: product.name } });
  return c.json({ id: product.id, archived: true });
});

productRoutes.post('/:id/stock', manage, async (c) => {
  const product = await getOrganizationProduct(c.env.DB, c.get('organization').id, c.req.param('id'), new URL(c.req.url).origin);
  if (!product) return c.json(error('Producto no encontrado.', 'NOT_FOUND'), 404);
  const value = await body(c);
  const delta = value?.delta;
  if (typeof delta !== 'number' || !Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1_000_000_000) return c.json(error('El ajuste debe ser un entero distinto de cero.'), 400);
  const result = await adjustOrganizationProductStock(c.env.DB, c.get('organization').id, product, delta, new URL(c.req.url).origin);
  if (result.error) return c.json(error(result.error), 400);
  await recordActivityBestEffort(c.env.DB, { organizationId: c.get('organization').id, actorUserId: c.get('user').id }, { action: 'product.stock.adjusted', resourceType: 'product', resourceId: product.id, metadata: { delta, before: product.stock, after: result.product?.stock } });
  return c.json(result.product);
});

productRoutes.get('/:id/images', read, async (c) => {
  const product = await getOrganizationProduct(c.env.DB, c.get('organization').id, c.req.param('id'), new URL(c.req.url).origin);
  return product ? c.json({ items: product.gallery }) : c.json(error('Producto no encontrado.', 'NOT_FOUND'), 404);
});

productRoutes.post('/:id/images', manage, async (c) => {
  const product = await getOrganizationProduct(c.env.DB, c.get('organization').id, c.req.param('id'), new URL(c.req.url).origin);
  if (!product) return c.json(error('Producto no encontrado.', 'NOT_FOUND'), 404);
  if (product.status === 'archived') return c.json(error('Los productos archivados no se pueden editar.', 'PRODUCT_ARCHIVED'), 409);
  if (await organizationProductGalleryCount(c.env.DB, product.organizationId, product.id) >= MAX_CATALOG_PRODUCT_IMAGES) return c.json(error(`Cada producto puede tener hasta ${MAX_CATALOG_PRODUCT_IMAGES} imágenes de galería.`, 'GALLERY_LIMIT_REACHED'), 422);
  const value = await body(c);
  const assetUrlValue = typeof value?.assetUrl === 'string' ? value.assetUrl : null;
  const assetId = catalogAssetIdFromUrl(assetUrlValue, product.organizationId);
  const asset = assetId ? await c.env.DB.prepare('SELECT id,mime_type mimeType,storage_key storageKey FROM organization_assets WHERE id=? AND organization_id=? AND archived_at IS NULL').bind(assetId, product.organizationId).first<{ id: string; mimeType: string; storageKey: string }>() : null;
  if (!asset || !SUPPORTED_IMAGE_TYPES.includes(asset.mimeType as typeof SUPPORTED_IMAGE_TYPES[number])) return c.json(error('Seleccioná una imagen activa de la organización.', 'VALIDATION_ERROR', [{ code: 'GALLERY_ASSET_INVALID', path: 'assetUrl', message: 'La imagen debe ser un asset de imagen activo de la organización.' }]), 400);
  const duplicate = product.gallery.some((image) => image.assetId === asset.id);
  if (duplicate) return c.json(error('Esta imagen ya está en la galería.', 'IMAGE_ALREADY_ADDED'), 409);
  const order = product.gallery.length;
  const imageId = crypto.randomUUID();
  const now = Date.now();
  await c.env.DB.prepare('INSERT INTO product_images (id,organization_id,product_id,asset_id,sort_order,created_at) VALUES (?,?,?,?,?,?)').bind(imageId, product.organizationId, product.id, asset.id, order, now).run();
  await c.env.DB.prepare('UPDATE products SET updated_at=? WHERE id=? AND organization_id=?').bind(now, product.id, product.organizationId).run();
  const row = await c.env.DB.prepare(`${productImageSelect} WHERE i.id=? AND i.organization_id=?`).bind(imageId, product.organizationId).first<Record<string, unknown>>();
  await recordActivityBestEffort(c.env.DB, { organizationId: product.organizationId, actorUserId: c.get('user').id }, { action: 'product.gallery.updated', resourceType: 'product', resourceId: product.id, metadata: { operation: 'added', imageCount: product.gallery.length + 1 } });
  return c.json({ image: row ? productImageFromRow(row, new URL(c.req.url).origin) : null }, 201);
});

productRoutes.post('/:id/images/reorder', manage, async (c) => {
  const product = await getOrganizationProduct(c.env.DB, c.get('organization').id, c.req.param('id'), new URL(c.req.url).origin);
  if (!product) return c.json(error('Producto no encontrado.', 'NOT_FOUND'), 404);
  if (product.status === 'archived') return c.json(error('Los productos archivados no se pueden editar.', 'PRODUCT_ARCHIVED'), 409);
  const value = await body(c);
  if (!Array.isArray(value?.imageIds) || value.imageIds.some((id) => typeof id !== 'string') || value.imageIds.length !== product.gallery.length || new Set(value.imageIds).size !== product.gallery.length || value.imageIds.some((id) => !product.gallery.some((image) => image.id === id))) return c.json(error('El orden de imágenes no es válido.', 'VALIDATION_ERROR'), 400);
  await c.env.DB.batch((value.imageIds as string[]).map((imageId, sortOrder) => c.env.DB.prepare('UPDATE product_images SET sort_order=? WHERE id=? AND product_id=? AND organization_id=?').bind(sortOrder, imageId, product.id, product.organizationId)));
  await recordActivityBestEffort(c.env.DB, { organizationId: product.organizationId, actorUserId: c.get('user').id }, { action: 'product.gallery.updated', resourceType: 'product', resourceId: product.id, metadata: { operation: 'reordered', imageCount: value.imageIds.length } });
  return c.json({ items: (await getOrganizationProduct(c.env.DB, product.organizationId, product.id, new URL(c.req.url).origin))?.gallery ?? [] });
});

productRoutes.delete('/:id/images/:imageId', manage, async (c) => {
  const product = await getOrganizationProduct(c.env.DB, c.get('organization').id, c.req.param('id'), new URL(c.req.url).origin);
  if (!product) return c.json(error('Producto no encontrado.', 'NOT_FOUND'), 404);
  if (product.status === 'archived') return c.json(error('Los productos archivados no se pueden editar.', 'PRODUCT_ARCHIVED'), 409);
  const result = await c.env.DB.prepare('DELETE FROM product_images WHERE id=? AND product_id=? AND organization_id=?').bind(c.req.param('imageId'), product.id, product.organizationId).run();
  if (!result.meta?.changes) return c.json(error('Imagen no encontrada.', 'NOT_FOUND'), 404);
  await recordActivityBestEffort(c.env.DB, { organizationId: product.organizationId, actorUserId: c.get('user').id }, { action: 'product.gallery.updated', resourceType: 'product', resourceId: product.id, metadata: { operation: 'removed', imageCount: Math.max(0, product.gallery.length - 1) } });
  return c.json({ id: c.req.param('imageId'), removed: true });
});
