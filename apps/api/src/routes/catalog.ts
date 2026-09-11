import { Hono } from 'hono';
import type { Context } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { requireAuth, requireOrganization, requireOrganizationPermission } from '../auth/middleware';
import type { Env } from '../index';
import { recordActivityBestEffort } from '../services/activity';
import { catalogProductFromRow, catalogProductIssues, catalogProductSelect, PRODUCT_CATALOG_TYPE, type CatalogProductInput } from '../services/product-catalog';
import { validAssetUrl } from '../services/roulette-config';

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

catalogRoutes.get('/:id/catalog-products', read, async (c) => {
  if (!await catalogExperience(c)) return c.json(error('Catálogo no encontrado.', 'NOT_FOUND'), 404);
  const experienceId = c.req.param('id');
  const organizationId = c.get('organization').id;
  const [rows, published] = await Promise.all([
    c.env.DB.prepare(`${catalogProductSelect} WHERE experience_id=? AND organization_id=? AND archived_at IS NULL ORDER BY created_at ASC,id ASC`).bind(experienceId, organizationId).all<Record<string, unknown>>(),
    c.env.DB.prepare('SELECT MAX(published_at) publishedAt FROM catalog_published_products WHERE experience_id=? AND organization_id=?').bind(experienceId, organizationId).first<{ publishedAt: number | null }>(),
  ]);
  const latest = rows.results.reduce((value, row) => Math.max(value, Number(row.updatedAt) || 0), 0);
  return c.json({ items: rows.results.map(catalogProductFromRow), hasUnpublishedChanges: published?.publishedAt === null || published?.publishedAt === undefined || latest > Number(published.publishedAt) });
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
  const complete = product!;
  const now = Date.now();
  const id = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO catalog_products (id,organization_id,experience_id,name,description,price_minor_units,currency,stock,visible,main_asset_url,cta_label,cta_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, c.get('organization').id, experience.id, complete.name, complete.description, complete.priceMinorUnits, complete.currency, complete.stock, complete.visible ? 1 : 0, complete.mainAssetUrl, complete.ctaLabel, complete.ctaUrl, now, now).run();
  const row = await c.env.DB.prepare(`${catalogProductSelect} WHERE id=? AND organization_id=?`).bind(id, c.get('organization').id).first<Record<string, unknown>>();
  await recordActivityBestEffort(c.env.DB, { organizationId: c.get('organization').id, actorUserId: c.get('user').id }, { action: 'catalog.product.created', resourceType: 'catalog_product', resourceId: id, metadata: { experienceId: experience.id, name: complete.name.slice(0, 120) } });
  return c.json(catalogProductFromRow(row ?? { id, organizationId: c.get('organization').id, experienceId: experience.id, ...complete, createdAt: now, updatedAt: now }), 201);
});

catalogRoutes.patch('/:id/catalog-products/:productId', manage, async (c) => {
  const experience = await catalogExperience(c);
  if (!experience) return c.json(error('Catálogo no encontrado.', 'NOT_FOUND'), 404);
  const organizationId = c.get('organization').id;
  const productId = c.req.param('productId');
  const current = await c.env.DB.prepare(`${catalogProductSelect} WHERE id=? AND experience_id=? AND organization_id=? AND archived_at IS NULL`).bind(productId, experience.id, organizationId).first<Record<string, unknown>>();
  if (!current) return c.json(error('Producto no encontrado.', 'NOT_FOUND'), 404);
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
  columns.push('updated_at=?'); values.push(Date.now(), productId, experience.id, organizationId);
  await c.env.DB.prepare(`UPDATE catalog_products SET ${columns.join(',')} WHERE id=? AND experience_id=? AND organization_id=? AND archived_at IS NULL`).bind(...values).run();
  const row = await c.env.DB.prepare(`${catalogProductSelect} WHERE id=? AND organization_id=?`).bind(productId, organizationId).first<Record<string, unknown>>();
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'catalog.product.updated', resourceType: 'catalog_product', resourceId: productId, metadata: { experienceId: experience.id, name: String(merged.name).slice(0, 120), changedFields: Object.keys(changes) } });
  return c.json(catalogProductFromRow(row ?? current));
});

catalogRoutes.delete('/:id/catalog-products/:productId', manage, async (c) => {
  const experience = await catalogExperience(c);
  if (!experience) return c.json(error('Catálogo no encontrado.', 'NOT_FOUND'), 404);
  const organizationId = c.get('organization').id;
  const productId = c.req.param('productId');
  const row = await c.env.DB.prepare(`${catalogProductSelect} WHERE id=? AND experience_id=? AND organization_id=? AND archived_at IS NULL`).bind(productId, experience.id, organizationId).first<Record<string, unknown>>();
  if (!row) return c.json(error('Producto no encontrado.', 'NOT_FOUND'), 404);
  await c.env.DB.prepare('UPDATE catalog_products SET archived_at=?,updated_at=? WHERE id=? AND experience_id=? AND organization_id=? AND archived_at IS NULL').bind(Date.now(), Date.now(), productId, experience.id, organizationId).run();
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'catalog.product.archived', resourceType: 'catalog_product', resourceId: productId, metadata: { experienceId: experience.id, name: String(row.name).slice(0, 120) } });
  return c.json({ id: productId, archived: true });
});

catalogRoutes.post('/:id/catalog-products/:productId/stock', manage, async (c) => {
  const experience = await catalogExperience(c);
  if (!experience) return c.json(error('Catálogo no encontrado.', 'NOT_FOUND'), 404);
  const organizationId = c.get('organization').id;
  const productId = c.req.param('productId');
  const current = await c.env.DB.prepare(`${catalogProductSelect} WHERE id=? AND experience_id=? AND organization_id=? AND archived_at IS NULL`).bind(productId, experience.id, organizationId).first<Record<string, unknown>>();
  if (!current) return c.json(error('Producto no encontrado.', 'NOT_FOUND'), 404);
  let body: { delta?: unknown };
  try { body = await c.req.json(); } catch { return c.json(error('El cuerpo de la solicitud no es válido.'), 400); }
  const delta = body.delta;
  if (typeof delta !== 'number' || !Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1_000_000_000) return c.json(error('El ajuste debe ser un entero distinto de cero.'), 400);
  const before = Number(current.stock);
  const after = before + delta;
  if (after < 0) return c.json(error('El stock no puede quedar negativo.'), 400);
  await c.env.DB.prepare('UPDATE catalog_products SET stock=?,updated_at=? WHERE id=? AND experience_id=? AND organization_id=? AND archived_at IS NULL').bind(after, Date.now(), productId, experience.id, organizationId).run();
  const row = await c.env.DB.prepare(`${catalogProductSelect} WHERE id=? AND organization_id=?`).bind(productId, organizationId).first<Record<string, unknown>>();
  await recordActivityBestEffort(c.env.DB, { organizationId, actorUserId: c.get('user').id }, { action: 'catalog.stock.adjusted', resourceType: 'catalog_product', resourceId: productId, metadata: { experienceId: experience.id, delta, before, after } });
  return c.json(catalogProductFromRow(row ?? { ...current, stock: after, updatedAt: Date.now() }));
});
