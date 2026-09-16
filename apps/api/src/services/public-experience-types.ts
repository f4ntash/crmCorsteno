import type { CommercialEntitlements } from '@corsteno/types';
import type { CatalogProductMetadata } from '@corsteno/types';
import type { SurfaceMaterialConfig } from '@corsteno/types';
import { buildRouletteOutcomes } from './roulette-selector';
import { validDraftConfig, type DraftConfig } from './roulette-config';
import { PRODUCT_CATALOG_TYPE, validateProductCatalogDraft } from './product-catalog';
import { firstClassProductsAvailable, publishedCatalogProductsFirstClass } from './organization-products';
import { publishedSurfaceConfigs } from './product-surface';

export type PublicExperienceShell = {
  id: string;
  organizationId: string;
  name: string;
  type: string;
  publishedConfig: string | null;
  startsAt: string | null;
  endsAt: string | null;
};

export type PublicExperienceAdapterContext = {
  db: D1Database;
  origin?: string;
  experience: PublicExperienceShell;
  featureEntitlements: CommercialEntitlements;
  deviceId: string | null;
  sessionId: string | null;
};

export type PublicExperiencePayload = { type: string };
export type PublicExperienceBuildResult<TPayload extends PublicExperiencePayload = PublicExperiencePayload> =
  | { kind: 'ready'; payload: TPayload }
  | { kind: 'inactive'; reason: 'sold_out' | 'unavailable'; status?: 503 };

export type PublicExperienceAdapter<TPayload extends PublicExperiencePayload = PublicExperiencePayload> = {
  type: string;
  buildPublicPayload: (context: PublicExperienceAdapterContext) => Promise<PublicExperienceBuildResult<TPayload>>;
};

export type PublicExperienceRegistry = ReadonlyMap<string, PublicExperienceAdapter>;

export type RoulettePublicRecovery = {
  spinId: string;
  segmentIndex: number;
  segment: { id: string; prizeId: string | null };
  prize: { id: string; name: string; iconUrl: string | null } | null;
  claim: { code: string; status: 'active' | 'redeemed' };
  prizeAvailability: Record<string, 'available' | 'sold_out'>;
};

export type RoulettePublicExperiencePayload = PublicExperiencePayload & {
  type: 'roulette';
  config: DraftConfig;
  prizeAvailability: Record<string, 'available' | 'sold_out'>;
  recovery?: RoulettePublicRecovery;
};

function renderableRouletteConfig(config: DraftConfig): DraftConfig {
  return {
    schemaVersion: config.schemaVersion,
    backgroundColor: config.backgroundColor,
    ...(config.branding ? { branding: { logoUrl: config.branding.logoUrl ?? null, backgroundImageUrl: config.branding.backgroundImageUrl ?? null } } : {}),
    ...(config.content ? { content: {
      ...(config.content.title !== undefined ? { title: config.content.title } : {}),
      ...(config.content.intro !== undefined ? { intro: config.content.intro } : {}),
      ...(config.content.spinButtonLabel !== undefined ? { spinButtonLabel: config.content.spinButtonLabel } : {}),
      ...(config.content.winMessage !== undefined ? { winMessage: config.content.winMessage } : {}),
      ...(config.content.noPrizeMessage !== undefined ? { noPrizeMessage: config.content.noPrizeMessage } : {}),
    } } : {}),
    prizes: config.prizes.map(({ id, name, iconUrl }) => ({ id, name, iconUrl: iconUrl ?? null })),
    segments: config.segments.map(({ id, color, prizeId }) => ({ id, color, prizeId })),
    ...(config.effects ? { effects: {
      ...(config.effects.sound !== undefined ? { sound: config.effects.sound } : {}),
      ...(config.effects.vibration !== undefined ? { vibration: config.effects.vibration } : {}),
      ...(config.effects.celebration !== undefined ? { celebration: config.effects.celebration } : {}),
    } } : {}),
    ...(config.resultCta ? { resultCta: {
      ...(config.resultCta.enabled !== undefined ? { enabled: config.resultCta.enabled } : {}),
      ...(config.resultCta.label !== undefined ? { label: config.resultCta.label } : {}),
      ...(config.resultCta.url !== undefined ? { url: config.resultCta.url } : {}),
    } } : {}),
  };
}

