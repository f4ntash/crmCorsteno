import { buildRouletteOutcomes } from './roulette-selector';

export type ParticipationConfig = {
  maxSpinsPerDevice: number | null;
  maxSpinsPerSession: number | null;
  cooldownSeconds: number;
};

export type PrizeConfig = {
  id: string;
  name: string;
  iconUrl?: string | null;
  enabled?: boolean;
  weight?: number;
  stockMode?: 'limited' | 'unlimited';
  initialStock?: number;
  stockLimit?: number | null;
  redemption?: { enabled?: boolean };
};

export type DraftConfig = {
  schemaVersion: 1;
  backgroundColor: string;
  branding?: { logoUrl?: string | null; backgroundImageUrl?: string | null };
  content?: { title?: string; intro?: string; spinButtonLabel?: string; winMessage?: string; noPrizeMessage?: string };
  prizes: PrizeConfig[];
  segments: Array<{ id: string; color: string; prizeId: string | null; weight?: number }>;
  effects?: { sound?: boolean; vibration?: boolean; celebration?: boolean };
  resultCta?: { enabled?: boolean; label?: string; url?: string };
  participation?: Partial<ParticipationConfig>;
};

const HEX = /^#[0-9a-f]{6}$/i;
const ASSET_PATH = /^\/assets\/organizations\/[A-Za-z0-9_-]+\/(?:experiences\/[A-Za-z0-9_-]+|assets)\/[0-9a-f-]+\.(png|jpg|jpeg|webp|svg)$/i;

export function validAssetUrl(value: unknown) {
  if (typeof value !== 'string') return false;
  if (ASSET_PATH.test(value)) return true;
  try { const url = new URL(value); return (url.protocol === 'http:' || url.protocol === 'https:') && ASSET_PATH.test(url.pathname) && !url.username && !url.password; } catch { return false; }
}

