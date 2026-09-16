import {
  isProductSurfaceConfig,
  productSurfaceConfigIssues,
  SURFACE_MATERIAL_SCHEMA_VERSION,
  type ProductSurfaceConfig,
  type SurfaceMaterialAssetRefs,
  type SurfaceMaterialConfig,
} from '@corsteno/types';
import {
  assetUrl,
  SURFACE_MATERIAL_ASSET_CATEGORY,
  SUPPORTED_SURFACE_MATERIAL_MAP_TYPE,
} from './assets';

export type SurfaceMaterialAsset = {
  id: string;
  url: string;
  originalFilename: string;
  displayName: string;
  mimeType: string;
  byteSize: number;
  category: typeof SURFACE_MATERIAL_ASSET_CATEGORY;
  archivedAt: number | null;
};

export type ProductSurfaceStatus = 'not_configured' | 'draft' | 'published' | 'changes' | 'error';

export type ProductSurfaceState = {
  productId: string;
  organizationId: string;
  status: ProductSurfaceStatus;
  draftConfig: ProductSurfaceConfig | null;
  publishedConfig: ProductSurfaceConfig | null;
  draftAssets: { baseColor: SurfaceMaterialAsset | null; normal: SurfaceMaterialAsset | null; roughness: SurfaceMaterialAsset | null };
  publishedAssets: { baseColor: SurfaceMaterialAsset | null; normal: SurfaceMaterialAsset | null; roughness: SurfaceMaterialAsset | null };
  draftIssues: Array<{ code: string; path: string; message: string }>;
  publishedAt: number | null;
  draftVersion: number;
  publishedVersion: number | null;
};

type Row = Record<string, unknown>;
type SurfaceMaterialAssetRows = { baseColor: Row | null; normal: Row | null; roughness: Row | null };