export type CatalogPublicProduct = {
  id: string;
  name: string;
  description: string;
  priceMinorUnits: number;
  currency: string;
  priceUnit: string | null;
  metadata: CatalogProductMetadata | null;
  stock: number;
  mainImageUrl: string | null;
  gallery: string[];
  ctaLabel: string | null;
  ctaUrl: string | null;
  surfaceConfig: SurfaceMaterialConfig | null;
};

const PUBLIC_CATALOG_METADATA_KEYS = new Set(['material', 'color', 'finish', 'format', 'width', 'height', 'thickness', 'recommendedUse', 'environment', 'surface']);

export function sanitizePublicCatalogMetadata(value: unknown): CatalogProductMetadata | null {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const safe: CatalogProductMetadata = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!PUBLIC_CATALOG_METADATA_KEYS.has(key)) continue;
    if (typeof item === 'string' && item.length <= 120 || typeof item === 'number' && Number.isFinite(item) || typeof item === 'boolean') safe[key] = item as string | number | boolean;
  }
  return Object.keys(safe).length ? safe : null;
}

export type ProductCatalogPublicExperiencePayload = PublicExperiencePayload & {
  type: 'product-catalog';
  config: { schemaVersion: 1; title?: string; intro?: string };
  products: CatalogPublicProduct[];
};

export function validPublicParticipantId(value: unknown) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parsePublishedConfig(value: string | null): unknown {
  if (value === null) return null;
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== 'object' || parsed === null) throw new Error('invalid stored JSON');
  return parsed;
}

const roulettePublicExperienceAdapter: PublicExperienceAdapter<RoulettePublicExperiencePayload> = {
  type: 'roulette',
  async buildPublicPayload({ db, experience, deviceId, sessionId }) {
    let config: unknown;
    try { config = parsePublishedConfig(experience.publishedConfig); } catch { return { kind: 'inactive', reason: 'unavailable', status: 503 }; }
    if (!config || !validDraftConfig(config)) return { kind: 'inactive', reason: 'unavailable', status: 503 };

    const inventoryRows = await db.prepare('SELECT prize_id prizeId, stock_mode stockMode, stock_available stockAvailable FROM experience_prize_inventory WHERE experience_id=?').bind(experience.id).all<{ prizeId: string; stockMode: 'limited' | 'unlimited'; stockAvailable: number | null }>();
    const prizeAvailability = Object.fromEntries(inventoryRows.results.map((item) => [item.prizeId, item.stockMode === 'limited' && (item.stockAvailable ?? 0) <= 0 ? 'sold_out' : 'available'])) as Record<string, 'available' | 'sold_out'>;
    const inventory = new Map(inventoryRows.results.map((item) => [item.prizeId, { ...item, deliveredCount: 0 }]));
    const configuredWinningPrize = config.prizes.some((prize) => prize.enabled !== false && config.segments.some((segment) => segment.prizeId === prize.id));
    const hasAvailableWinningPrize = buildRouletteOutcomes(config, inventory).some((outcome) => outcome.prizeId !== null);
    if (configuredWinningPrize && !hasAvailableWinningPrize) return { kind: 'inactive', reason: 'sold_out' };

    let recovery: RoulettePublicRecovery | undefined;
    if (validPublicParticipantId(deviceId) && validPublicParticipantId(sessionId)) {
      const recovered = await db.prepare('SELECT s.id spinId,s.segment_id segmentId,s.segment_index segmentIndex,s.prize_id prizeId,c.code,c.status FROM experience_spins s JOIN roulette_prize_claims c ON c.spin_id=s.id AND c.experience_id=s.experience_id AND c.organization_id=s.organization_id WHERE s.experience_id=? AND s.organization_id=? AND s.participant_device_id=? AND s.participant_session_id=? AND c.status IN (\'active\',\'redeemed\') ORDER BY s.created_at DESC LIMIT 1').bind(experience.id, experience.organizationId, deviceId, sessionId).first<{ spinId: string; segmentId: string; segmentIndex: number; prizeId: string; code: string; status: 'active' | 'redeemed' }>();
      if (recovered) {
        const segment = config.segments[recovered.segmentIndex];
        const prize = config.prizes.find((item) => item.id === recovered.prizeId);
        if (segment && prize) recovery = { spinId: recovered.spinId, segmentIndex: recovered.segmentIndex, segment: { id: segment.id, prizeId: segment.prizeId }, prize: { id: prize.id, name: prize.name, iconUrl: prize.iconUrl ?? null }, claim: { code: recovered.code, status: recovered.status }, prizeAvailability };
      }
    }
    return { kind: 'ready', payload: { type: 'roulette', config: renderableRouletteConfig(config), prizeAvailability, ...(recovery ? { recovery } : {}) } };
  },
};

