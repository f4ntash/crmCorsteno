import { getOrganizationProduct } from './organization-products';

export type ChannelProduct = {
  id: string;
  productKey: string;
  name: string;
  status: 'active' | 'archived';
  published: boolean;
  visible: boolean;
  sortOrder: number;
};

export type ChannelProductsState = {
  draft: ChannelProduct[];
  published: ChannelProduct[];
  hasUnpublishedChanges: boolean;
};

type Row = Record<string, unknown>;

function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function number(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function productFromRow(row: Row): ChannelProduct {
  return {
    // The CRM/API operate on the canonical Product id. Association row ids
    // are intentionally internal to the channel snapshot and are not part of
    // the customer-facing product contract.
    id: text(row.productId),
    productKey: text(row.productKey),
    name: text(row.name),
    status: row.status === 'archived' ? 'archived' : 'active',
    published: Boolean(row.published),
    visible: Boolean(Number(row.visible)),
    sortOrder: number(row.sortOrder),
  };
}

export async function channelProductsTablesAvailable(db: D1Database) {
  const row = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='channel_products'").bind().first();
  return Boolean(row);
}

export async function getChannelProducts(db: D1Database, channelId: string, organizationId: string): Promise<ChannelProductsState> {
  if (!await channelProductsTablesAvailable(db)) return { draft: [], published: [], hasUnpublishedChanges: false };
  const [draftRows, publishedRows] = await Promise.all([
    db.prepare(`SELECT cp.id,cp.product_id productId,cp.sort_order sortOrder,cp.visible,p.product_key productKey,p.name,p.status,CASE WHEN p.published_content IS NOT NULL THEN 1 ELSE 0 END published
      FROM channel_products cp JOIN products p ON p.id=cp.product_id AND p.organization_id=cp.organization_id
      WHERE cp.channel_id=? AND cp.organization_id=? ORDER BY cp.sort_order,cp.id`).bind(channelId, organizationId).all<Row>(),
    db.prepare(`SELECT cp.id,cp.product_id productId,cp.sort_order sortOrder,cp.visible,p.product_key productKey,p.name,p.status,CASE WHEN p.published_content IS NOT NULL THEN 1 ELSE 0 END published
      FROM channel_published_products cp JOIN products p ON p.id=cp.product_id AND p.organization_id=cp.organization_id
      WHERE cp.channel_id=? AND cp.organization_id=? ORDER BY cp.sort_order,cp.id`).bind(channelId, organizationId).all<Row>(),
  ]);
  const draft = draftRows.results.map(productFromRow);
  const published = publishedRows.results.map(productFromRow);
  const same = draft.length === published.length && draft.every((item, index) => item.id === published[index]?.id && item.visible === published[index]?.visible && item.sortOrder === published[index]?.sortOrder);
  return { draft, published, hasUnpublishedChanges: !same };
}

export async function channelProduct(db: D1Database, channelId: string, organizationId: string, productId: string) {
  if (!await channelProductsTablesAvailable(db)) return null;
  const row = await db.prepare(`SELECT cp.id,cp.product_id productId,cp.sort_order sortOrder,cp.visible,p.product_key productKey,p.name,p.status,CASE WHEN p.published_content IS NOT NULL THEN 1 ELSE 0 END published
    FROM channel_products cp JOIN products p ON p.id=cp.product_id AND p.organization_id=cp.organization_id
    WHERE cp.channel_id=? AND cp.organization_id=? AND cp.product_id=?`).bind(channelId, organizationId, productId).first<Row>();
  return row ? productFromRow(row) : null;
}

export async function linkProductToChannel(db: D1Database, channelId: string, organizationId: string, productId: string, visible: boolean) {
  if (!await channelProductsTablesAvailable(db)) return null;
  const product = await getOrganizationProduct(db, organizationId, productId, '');
  if (!product || product.status !== 'active') return null;
  const existing = await channelProduct(db, channelId, organizationId, productId);
  if (existing) return existing;
  const order = await db.prepare('SELECT COALESCE(MAX(sort_order),-1)+1 sortOrder FROM channel_products WHERE channel_id=? AND organization_id=?').bind(channelId, organizationId).first<{ sortOrder: number }>();
  await db.prepare('INSERT INTO channel_products (id,organization_id,channel_id,product_id,sort_order,visible,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), organizationId, channelId, productId, number(order?.sortOrder), visible ? 1 : 0, Date.now(), Date.now()).run();
  return channelProduct(db, channelId, organizationId, productId);
}

export async function unlinkProductFromChannel(db: D1Database, channelId: string, organizationId: string, productId: string) {
  if (!await channelProductsTablesAvailable(db)) return false;
  const result = await db.prepare('DELETE FROM channel_products WHERE channel_id=? AND organization_id=? AND product_id=?').bind(channelId, organizationId, productId).run();
  return Boolean(result.meta?.changes);
}

export async function updateChannelProduct(db: D1Database, channelId: string, organizationId: string, productId: string, visible: boolean) {
  if (!await channelProductsTablesAvailable(db)) return null;
  await db.prepare('UPDATE channel_products SET visible=?,updated_at=? WHERE channel_id=? AND organization_id=? AND product_id=?').bind(visible ? 1 : 0, Date.now(), channelId, organizationId, productId).run();
  return channelProduct(db, channelId, organizationId, productId);
}

export async function reorderChannelProducts(db: D1Database, channelId: string, organizationId: string, productIds: readonly string[]) {
  if (!await channelProductsTablesAvailable(db)) return [];
  await db.batch(productIds.map((productId, sortOrder) => db.prepare('UPDATE channel_products SET sort_order=?,updated_at=? WHERE channel_id=? AND organization_id=? AND product_id=?').bind(sortOrder, Date.now(), channelId, organizationId, productId)));
  return getChannelProducts(db, channelId, organizationId);
}

export async function channelProductPublishStatements(db: D1Database, channelId: string, organizationId: string, now = Date.now()) {
  if (!await channelProductsTablesAvailable(db)) return [];
  const rows = await db.prepare('SELECT product_id productId,sort_order sortOrder,visible FROM channel_products WHERE channel_id=? AND organization_id=? ORDER BY sort_order,id').bind(channelId, organizationId).all<{ productId: string; sortOrder: number; visible: number }>();
  return [
    db.prepare('DELETE FROM channel_published_products WHERE channel_id=? AND organization_id=?').bind(channelId, organizationId),
    ...rows.results.map((row) => db.prepare('INSERT INTO channel_published_products (id,organization_id,channel_id,product_id,sort_order,visible,published_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(), organizationId, channelId, row.productId, row.sortOrder, row.visible, now)),
  ];
}

export async function publishedChannelProducts(db: D1Database, channelId: string, organizationId: string) {
  if (!await channelProductsTablesAvailable(db)) return [] as Array<{ productId: string; productKey: string; name: string; description: string; priceMinorUnits: number; currency: string; stock: number; publishedContent: string | null; mainAssetUrl: string | null; ctaLabel: string | null; ctaUrl: string | null; sortOrder: number; visible: number; status: string; updatedAt: number; publishedAt: number | null }>;
  const rows = await db.prepare(`SELECT cp.product_id productId,p.product_key productKey,p.name,p.description,p.price_minor_units priceMinorUnits,p.currency,p.stock,p.published_content publishedContent,p.main_asset_url mainAssetUrl,p.cta_label ctaLabel,p.cta_url ctaUrl,p.status,p.updated_at updatedAt,p.published_at publishedAt,cp.sort_order sortOrder,cp.visible
    FROM channel_published_products cp JOIN products p ON p.id=cp.product_id AND p.organization_id=cp.organization_id
    WHERE cp.channel_id=? AND cp.organization_id=? AND cp.visible=1 AND p.status='active' AND p.published_content IS NOT NULL ORDER BY cp.sort_order,cp.id`).bind(channelId, organizationId).all<Row>();
  return rows.results.map((row) => ({
    productId: text(row.productId), productKey: text(row.productKey), name: text(row.name), description: text(row.description), priceMinorUnits: number(row.priceMinorUnits), currency: text(row.currency, 'ARS'), stock: number(row.stock), publishedContent: typeof row.publishedContent === 'string' ? row.publishedContent : null, mainAssetUrl: typeof row.mainAssetUrl === 'string' ? row.mainAssetUrl : null, ctaLabel: typeof row.ctaLabel === 'string' ? row.ctaLabel : null, ctaUrl: typeof row.ctaUrl === 'string' ? row.ctaUrl : null, sortOrder: number(row.sortOrder), visible: Number(row.visible), status: text(row.status), updatedAt: number(row.updatedAt), publishedAt: row.publishedAt === null || row.publishedAt === undefined ? null : number(row.publishedAt),
  }));
}

export async function linkedProductIds(db: D1Database, channelId: string, organizationId: string) {
  if (!await channelProductsTablesAvailable(db)) return [] as string[];
  const rows = await db.prepare('SELECT product_id productId FROM channel_published_products WHERE channel_id=? AND organization_id=? AND visible=1').bind(channelId, organizationId).all<{ productId: string }>();
  return rows.results.map((row) => row.productId);
}
