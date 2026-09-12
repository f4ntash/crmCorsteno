import {
  PUBLIC_API_SCHEMA_VERSION,
  type PublicProduct,
  type PublicProduct3D,
  type PublicSite,
  type PublicSiteContent,
} from '@corsteno/types';
import { SUPPORTED_IMAGE_TYPES } from './assets';
import { publishedChannelProducts } from './channel-products';
import { PUBLIC_CHANNEL_TYPES } from './channel-origins';
import { SITE_CONTENT_PROFILE_KEY, SITE_CONTENT_PROFILE_VERSION } from './site-content';
import { parseProduct3DConfig } from '@corsteno/types';

export type PublicSiteContext = {
  id: string;
  organizationId: string;
  key: string;
  name: string;
  type: typeof PUBLIC_CHANNEL_TYPES[number];
  url: string | null;
  updatedAt: number;
};

type Row = Record<string, unknown>;
type AssetRow = { id: string; storageKey: string; mimeType: string; category: string; archivedAt: number | null };

const SITE_KEY = /^site_[A-Za-z0-9_-]{8,80}$/;
const ASSET_ID = /^[A-Za-z0-9_-]{1,120}$/;
const IMAGE_PATH = /^\/assets\/organizations\/([^/]+)\/assets\/([A-Za-z0-9_-]+)\.(png|jpg|jpeg|webp|svg)$/i;

function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function number(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseJson(value: unknown) {
  if (typeof value !== 'string' || !value) return null;
  try { return object(JSON.parse(value)); } catch { return null; }
}

function publicSite(value: PublicSiteContext): PublicSite {
  return { key: value.key, name: value.name };
}

export function validPublicSiteKey(value: unknown) {
  return typeof value === 'string' && SITE_KEY.test(value);
}

export async function findPublicSite(db: D1Database, siteKey: string): Promise<PublicSiteContext | null> {
  if (!validPublicSiteKey(siteKey)) return null;
  const row = await db.prepare(`SELECT id,organization_id organizationId,public_key publicKey,name,type,url,updated_at updatedAt
    FROM channels WHERE public_key=? AND status='active' AND type IN ('external_site','corsteno_site')`).bind(siteKey).first<Row>();
  if (!row || !PUBLIC_CHANNEL_TYPES.includes(row.type as typeof PUBLIC_CHANNEL_TYPES[number])) return null;
  return { id: text(row.id), organizationId: text(row.organizationId), key: text(row.publicKey), name: text(row.name), type: row.type as typeof PUBLIC_CHANNEL_TYPES[number], url: typeof row.url === 'string' ? row.url : null, updatedAt: number(row.updatedAt) };
}

function assetIdFromUrl(value: unknown, organizationId: string, allowed: 'image' | 'model' = 'image') {
  if (typeof value !== 'string') return null;
  let pathname: string;
  try { pathname = new URL(value, 'http://internal').pathname; } catch { return null; }
  const match = pathname.match(IMAGE_PATH);
  if (allowed !== 'image' || !match || match[1] !== organizationId) return null;
  return match[2];
}

function publicAssetUrl(origin: string, siteKey: string, assetId: string) {
  return `${origin}/public/v1/sites/${encodeURIComponent(siteKey)}/assets/${encodeURIComponent(assetId)}`;
}

function validAsset(row: AssetRow | undefined, organizationId: string, assetId: string, type: 'image' | 'model') {
  if (!row || row.archivedAt !== null || !row.storageKey.startsWith(`organizations/${organizationId}/assets/${assetId}.`)) return false;
  return type === 'image'
    ? row.category !== 'model-3d' && SUPPORTED_IMAGE_TYPES.includes(row.mimeType as typeof SUPPORTED_IMAGE_TYPES[number])
    : row.category === 'model-3d' && row.mimeType === 'model/gltf-binary';
}

async function assetsById(db: D1Database, organizationId: string, ids: readonly string[]) {
  if (!ids.length) return new Map<string, AssetRow>();
  const rows = await db.prepare(`SELECT id,storage_key storageKey,mime_type mimeType,category,archived_at archivedAt FROM organization_assets WHERE organization_id=? AND id IN (${ids.map(() => '?').join(',')})`).bind(organizationId, ...ids).all<AssetRow>();
  return new Map(rows.results.map((row) => [row.id, row]));
}

async function publishedContentRow(db: D1Database, site: PublicSiteContext) {
  return db.prepare('SELECT profile_key profileKey,profile_version profileVersion,published_content publishedContent,published_at publishedAt,updated_at updatedAt FROM channel_content WHERE channel_id=? AND organization_id=?').bind(site.id, site.organizationId).first<Row>();
}

async function serializeSiteContent(db: D1Database, site: PublicSiteContext, origin: string, row: Row | null): Promise<PublicSiteContent | null> {
  if (!row || typeof row.publishedContent !== 'string') return null;
  const content = parseJson(row.publishedContent);
  if (!content || row.profileKey !== SITE_CONTENT_PROFILE_KEY || Number(row.profileVersion) !== SITE_CONTENT_PROFILE_VERSION) return null;
  const hero = object(content.hero);
  const promotion = object(content.promotion);
  if (!hero || !promotion) return null;
  const ids = [assetIdFromUrl(hero.image, site.organizationId), assetIdFromUrl(promotion.image, site.organizationId)].filter((id): id is string => Boolean(id));
  const assets = await assetsById(db, site.organizationId, ids);
  const image = (value: unknown) => {
    const id = assetIdFromUrl(value, site.organizationId);
    const asset = id ? assets.get(id) : undefined;
    return id && validAsset(asset, site.organizationId, id, 'image') ? { url: publicAssetUrl(origin, site.key, id) } : null;
  };
  return {
    profile: text(row.profileKey),
    sections: {
      hero: { title: text(hero.title), description: text(hero.description), image: image(hero.image), ctaLabel: text(hero.ctaLabel), ctaUrl: text(hero.ctaUrl) },
      promotion: { enabled: heroValueBoolean(promotion.enabled), title: text(promotion.title), description: text(promotion.description), image: image(promotion.image), ctaLabel: text(promotion.ctaLabel), ctaUrl: text(promotion.ctaUrl) },
    },
  };
}

function heroValueBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : false;
}

