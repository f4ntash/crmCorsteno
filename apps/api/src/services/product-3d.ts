import {
  defaultProduct3DConfig,
  parseProduct3DConfig,
  product3DConfigIssues,
  type Product3DConfig,
  type Product3DValidationIssue,
} from '@corsteno/types';
import {
  assetUrl,
  cleanOriginalFilename,
  MODEL_ASSET_CATEGORY,
  organizationModelAssetKey,
  SUPPORTED_MODEL_TYPE,
  validateGlbFile,
} from './assets';

export type Product3DAsset = {
  id: string;
  url: string;
  originalFilename: string;
  displayName: string;
  mimeType: string;
  byteSize: number;
  category: typeof MODEL_ASSET_CATEGORY;
  archivedAt: number | null;
};

export type Product3DStatus = 'not_configured' | 'draft' | 'published' | 'changes' | 'error';

export type Product3DState = {
  productId: string;
  organizationId: string;
  status: Product3DStatus;
  draftConfig: Product3DConfig | null;
  publishedConfig: Product3DConfig | null;
  draftModelAssetId: string | null;
  publishedModelAssetId: string | null;
  draftModel: Product3DAsset | null;
  publishedModel: Product3DAsset | null;
  draftIssues: Product3DValidationIssue[];
  publishedAt: number | null;
};

type Product3DRow = Record<string, unknown>;