function number(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function string(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function nullableNumber(value: unknown) {
  return value === null || value === undefined ? null : number(value);
}

function parseConfig(value: unknown): ProductSurfaceConfig | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isProductSurfaceConfig(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function refs(config: ProductSurfaceConfig | null): SurfaceMaterialAssetRefs | null {
  return config?.mode === 'texture' && config.assets ? config.assets : null;
}

function assetFromRow(row: Row | null, origin: string): SurfaceMaterialAsset | null {
  if (!row || row.id === undefined || row.archivedAt !== null && row.archivedAt !== undefined) return null;
  return {
    id: string(row.id),
    url: assetUrl(origin, string(row.storageKey)),
    originalFilename: string(row.originalFilename),
    displayName: string(row.displayName),
    mimeType: string(row.mimeType),
    byteSize: number(row.byteSize),
    category: SURFACE_MATERIAL_ASSET_CATEGORY,
    archivedAt: nullableNumber(row.archivedAt),
  };
}

function emptyAssets() {
  return { baseColor: null, normal: null, roughness: null } as const;
}

function issue(code: string, path: string, message: string) {
  return { code, path, message };
}

function schemaIssues(value: unknown, path: string) {
  return productSurfaceConfigIssues(value, path).map((pathValue) => issue('PRODUCT_SURFACE_CONFIG_INVALID', pathValue, 'La configuración de superficie no es válida.'));
}

async function loadAssets(db: D1Database, organizationId: string, config: ProductSurfaceConfig | null) {
  const assetRefs = refs(config);
  if (!assetRefs) return emptyAssets();
  const ids = [assetRefs.baseColorAssetId, assetRefs.normalAssetId, assetRefs.roughnessAssetId].filter((id): id is string => typeof id === 'string' && Boolean(id));
  if (!ids.length) return emptyAssets();
  const rows = await db.prepare(`SELECT id,storage_key storageKey,original_filename originalFilename,display_name displayName,mime_type mimeType,byte_size byteSize,category,archived_at archivedAt FROM organization_assets WHERE organization_id=? AND id IN (${ids.map(() => '?').join(',')})`).bind(organizationId, ...ids).all<Row>();
  const byId = new Map(rows.results.map((row) => [String(row.id), row]));
  const valid = (id: string | null | undefined) => {
    if (!id) return null;
    const row = byId.get(id);
    return row && row.category === SURFACE_MATERIAL_ASSET_CATEGORY && row.mimeType === SUPPORTED_SURFACE_MATERIAL_MAP_TYPE && (row.archivedAt === null || row.archivedAt === undefined) ? row : null;
  };
  return { baseColor: valid(assetRefs.baseColorAssetId), normal: valid(assetRefs.normalAssetId), roughness: valid(assetRefs.roughnessAssetId) };
}

async function validateAssetRefs(db: D1Database, organizationId: string, config: ProductSurfaceConfig, path: string) {
  if (config.mode !== 'texture' || !config.assets) return [] as Array<{ code: string; path: string; message: string }>;
  const ids = [config.assets.baseColorAssetId, config.assets.normalAssetId, config.assets.roughnessAssetId].filter((id): id is string => typeof id === 'string' && Boolean(id));
  const rows = ids.length ? await db.prepare(`SELECT id,category,mime_type mimeType,archived_at archivedAt FROM organization_assets WHERE organization_id=? AND id IN (${ids.map(() => '?').join(',')})`).bind(organizationId, ...ids).all<Row>() : { results: [] as Row[] };
  const valid = new Map(rows.results.map((row) => [String(row.id), row]));
  const checks: Array<[string, string | null | undefined]> = [['baseColorAssetId', config.assets.baseColorAssetId], ['normalAssetId', config.assets.normalAssetId], ['roughnessAssetId', config.assets.roughnessAssetId]];
  return checks.flatMap(([key, id]) => {
    if (!id) return [];
    const row = valid.get(id);
    return row && row.category === SURFACE_MATERIAL_ASSET_CATEGORY && row.mimeType === SUPPORTED_SURFACE_MATERIAL_MAP_TYPE && (row.archivedAt === null || row.archivedAt === undefined)
      ? []
      : [issue('PRODUCT_SURFACE_ASSET_INVALID', `${path}.assets.${key}`, 'El mapa debe ser un WebP activo de la organización.')];
  });
}

export async function productSurfaceConfigIssuesForDb(db: D1Database, organizationId: string, productId: string, config: unknown, path = 'draftConfig') {
  const issues = schemaIssues(config, path);
  if (issues.length) return issues;
  const typed = config as ProductSurfaceConfig;
  issues.push(...await validateAssetRefs(db, organizationId, typed, path));
  const product = await db.prepare("SELECT id FROM products WHERE id=? AND organization_id=? AND status='active'").bind(productId, organizationId).first();
  if (!product) issues.push(issue('PRODUCT_NOT_ACTIVE', 'productId', 'El producto no está disponible para publicar configuración de superficie.'));
  return issues;
}

async function stateFromRow(db: D1Database, row: Row, origin: string): Promise<ProductSurfaceState> {
  const draftConfig = parseConfig(row.draftConfig);
  const publishedConfig = parseConfig(row.publishedConfig);
  const [draftAssets, publishedAssets] = await Promise.all([loadAssets(db, string(row.organizationId), draftConfig), loadAssets(db, string(row.organizationId), publishedConfig)]);
  const draftIssues = row.draftConfig === null || row.draftConfig === undefined ? [] : draftConfig ? [] : schemaIssues(row.draftConfig, 'draftConfig');
  const hasDraft = row.draftConfig !== null && row.draftConfig !== undefined;
  const hasPublished = row.publishedConfig !== null && row.publishedConfig !== undefined;
  const missingDraftBase = draftConfig?.mode === 'texture' && !draftAssets.baseColor;
  if (missingDraftBase) draftIssues.push(issue('PRODUCT_SURFACE_ASSET_INVALID', 'draftConfig.assets.baseColorAssetId', 'El mapa Base Color no está disponible.'));
  const missingPublishedBase = publishedConfig?.mode === 'texture' && !publishedAssets.baseColor;
  const publishedInvalid = missingPublishedBase;
  const sameSnapshot = row.draftConfig === row.publishedConfig;
  const status: ProductSurfaceStatus = draftIssues.length && hasDraft || publishedInvalid ? 'error' : !hasDraft && !hasPublished ? 'not_configured' : !hasPublished ? 'draft' : sameSnapshot ? 'published' : 'changes';
  return {
    productId: string(row.productId), organizationId: string(row.organizationId), status,
    draftConfig, publishedConfig,
    draftAssets: { baseColor: assetFromRow(draftAssets.baseColor, origin), normal: assetFromRow(draftAssets.normal, origin), roughness: assetFromRow(draftAssets.roughness, origin) },
    publishedAssets: { baseColor: assetFromRow(publishedAssets.baseColor, origin), normal: assetFromRow(publishedAssets.normal, origin), roughness: assetFromRow(publishedAssets.roughness, origin) },
    draftIssues,
    publishedAt: nullableNumber(row.publishedAt), draftVersion: number(row.draftVersion, 1), publishedVersion: nullableNumber(row.publishedVersion),
  };
}

export async function getProductSurface(db: D1Database, organizationId: string, productId: string, origin: string): Promise<ProductSurfaceState> {
  const row = await db.prepare('SELECT product_id productId,organization_id organizationId,draft_config draftConfig,published_config publishedConfig,draft_version draftVersion,published_version publishedVersion,published_at publishedAt FROM product_surface_config WHERE product_id=? AND organization_id=?').bind(productId, organizationId).first<Row>();
  if (!row) return { productId, organizationId, status: 'not_configured', draftConfig: null, publishedConfig: null, draftAssets: emptyAssets(), publishedAssets: emptyAssets(), draftIssues: [], publishedAt: null, draftVersion: 0, publishedVersion: null };
  return stateFromRow(db, row, origin);
}

export async function updateProductSurfaceDraft(db: D1Database, organizationId: string, productId: string, config: ProductSurfaceConfig | null, origin: string) {
  const current = await db.prepare('SELECT draft_config draftConfig,published_config publishedConfig,draft_version draftVersion,published_version publishedVersion,published_at publishedAt,created_at createdAt FROM product_surface_config WHERE product_id=? AND organization_id=?').bind(productId, organizationId).first<Row>();
  const now = Date.now();
  const draftVersion = Math.max(1, number(current?.draftVersion, 0) + 1);
  const serialized = config === null ? null : JSON.stringify(config);
  await db.prepare(`INSERT INTO product_surface_config (product_id,organization_id,draft_config,published_config,draft_version,published_version,created_at,updated_at,published_at) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(product_id) DO UPDATE SET draft_config=excluded.draft_config,draft_version=excluded.draft_version,updated_at=excluded.updated_at`).bind(productId, organizationId, serialized, current?.publishedConfig ?? null, draftVersion, current?.publishedVersion ?? null, number(current?.createdAt, now), now, current?.publishedAt ?? null).run();
  return getProductSurface(db, organizationId, productId, origin);
}

export async function publishProductSurface(db: D1Database, organizationId: string, productId: string, origin: string) {
  const current = await db.prepare('SELECT draft_config draftConfig,draft_version draftVersion FROM product_surface_config WHERE product_id=? AND organization_id=?').bind(productId, organizationId).first<Row>();
  const config = parseConfig(current?.draftConfig);
  const issues = config ? await productSurfaceConfigIssuesForDb(db, organizationId, productId, config, 'draftConfig') : [issue('PRODUCT_SURFACE_CONFIG_REQUIRED', 'draftConfig', 'Guardá una configuración de superficie válida antes de publicar.')];
  if (issues.length) return { state: null, issues };
  const now = Date.now();
  await db.prepare('UPDATE product_surface_config SET published_config=?,published_version=?,published_at=?,updated_at=? WHERE product_id=? AND organization_id=?').bind(JSON.stringify(config), number(current?.draftVersion, 1), now, now, productId, organizationId).run();
  return { state: await getProductSurface(db, organizationId, productId, origin), issues: [] as Array<{ code: string; path: string; message: string }> };
}

export function publicSurfaceConfig(config: ProductSurfaceConfig | null, assets: SurfaceMaterialAssetRows, origin: string): SurfaceMaterialConfig | null {
  if (!config || !config.enabled) return null;
  if (config.mode === 'solid') {
    return { schemaVersion: SURFACE_MATERIAL_SCHEMA_VERSION, enabled: true, mode: 'solid', baseColor: config.baseColor!, physicalWidthM: config.physicalWidthM, physicalHeightM: config.physicalHeightM, roughness: config.roughness, metalness: config.metalness, rotationDegrees: config.rotationDegrees, repeatMode: 'repeat', fallbackColor: config.fallbackColor, orientation: config.orientation, compatibleSurfaces: config.compatibleSurfaces };
  }
  if (!assets.baseColor) {
    return { schemaVersion: SURFACE_MATERIAL_SCHEMA_VERSION, enabled: true, mode: 'solid', baseColor: config.fallbackColor, physicalWidthM: config.physicalWidthM, physicalHeightM: config.physicalHeightM, roughness: config.roughness, metalness: config.metalness, rotationDegrees: config.rotationDegrees, repeatMode: 'repeat', fallbackColor: config.fallbackColor, orientation: config.orientation, compatibleSurfaces: config.compatibleSurfaces, demoPlaceholder: true };
  }
  return { schemaVersion: SURFACE_MATERIAL_SCHEMA_VERSION, enabled: true, mode: 'texture', physicalWidthM: config.physicalWidthM, physicalHeightM: config.physicalHeightM, roughness: config.roughness, metalness: config.metalness, rotationDegrees: config.rotationDegrees, repeatMode: 'repeat', fallbackColor: config.fallbackColor, normalScale: config.normalScale, orientation: config.orientation, compatibleSurfaces: config.compatibleSurfaces, assets: { baseColorTexture: assetUrl(origin, string(assets.baseColor.storageKey)), ...(assets.normal ? { normalTexture: assetUrl(origin, string(assets.normal.storageKey)) } : {}), ...(assets.roughness ? { roughnessTexture: assetUrl(origin, string(assets.roughness.storageKey)) } : {}) } };
}

export async function publishedSurfaceConfigs(db: D1Database, organizationId: string, productIds: readonly string[], origin: string) {
  const result = new Map<string, SurfaceMaterialConfig>();
  if (!productIds.length) return result;
  const rows = await db.prepare(`SELECT product_id productId,published_config publishedConfig FROM product_surface_config WHERE organization_id=? AND product_id IN (${productIds.map(() => '?').join(',')})`).bind(organizationId, ...productIds).all<Row>();
  for (const row of rows.results) {
    const config = parseConfig(row.publishedConfig);
    if (!config || !config.enabled) continue;
    const assetRefs = refs(config);
    const ids = assetRefs ? [assetRefs.baseColorAssetId, assetRefs.normalAssetId, assetRefs.roughnessAssetId].filter((id): id is string => typeof id === 'string' && Boolean(id)) : [];
    const assets = assetRefs && ids.length ? await db.prepare(`SELECT id,storage_key storageKey,original_filename originalFilename,display_name displayName,mime_type mimeType,byte_size byteSize,category,archived_at archivedAt FROM organization_assets WHERE organization_id=? AND id IN (${ids.map(() => '?').join(',')})`).bind(organizationId, ...ids).all<Row>() : { results: [] as Row[] };
    const byId = new Map(assets.results.filter((asset) => asset.category === SURFACE_MATERIAL_ASSET_CATEGORY && asset.mimeType === SUPPORTED_SURFACE_MATERIAL_MAP_TYPE && (asset.archivedAt === null || asset.archivedAt === undefined)).map((asset) => [String(asset.id), asset]));
    const mapped = publicSurfaceConfig(config, { baseColor: assetRefs?.baseColorAssetId ? byId.get(assetRefs.baseColorAssetId) ?? null : null, normal: assetRefs?.normalAssetId ? byId.get(assetRefs.normalAssetId) ?? null : null, roughness: assetRefs?.roughnessAssetId ? byId.get(assetRefs.roughnessAssetId) ?? null : null }, origin);
    if (mapped) result.set(String(row.productId), mapped);
  }
  return result;
}