export function validDraftConfig(value: unknown): value is DraftConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const config = value as Record<string, unknown>;
  if (!validParticipationConfig(config.participation)) return false;
  if (config.schemaVersion !== 1 || typeof config.backgroundColor !== 'string' || !HEX.test(config.backgroundColor) || !Array.isArray(config.prizes) || config.prizes.length < 1 || config.prizes.length > 5 || !Array.isArray(config.segments) || config.segments.length < 6 || config.segments.length > 10) return false;
  const ids = new Set<string>();
  if (config.effects !== undefined && (typeof config.effects !== 'object' || config.effects === null || Object.values(config.effects as Record<string, unknown>).some((v) => typeof v !== 'boolean'))) return false;
  const branding = config.branding;
  if (branding !== undefined && (typeof branding !== 'object' || branding === null || Array.isArray(branding))) return false;
  if (branding && Object.entries(branding as Record<string, unknown>).some(([key, item]) => !['logoUrl', 'backgroundImageUrl'].includes(key) || (item !== null && !validAssetUrl(item)))) return false;
  const content = config.content;
  const contentLengths: Record<string, number> = { title: 120, intro: 500, spinButtonLabel: 40, winMessage: 240, noPrizeMessage: 240 };
  if (content !== undefined && (typeof content !== 'object' || content === null || Array.isArray(content) || Object.entries(content as Record<string, unknown>).some(([key, item]) => !(key in contentLengths) || (item !== undefined && typeof item !== 'string') || (typeof item === 'string' && item.length > contentLengths[key]!)))) return false;
  if (config.prizes.some((prize) => { const redemption = (prize as Record<string, unknown>).redemption; return redemption !== undefined && (typeof redemption !== 'object' || redemption === null || Array.isArray(redemption) || typeof (redemption as Record<string, unknown>).enabled !== 'boolean'); })) return false;
  if (config.resultCta !== undefined) { const cta = config.resultCta as Record<string, unknown>; if (typeof cta !== 'object' || cta === null || (cta.enabled !== undefined && typeof cta.enabled !== 'boolean') || (cta.label !== undefined && (typeof cta.label !== 'string' || cta.label.length > 80)) || (cta.url !== undefined && (typeof cta.url !== 'string' || !/^https?:\/\//i.test(cta.url) || cta.url.length > 2048))) return false; }
  for (const prize of config.prizes) { if (typeof prize !== 'object' || prize === null || Array.isArray(prize)) return false; const item = prize as Record<string, unknown>; const legacyStock = item.stockLimit; if (typeof item.id !== 'string' || ids.has(item.id) || !item.id || typeof item.name !== 'string' || !item.name.trim() || (item.iconUrl !== undefined && item.iconUrl !== null && !validAssetUrl(item.iconUrl)) || (item.enabled !== undefined && typeof item.enabled !== 'boolean') || (item.weight !== undefined && (!Number.isInteger(item.weight) || Number(item.weight) < 1 || Number(item.weight) > 1000)) || (item.stockMode !== undefined && item.stockMode !== 'limited' && item.stockMode !== 'unlimited') || (item.initialStock !== undefined && (!Number.isInteger(item.initialStock) || Number(item.initialStock) < 0 || Number(item.initialStock) > 1_000_000_000)) || (legacyStock !== undefined && legacyStock !== null && (!Number.isInteger(legacyStock) || Number(legacyStock) < 0 || Number(legacyStock) > 1_000_000_000))) return false; ids.add(item.id); }
  const segmentIds = new Set<string>();
  return config.segments.every((segment) => { if (typeof segment !== 'object' || segment === null || Array.isArray(segment)) return false; const item = segment as Record<string, unknown>; return typeof item.id === 'string' && !segmentIds.has(item.id) && !!segmentIds.add(item.id) && typeof item.color === 'string' && HEX.test(item.color) && (item.prizeId === null || (typeof item.prizeId === 'string' && ids.has(item.prizeId))) && (item.weight === undefined || (item.prizeId === null && Number.isInteger(item.weight) && Number(item.weight) >= 1 && Number(item.weight) <= 1000)); });
}

export function normalizePrizeConfig(prize: PrizeConfig) {
  const legacyLimited = prize.stockMode === undefined && prize.stockLimit !== undefined && prize.stockLimit !== null;
  return { id: prize.id, name: prize.name, iconUrl: prize.iconUrl ?? null, enabled: prize.enabled ?? true, weight: prize.weight ?? 1, stockMode: prize.stockMode ?? (legacyLimited ? 'limited' : 'unlimited'), initialStock: prize.initialStock ?? (legacyLimited ? prize.stockLimit! : undefined) } as const;
}

export function normalizeParticipationConfig(value: unknown): ParticipationConfig {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    maxSpinsPerDevice: input.maxSpinsPerDevice === null || input.maxSpinsPerDevice === undefined ? null : Number(input.maxSpinsPerDevice),
    maxSpinsPerSession: input.maxSpinsPerSession === null || input.maxSpinsPerSession === undefined ? null : Number(input.maxSpinsPerSession),
    cooldownSeconds: input.cooldownSeconds === undefined ? 0 : Number(input.cooldownSeconds),
  };
}

export function validParticipationConfig(value: unknown) {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const config = value as Record<string, unknown>;
  const validLimit = (item: unknown) => item === null || item === undefined || typeof item === 'number' && Number.isInteger(item) && item >= 1 && item <= 100;
  return validLimit(config.maxSpinsPerDevice) && validLimit(config.maxSpinsPerSession)
    && (config.cooldownSeconds === undefined || typeof config.cooldownSeconds === 'number' && Number.isInteger(config.cooldownSeconds) && config.cooldownSeconds >= 0 && config.cooldownSeconds <= 604800);
}

export type PublishReadinessIssue = { code: string; path: string; message: string };

export function validateRoulettePublishReadiness(value: unknown): PublishReadinessIssue[] {
  if (!validDraftConfig(value)) {
    const config = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
    if (!config) return [{ code: 'CONFIG_MISSING', path: 'config', message: 'Falta configurar la ruleta.' }];
    const issues: PublishReadinessIssue[] = [];
    if (config.schemaVersion !== 1) issues.push({ code: 'CONFIG_VERSION', path: 'schemaVersion', message: 'La configuración de la ruleta no es compatible.' });
    if (!Array.isArray(config.segments) || config.segments.length < 6 || config.segments.length > 10) issues.push({ code: 'SEGMENT_COUNT', path: 'segments', message: 'La ruleta debe tener entre 6 y 10 segmentos.' });
    if (!Array.isArray(config.prizes) || config.prizes.length < 1 || config.prizes.length > 5) issues.push({ code: 'PRIZE_COUNT', path: 'prizes', message: 'Debe existir al menos un premio configurado.' });
    if (Array.isArray(config.segments) && Array.isArray(config.prizes)) {
      const prizeIds = new Set(config.prizes.filter((item) => item && typeof item === 'object' && !Array.isArray(item)).map((item) => (item as Record<string, unknown>).id).filter((id): id is string => typeof id === 'string'));
      const invalidSegment = config.segments.some((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return true;
        const segment = item as Record<string, unknown>;
        return typeof segment.id !== 'string' || typeof segment.color !== 'string' || (segment.prizeId !== null && !prizeIds.has(segment.prizeId as string));
      });
      if (invalidSegment) issues.push({ code: 'SEGMENTS_INVALID', path: 'segments', message: 'Hay segmentos inválidos o con premios inexistentes.' });
      const invalidPrize = config.prizes.some((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return true;
        const prize = item as Record<string, unknown>;
        return typeof prize.id !== 'string' || typeof prize.name !== 'string' || !prize.name.trim();
      });
      if (invalidPrize) issues.push({ code: 'PRIZES_INVALID', path: 'prizes', message: 'Hay premios incorrectamente configurados.' });
    }
    return issues.length ? issues : [{ code: 'CONFIG_INVALID', path: 'config', message: 'La configuración de la ruleta está incompleta.' }];
  }
  const config = value as DraftConfig;
  const inventory = new Map(config.prizes.map((prize) => {
    const normalized = normalizePrizeConfig(prize);
    return [normalized.id, { stockMode: normalized.stockMode, stockAvailable: normalized.stockMode === 'limited' ? normalized.initialStock ?? 0 : null, deliveredCount: 0 }] as const;
  }));
  const outcomes = buildRouletteOutcomes(config, inventory);
  return outcomes.length ? [] : [{ code: 'NO_USABLE_OUTCOME', path: 'segments', message: 'Falta configurar un resultado válido.' }];
}