function number(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function string(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function nullableNumber(value: unknown) {
  return value === null || value === undefined ? null : number(value);
}

function parsedJson(value: unknown): unknown {
  if (typeof value !== 'string' || !value) return null;
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

function product3DAssetFromRow(row: Product3DRow, origin: string, prefix = ''): Product3DAsset {
  return {
    id: string(row[`${prefix}Id`]),
    url: assetUrl(origin, string(row[`${prefix}StorageKey`])),
    originalFilename: string(row[`${prefix}OriginalFilename`]),
    displayName: string(row[`${prefix}DisplayName`]),
    mimeType: string(row[`${prefix}MimeType`]),
    byteSize: number(row[`${prefix}ByteSize`]),
    category: MODEL_ASSET_CATEGORY,
    archivedAt: nullableNumber(row[`${prefix}ArchivedAt`]),
  };
}

function hasAsset(asset: Product3DAsset | null) {
  return Boolean(asset && asset.category === MODEL_ASSET_CATEGORY && asset.mimeType === SUPPORTED_MODEL_TYPE && asset.archivedAt === null);
}

function configIssues(raw: unknown, path: string): Product3DValidationIssue[] {
  const parsed = parsedJson(raw);
  return raw === null || raw === undefined ? [{ code: 'PRODUCT_3D_CONFIG_REQUIRED', path, message: 'Guardá una configuración técnica válida antes de publicar.' }] : parsed === null ? [{ code: 'PRODUCT_3D_CONFIG_INVALID', path, message: 'La configuración 3D guardada no es válida.' }] : product3DConfigIssues(parsed, path);
}

export async function getProduct3D(db: D1Database, organizationId: string, productId: string, origin: string): Promise<Product3DState> {
  const row = await db.prepare(`SELECT c.product_id productId,c.organization_id organizationId,c.draft_config draftConfig,c.published_config publishedConfig,c.draft_model_asset_id draftModelAssetId,c.published_model_asset_id publishedModelAssetId,c.published_at publishedAt,
    da.id draftModelId,da.storage_key draftModelStorageKey,da.original_filename draftModelOriginalFilename,da.display_name draftModelDisplayName,da.mime_type draftModelMimeType,da.byte_size draftModelByteSize,da.archived_at draftModelArchivedAt,
    pa.id publishedModelId,pa.storage_key publishedModelStorageKey,pa.original_filename publishedModelOriginalFilename,pa.display_name publishedModelDisplayName,pa.mime_type publishedModelMimeType,pa.byte_size publishedModelByteSize,pa.archived_at publishedModelArchivedAt
    FROM product_3d_config c
    LEFT JOIN organization_assets da ON da.id=c.draft_model_asset_id AND da.organization_id=c.organization_id
    LEFT JOIN organization_assets pa ON pa.id=c.published_model_asset_id AND pa.organization_id=c.organization_id
    WHERE c.product_id=? AND c.organization_id=?`).bind(productId, organizationId).first<Product3DRow>();
  if (!row) return { productId, organizationId, status: 'not_configured', draftConfig: null, publishedConfig: null, draftModelAssetId: null, publishedModelAssetId: null, draftModel: null, publishedModel: null, draftIssues: [], publishedAt: null };

  const draftModel = row.draftModelId ? product3DAssetFromRow(row, origin, 'draftModel') : null;
  const publishedModel = row.publishedModelId ? product3DAssetFromRow(row, origin, 'publishedModel') : null;
  const draftConfig = parseProduct3DConfig(string(row.draftConfig)) ?? null;
  const publishedConfig = parseProduct3DConfig(string(row.publishedConfig)) ?? null;
  const draftIssues = row.draftConfig === null || row.draftConfig === undefined ? [] : draftConfig ? [] : configIssues(row.draftConfig, 'draftConfig');
  const publishedIssues = row.publishedConfig === null || row.publishedConfig === undefined ? [] : publishedConfig ? [] : configIssues(row.publishedConfig, 'publishedConfig');
  const draftAssetInvalid = Boolean(row.draftModelAssetId) && !hasAsset(draftModel);
  const publishedAssetInvalid = Boolean(row.publishedModelAssetId) && !hasAsset(publishedModel);
  if (draftAssetInvalid) draftIssues.push({ code: 'PRODUCT_3D_MODEL_INVALID', path: 'draftModelAssetId', message: 'El modelo de borrador no es un GLB activo de la organización.' });
  if (publishedAssetInvalid) publishedIssues.push({ code: 'PRODUCT_3D_PUBLISHED_MODEL_INVALID', path: 'publishedModelAssetId', message: 'El modelo 3D publicado no está disponible.' });
  const hasDraft = row.draftConfig !== null && row.draftConfig !== undefined || Boolean(row.draftModelAssetId);
  const hasPublished = row.publishedConfig !== null && row.publishedConfig !== undefined || Boolean(row.publishedModelAssetId);
  const sameSnapshot = row.draftConfig === row.publishedConfig && row.draftModelAssetId === row.publishedModelAssetId;
  const status: Product3DStatus = publishedIssues.length || draftIssues.length && hasDraft ? 'error' : !hasDraft && !hasPublished ? 'not_configured' : !hasPublished ? 'draft' : sameSnapshot ? 'published' : 'changes';
  return {
    productId,
    organizationId,
    status,
    draftConfig,
    publishedConfig,
    draftModelAssetId: row.draftModelAssetId === null || row.draftModelAssetId === undefined ? null : string(row.draftModelAssetId),
    publishedModelAssetId: row.publishedModelAssetId === null || row.publishedModelAssetId === undefined ? null : string(row.publishedModelAssetId),
    draftModel,
    publishedModel,
    draftIssues,
    publishedAt: nullableNumber(row.publishedAt),
  };
}

export async function getProduct3DModelAssets(db: D1Database, organizationId: string, origin: string) {
  const rows = await db.prepare(`SELECT id,storage_key storageKey,original_filename originalFilename,display_name displayName,mime_type mimeType,byte_size byteSize,archived_at archivedAt
    FROM organization_assets WHERE organization_id=? AND category=? AND mime_type=? AND archived_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 100`).bind(organizationId, MODEL_ASSET_CATEGORY, SUPPORTED_MODEL_TYPE).all<Product3DRow>();
  return rows.results.map((row) => product3DAssetFromRow({ draftModelId: row.id, draftModelStorageKey: row.storageKey, draftModelOriginalFilename: row.originalFilename, draftModelDisplayName: row.displayName, draftModelMimeType: row.mimeType, draftModelByteSize: row.byteSize, draftModelArchivedAt: row.archivedAt }, origin, 'draftModel'));
}

async function modelAsset(db: D1Database, organizationId: string, assetId: string) {
  const row = await db.prepare('SELECT id,storage_key storageKey,original_filename originalFilename,display_name displayName,mime_type mimeType,byte_size byteSize,category,archived_at archivedAt FROM organization_assets WHERE id=? AND organization_id=?').bind(assetId, organizationId).first<Product3DRow>();
  if (!row || row.category !== MODEL_ASSET_CATEGORY || row.mimeType !== SUPPORTED_MODEL_TYPE || row.archivedAt !== null && row.archivedAt !== undefined) return null;
  return row;
}

export async function validateProduct3DDraft(db: D1Database, organizationId: string, productId: string, draftModelAssetId: string | null, draftConfig: unknown) {
  const issues = product3DConfigIssues(draftConfig, 'draftConfig');
  if (!draftModelAssetId) issues.unshift({ code: 'PRODUCT_3D_MODEL_REQUIRED', path: 'draftModelAssetId', message: 'Seleccioná un modelo GLB antes de publicar.' });
  else if (!await modelAsset(db, organizationId, draftModelAssetId)) issues.unshift({ code: 'PRODUCT_3D_MODEL_INVALID', path: 'draftModelAssetId', message: 'El modelo debe ser un GLB activo de la organización.' });
  const product = await db.prepare("SELECT id FROM products WHERE id=? AND organization_id=? AND status='active'").bind(productId, organizationId).first();
  if (!product) issues.unshift({ code: 'PRODUCT_NOT_ACTIVE', path: 'productId', message: 'El producto no está disponible para publicar configuración 3D.' });
  return issues;
}

export async function updateProduct3DDraft(db: D1Database, organizationId: string, productId: string, changes: { draftModelAssetId?: string | null; draftConfig?: Product3DConfig | null }, origin = '') {
  const current = await db.prepare('SELECT draft_model_asset_id draftModelAssetId,draft_config draftConfig FROM product_3d_config WHERE product_id=? AND organization_id=?').bind(productId, organizationId).first<{ draftModelAssetId: string | null; draftConfig: string | null }>();
  const modelAssetId = changes.draftModelAssetId === undefined ? current?.draftModelAssetId ?? null : changes.draftModelAssetId;
  const config = changes.draftConfig === undefined ? current?.draftConfig ?? null : changes.draftConfig === null ? null : JSON.stringify(changes.draftConfig);
  const now = Date.now();
  await db.prepare(`INSERT INTO product_3d_config (product_id,organization_id,draft_config,published_config,draft_model_asset_id,published_model_asset_id,created_at,updated_at,published_at)
    VALUES (?,?,?,NULL,?,NULL,?,?,NULL)
    ON CONFLICT(product_id) DO UPDATE SET draft_config=excluded.draft_config,draft_model_asset_id=excluded.draft_model_asset_id,updated_at=excluded.updated_at`).bind(productId, organizationId, config, modelAssetId, now, now).run();
  return getProduct3D(db, organizationId, productId, origin);
}

export async function publishProduct3D(db: D1Database, organizationId: string, productId: string, origin: string) {
  const current = await db.prepare('SELECT draft_model_asset_id draftModelAssetId,draft_config draftConfig FROM product_3d_config WHERE product_id=? AND organization_id=?').bind(productId, organizationId).first<{ draftModelAssetId: string | null; draftConfig: string | null }>();
  const parsed = current?.draftConfig ? parsedJson(current.draftConfig) : null;
  const config = parsed ? parseProduct3DConfig(current?.draftConfig ?? '') : null;
  const issues = await validateProduct3DDraft(db, organizationId, productId, current?.draftModelAssetId ?? null, config);
  if (issues.length) return { state: null, issues };
  const now = Date.now();
  await db.prepare('UPDATE product_3d_config SET published_config=?,published_model_asset_id=?,published_at=?,updated_at=? WHERE product_id=? AND organization_id=?').bind(JSON.stringify(config), current!.draftModelAssetId, now, now, productId, organizationId).run();
  return { state: await getProduct3D(db, organizationId, productId, origin), issues: [] as Product3DValidationIssue[] };
}

export async function uploadProduct3DModel(db: D1Database, bucket: R2Bucket | undefined, organizationId: string, actorUserId: string, file: File, origin: string) {
  const validation = await validateGlbFile(file);
  if (!validation.ok) return { asset: null, error: validation };
  if (!bucket) return { asset: null, error: { ok: false as const, status: 503 as const, message: 'El almacenamiento de modelos no está configurado' } };
  const id = crypto.randomUUID();
  const key = organizationModelAssetKey(organizationId, id);
  try {
    await bucket.put(key, validation.bytes, { httpMetadata: { contentType: SUPPORTED_MODEL_TYPE } });
    const now = Date.now();
    const originalFilename = cleanOriginalFilename(file.name).slice(0, 160) || 'modelo.glb';
    await db.prepare('INSERT INTO organization_assets (id,organization_id,storage_key,original_filename,display_name,mime_type,byte_size,category,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(id, organizationId, key, originalFilename, originalFilename, SUPPORTED_MODEL_TYPE, validation.bytes.byteLength, MODEL_ASSET_CATEGORY, actorUserId, now, now).run();
    return { asset: { id, url: assetUrl(origin, key), originalFilename, displayName: originalFilename, mimeType: SUPPORTED_MODEL_TYPE, byteSize: validation.bytes.byteLength, category: MODEL_ASSET_CATEGORY, archivedAt: null } as Product3DAsset, error: null };
  } catch {
    await bucket.delete(key).catch(() => undefined);
    return { asset: null, error: { ok: false as const, status: 503 as const, message: 'No se pudo guardar el modelo' } };
  }
}

export { defaultProduct3DConfig };
