import { isSafeRouletteAssetUrl, rouletteDraftFieldErrors } from '@corsteno/types';
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

export const validAssetUrl = isSafeRouletteAssetUrl;

export function validDraftConfig(value: unknown): value is DraftConfig {
  return Object.keys(rouletteDraftFieldErrors(value)).length === 0;
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
    const fieldIssues = Object.entries(rouletteDraftFieldErrors(value)).map(([path, message]) => ({
      code: path.startsWith('prizes') ? 'PRIZE_INVALID' : path.startsWith('segments') ? 'SEGMENT_INVALID' : 'CONFIG_INVALID',
      path,
      message,
    }));
    const existingPaths = new Set(issues.map((issue) => issue.path));
    const concrete = fieldIssues.filter((issue) => !existingPaths.has(issue.path));
    return [...issues, ...concrete].length ? [...issues, ...concrete] : [{ code: 'CONFIG_INVALID', path: 'config', message: 'La configuración de la ruleta está incompleta.' }];
  }
  const config = value as DraftConfig;
  const inventory = new Map(config.prizes.map((prize) => {
    const normalized = normalizePrizeConfig(prize);
    return [normalized.id, { stockMode: normalized.stockMode, stockAvailable: normalized.stockMode === 'limited' ? normalized.initialStock ?? 0 : null, deliveredCount: 0 }] as const;
  }));
  const outcomes = buildRouletteOutcomes(config, inventory);
  return outcomes.length ? [] : [{ code: 'NO_USABLE_OUTCOME', path: 'segments', message: 'Falta configurar un resultado válido.' }];
}