async function productImageRows(db: D1Database, site: PublicSiteContext, productIds: readonly string[]) {
  if (!productIds.length) return [] as Row[];
  return (await db.prepare(`SELECT product_id productId,asset_url assetUrl,sort_order sortOrder FROM product_published_images WHERE organization_id=? AND product_id IN (${productIds.map(() => '?').join(',')}) ORDER BY product_id,sort_order,id`).bind(site.organizationId, ...productIds).all<Row>()).results;
}

async function product3dRows(db: D1Database, site: PublicSiteContext, productIds: readonly string[]) {
  if (!productIds.length) return [] as Row[];
  try {
    return (await db.prepare(`SELECT product_id productId,published_config publishedConfig,published_model_asset_id publishedModelAssetId,published_at publishedAt,updated_at updatedAt FROM product_3d_config WHERE organization_id=? AND product_id IN (${productIds.map(() => '?').join(',')})`).bind(site.organizationId, ...productIds).all<Row>()).results;
  } catch {
    return [] as Row[];
  }
}

function productSnapshot(row: Row) {
  return parseJson(row.publishedContent);
}

function product3dUnavailable(): PublicProduct3D {
  return { available: false };
}

function serializeProduct(row: Row, imageRows: Row[], modelRow: Row | undefined, assets: Map<string, AssetRow>, site: PublicSiteContext, origin: string): PublicProduct | null {
  const snapshot = productSnapshot(row);
  const priceMinorUnits = snapshot?.priceMinorUnits;
  const stock = snapshot?.stock;
  if (!snapshot || typeof snapshot.name !== 'string' || typeof snapshot.description !== 'string' || typeof priceMinorUnits !== 'number' || !Number.isInteger(priceMinorUnits) || priceMinorUnits < 0 || typeof snapshot.currency !== 'string' || typeof stock !== 'number' || !Number.isInteger(stock) || stock < 0) return null;
  const mainId = assetIdFromUrl(snapshot.mainAssetUrl, site.organizationId);
  const main = mainId && validAsset(assets.get(mainId), site.organizationId, mainId, 'image') ? { url: publicAssetUrl(origin, site.key, mainId) } : null;
  const gallery = imageRows.flatMap((image) => {
    const id = assetIdFromUrl(image.assetUrl, site.organizationId);
    return id && validAsset(assets.get(id), site.organizationId, id, 'image') ? [{ url: publicAssetUrl(origin, site.key, id) }] : [];
  });
  let model3d: PublicProduct3D = product3dUnavailable();
  const parsedConfig = modelRow && typeof modelRow.publishedConfig === 'string' ? parseProduct3DConfig(modelRow.publishedConfig) : null;
  const modelId = typeof modelRow?.publishedModelAssetId === 'string' ? modelRow.publishedModelAssetId : null;
  if (parsedConfig && modelId && validAsset(assets.get(modelId), site.organizationId, modelId, 'model')) model3d = { available: true, modelUrl: publicAssetUrl(origin, site.key, modelId), transform: { scale: parsedConfig.transform.scale, position: parsedConfig.transform.position, rotationDegrees: parsedConfig.transform.rotation }, viewer: parsedConfig.viewer, arEnabled: parsedConfig.arEnabled };
  const ctaLabel = typeof snapshot.ctaLabel === 'string' && snapshot.ctaLabel ? snapshot.ctaLabel : null;
  const ctaUrl = typeof snapshot.ctaUrl === 'string' && snapshot.ctaUrl ? snapshot.ctaUrl : null;
  return { key: text(row.productKey), name: snapshot.name, description: snapshot.description, price: { amountMinor: priceMinorUnits, currency: snapshot.currency }, stock, images: { main, gallery }, cta: { label: ctaLabel, url: ctaUrl }, model3d };
}