const productCatalogPublicExperienceAdapter: PublicExperienceAdapter<ProductCatalogPublicExperiencePayload> = {
  type: PRODUCT_CATALOG_TYPE,
  async buildPublicPayload({ db, experience, origin }) {
    let config: unknown;
    try { config = parsePublishedConfig(experience.publishedConfig); } catch { return { kind: 'inactive', reason: 'unavailable', status: 503 }; }
    if (!validateProductCatalogDraft(config)) return { kind: 'inactive', reason: 'unavailable', status: 503 };
    if (await firstClassProductsAvailable(db)) {
      const products = await publishedCatalogProductsFirstClass(db, experience.id, experience.organizationId, origin ?? '');
      if (!products.length) return { kind: 'inactive', reason: 'unavailable', status: 503 };
      return { kind: 'ready', payload: { type: PRODUCT_CATALOG_TYPE, config, products: products.map((product) => ({ ...product, priceUnit: typeof product.priceUnit === 'string' && product.priceUnit.trim() ? product.priceUnit : null, metadata: sanitizePublicCatalogMetadata(product.metadata) })) } };
    }
    const [products, images] = await Promise.all([
      db.prepare('SELECT id,source_product_id sourceProductId,name,description,price_minor_units priceMinorUnits,currency,price_unit priceUnit,metadata,stock,main_asset_url mainImageUrl,cta_label ctaLabel,cta_url ctaUrl,sort_order sortOrder FROM catalog_published_products WHERE experience_id=? AND organization_id=? AND stock>=0 ORDER BY sort_order ASC,id ASC').bind(experience.id, experience.organizationId).all<Record<string, unknown>>(),
      db.prepare('SELECT published_product_id publishedProductId,asset_url assetUrl,sort_order sortOrder,id FROM catalog_published_product_images WHERE experience_id=? AND organization_id=? ORDER BY published_product_id,sort_order,id').bind(experience.id, experience.organizationId).all<Record<string, unknown>>(),
    ]);
    if (!products.results.length) return { kind: 'inactive', reason: 'unavailable', status: 503 };
    const sourceIds = products.results.map((product) => typeof product.sourceProductId === 'string' ? product.sourceProductId : String(product.id));
    const surfaces = await publishedSurfaceConfigs(db, experience.organizationId, sourceIds, origin ?? '');
    const galleryByProduct = new Map<string, string[]>();
    for (const image of images.results) if (typeof image.publishedProductId === 'string' && typeof image.assetUrl === 'string') galleryByProduct.set(image.publishedProductId, [...(galleryByProduct.get(image.publishedProductId) ?? []), image.assetUrl]);
    return { kind: 'ready', payload: { type: PRODUCT_CATALOG_TYPE, config, products: products.results.map((product, index) => ({ id: String(product.id), name: String(product.name), description: String(product.description ?? ''), priceMinorUnits: Number(product.priceMinorUnits), currency: String(product.currency), priceUnit: typeof product.priceUnit === 'string' && product.priceUnit.trim() ? product.priceUnit : null, metadata: sanitizePublicCatalogMetadata(product.metadata), stock: Number(product.stock), mainImageUrl: typeof product.mainImageUrl === 'string' ? product.mainImageUrl : null, gallery: galleryByProduct.get(String(product.id)) ?? [], ctaLabel: typeof product.ctaLabel === 'string' ? product.ctaLabel : null, ctaUrl: typeof product.ctaUrl === 'string' ? product.ctaUrl : null, surfaceConfig: surfaces.get(sourceIds[index]!) ?? null })) } };
  },
};

export const publicExperienceRegistry: PublicExperienceRegistry = new Map<string, PublicExperienceAdapter>([
  [roulettePublicExperienceAdapter.type, roulettePublicExperienceAdapter],
  [productCatalogPublicExperienceAdapter.type, productCatalogPublicExperienceAdapter],
]);

export function resolvePublicExperienceAdapter(type: unknown, registry: PublicExperienceRegistry = publicExperienceRegistry) {
  return typeof type === 'string' ? registry.get(type) ?? null : null;
}