export async function loadPublicSite(db: D1Database, site: PublicSiteContext, origin: string) {
  const [contentRow, rows] = await Promise.all([publishedContentRow(db, site), publishedChannelProducts(db, site.id, site.organizationId)]);
  const productIds = rows.map((row) => row.productId);
  const [imageRows, modelRows] = await Promise.all([productImageRows(db, site, productIds), product3dRows(db, site, productIds)]);
  const assetIds = new Set<string>();
  const content = await serializeSiteContent(db, site, origin, contentRow);
  for (const row of rows) {
    const snapshot = productSnapshot(row);
    const mainId = assetIdFromUrl(snapshot?.mainAssetUrl, site.organizationId);
    if (mainId) assetIds.add(mainId);
  }
  for (const row of imageRows) { const id = assetIdFromUrl(row.assetUrl, site.organizationId); if (id) assetIds.add(id); }
  for (const row of modelRows) if (typeof row.publishedModelAssetId === 'string' && ASSET_ID.test(row.publishedModelAssetId)) assetIds.add(row.publishedModelAssetId);
  const assets = await assetsById(db, site.organizationId, [...assetIds]);
  const products = rows.flatMap((row) => {
    const item = serializeProduct(row, imageRows.filter((image) => image.productId === row.productId), modelRows.find((model) => model.productId === row.productId), assets, site, origin);
    return item ? [item] : [];
  });
  const versionParts = [site.updatedAt, number(contentRow?.updatedAt), number(contentRow?.publishedAt), ...rows.map((row) => number(row.updatedAt)), ...modelRows.map((row) => number(row.updatedAt))];
  return { schemaVersion: PUBLIC_API_SCHEMA_VERSION, site: publicSite(site), content, products, version: versionParts.join('-') };
}

export async function publicAsset(db: D1Database, siteKey: string, assetId: string) {
  if (!ASSET_ID.test(assetId)) return null;
  const site = await findPublicSite(db, siteKey);
  if (!site) return null;
  const row = await db.prepare('SELECT id,storage_key storageKey,mime_type mimeType,category,archived_at archivedAt FROM organization_assets WHERE id=? AND organization_id=?').bind(assetId, site.organizationId).first<AssetRow>();
  if (!row || row.archivedAt !== null || !row.storageKey.startsWith(`organizations/${site.organizationId}/assets/${assetId}.`)) return null;
  const isModel = row.category === 'model-3d' && row.mimeType === 'model/gltf-binary';
  const isImage = row.category !== 'model-3d' && SUPPORTED_IMAGE_TYPES.includes(row.mimeType as typeof SUPPORTED_IMAGE_TYPES[number]);
  if (!isModel && !isImage) return null;
  const marker = `%${assetId}%`;
  const [content, product, gallery, model] = await Promise.all([
    isImage ? db.prepare('SELECT 1 value FROM channel_content WHERE channel_id=? AND organization_id=? AND published_content LIKE ? LIMIT 1').bind(site.id, site.organizationId, marker).first() : Promise.resolve(null),
    isImage ? db.prepare("SELECT 1 value FROM channel_published_products cp JOIN products p ON p.id=cp.product_id AND p.organization_id=cp.organization_id WHERE cp.channel_id=? AND cp.organization_id=? AND cp.visible=1 AND p.status='active' AND p.published_content IS NOT NULL AND p.published_content LIKE ? LIMIT 1").bind(site.id, site.organizationId, marker).first() : Promise.resolve(null),
    isImage ? db.prepare('SELECT 1 value FROM product_published_images pi JOIN channel_published_products cp ON cp.product_id=pi.product_id AND cp.organization_id=pi.organization_id WHERE cp.channel_id=? AND cp.organization_id=? AND cp.visible=1 AND pi.organization_id=? AND pi.asset_url LIKE ? LIMIT 1').bind(site.id, site.organizationId, site.organizationId, marker).first() : Promise.resolve(null),
    isModel ? db.prepare('SELECT 1 value FROM product_3d_config c JOIN channel_published_products cp ON cp.product_id=c.product_id AND cp.organization_id=c.organization_id WHERE cp.channel_id=? AND cp.organization_id=? AND cp.visible=1 AND c.organization_id=? AND c.published_model_asset_id=? AND c.published_config IS NOT NULL LIMIT 1').bind(site.id, site.organizationId, site.organizationId, assetId).first() : Promise.resolve(null),
  ]);
  if (!content && !product && !gallery && !model) return null;
  return { site, storageKey: row.storageKey, mimeType: row.mimeType };
}
