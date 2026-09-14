export const ROULETTE_LIMITS = {
  prizeName: 120,
  title: 120,
  intro: 500,
  spinButtonLabel: 40,
  resultMessage: 240,
  ctaLabel: 80,
  ctaUrl: 2048,
  weight: 1000,
  stock: 1_000_000_000,
  participationLimit: 100,
  cooldownSeconds: 604_800,
} as const;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const INTERNAL_ASSET = /^\/assets\/organizations\/[A-Za-z0-9_-]+\/(?:experiences\/[A-Za-z0-9_-]+|assets)\/[0-9a-f-]+\.(png|jpg|jpeg|webp|svg)$/i;

export function isValidRouletteHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

export function isSafeRouletteAssetUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (INTERNAL_ASSET.test(value)) return true;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password && INTERNAL_ASSET.test(url.pathname);
  } catch {
    return false;
  }
}

export function isSafeRouletteExternalUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > ROULETTE_LIMITS.ctaUrl) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password;
  } catch {
    return false;
  }
}

type RouletteFieldErrorMap = Record<string, string>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validOptionalInteger(value: unknown, min: number, max: number) {
  return value === undefined || value === null || typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/**
 * Domain-level field validation shared by the CRM draft and API boundary.
 * It intentionally accepts omitted legacy fields; normalization supplies the
 * current defaults before persistence and publication.
 */
export function rouletteDraftFieldErrors(value: unknown): RouletteFieldErrorMap {
  const errors: RouletteFieldErrorMap = {};
  if (!isRecord(value)) {
    errors.config = 'Falta configurar la ruleta.';
    return errors;
  }
  if (value.schemaVersion !== 1) errors.schemaVersion = 'La configuración de la ruleta no es compatible.';
  if (!isValidRouletteHexColor(value.backgroundColor)) errors.backgroundColor = 'Elegí un color de fondo válido.';

  if (value.participation !== undefined) {
    if (!isRecord(value.participation)) errors.participation = 'La configuración de participación no es válida.';
    else {
      for (const key of ['maxSpinsPerDevice', 'maxSpinsPerSession'] as const) {
        const item = value.participation[key];
        if (!validOptionalInteger(item, 1, ROULETTE_LIMITS.participationLimit)) errors[`participation.${key}`] = 'Ingresá un límite entero entre 1 y 100 o dejalo vacío.';
      }
      if (!validOptionalInteger(value.participation.cooldownSeconds, 0, ROULETTE_LIMITS.cooldownSeconds)) errors['participation.cooldownSeconds'] = 'Ingresá un tiempo entero entre 0 y 604800 segundos.';
    }
  }

  const content = value.content;
  const contentLimits: Record<string, number> = {
    title: ROULETTE_LIMITS.title,
    intro: ROULETTE_LIMITS.intro,
    spinButtonLabel: ROULETTE_LIMITS.spinButtonLabel,
    winMessage: ROULETTE_LIMITS.resultMessage,
    noPrizeMessage: ROULETTE_LIMITS.resultMessage,
  };
  if (content !== undefined) {
    if (!isRecord(content)) errors.content = 'El contenido no es válido.';
    else for (const [key, item] of Object.entries(content)) {
      const limit = contentLimits[key];
      if (!limit || (item !== undefined && (typeof item !== 'string' || item.length > limit))) errors[`content.${key}`] = `Usá hasta ${limit ?? 0} caracteres.`;
    }
  }

  const branding = value.branding;
  if (branding !== undefined) {
    if (!isRecord(branding)) errors.branding = 'La configuración de apariencia no es válida.';
    else for (const [key, item] of Object.entries(branding)) {
      if (key !== 'logoUrl' && key !== 'backgroundImageUrl') errors[`branding.${key}`] = 'Este campo de apariencia no es válido.';
      else if (item !== null && item !== undefined && !isSafeRouletteAssetUrl(item)) errors[`branding.${key}`] = 'Elegí un asset válido de la organización.';
    }
  }

  const effects = value.effects;
  if (effects !== undefined && (!isRecord(effects) || Object.values(effects).some((item) => typeof item !== 'boolean'))) errors.effects = 'Los efectos deben estar activados o desactivados.';

  const cta = value.resultCta;
  if (cta !== undefined) {
    if (!isRecord(cta)) errors.resultCta = 'La configuración del botón final no es válida.';
    else {
      if (cta.enabled !== undefined && typeof cta.enabled !== 'boolean') errors['resultCta.enabled'] = 'Indicá si se muestra el botón final.';
      // CTA fields are conditional: a disabled button must not invalidate an
      // otherwise publishable roulette using its stale draft values.
      if (cta.enabled === true) {
        if (typeof cta.label !== 'string' || !cta.label.trim() || cta.label.length > ROULETTE_LIMITS.ctaLabel) errors['resultCta.label'] = 'Ingresá un texto de botón válido.';
        if (!isSafeRouletteExternalUrl(cta.url)) errors['resultCta.url'] = 'Usá un enlace http:// o https:// válido.';
      }
    }
  }

  const prizes = value.prizes;
  const ids = new Set<string>();
  if (!Array.isArray(prizes) || prizes.length < 1 || prizes.length > 5) errors.prizes = 'La ruleta debe tener entre 1 y 5 premios configurados.';
  else prizes.forEach((prize, index) => {
    const path = `prizes[${index}]`;
    if (!isRecord(prize)) {
      errors[path] = 'El premio no está correctamente configurado.';
      return;
    }
    if (typeof prize.id !== 'string' || !prize.id.trim() || ids.has(prize.id)) errors[`${path}.id`] = 'El identificador del premio no es válido.';
    else ids.add(prize.id);
    if (typeof prize.name !== 'string' || !prize.name.trim()) errors[`${path}.name`] = 'Ingresá un nombre.';
    else if (prize.name.trim().length > ROULETTE_LIMITS.prizeName) errors[`${path}.name`] = `Usá hasta ${ROULETTE_LIMITS.prizeName} caracteres.`;
    if (prize.iconUrl !== undefined && prize.iconUrl !== null && !isSafeRouletteAssetUrl(prize.iconUrl)) errors[`${path}.iconUrl`] = 'Elegí un ícono válido de la organización.';
    if (prize.enabled !== undefined && typeof prize.enabled !== 'boolean') errors[`${path}.enabled`] = 'El estado del premio no es válido.';
    if (!validOptionalInteger(prize.weight, 1, ROULETTE_LIMITS.weight)) errors[`${path}.weight`] = `Ingresá un peso entero entre 1 y ${ROULETTE_LIMITS.weight}.`;
    if (prize.stockMode !== undefined && prize.stockMode !== 'limited' && prize.stockMode !== 'unlimited') errors[`${path}.stockMode`] = 'Elegí stock ilimitado o limitado.';
    if (!validOptionalInteger(prize.initialStock, 0, ROULETTE_LIMITS.stock)) errors[`${path}.initialStock`] = 'Ingresá un stock inicial entero entre 0 y 1.000.000.000.';
    if (prize.stockLimit !== undefined && prize.stockLimit !== null && !validOptionalInteger(prize.stockLimit, 0, ROULETTE_LIMITS.stock)) errors[`${path}.stockLimit`] = 'Ingresá un stock entero entre 0 y 1.000.000.000.';
    if (prize.redemption !== undefined && (!isRecord(prize.redemption) || typeof prize.redemption.enabled !== 'boolean')) errors[`${path}.redemption`] = 'La configuración de canje no es válida.';
  });

  const segments = value.segments;
  const segmentIds = new Set<string>();
  if (!Array.isArray(segments) || segments.length < 6 || segments.length > 10) errors.segments = 'La ruleta debe tener entre 6 y 10 segmentos.';
  else segments.forEach((segment, index) => {
    const path = `segments[${index}]`;
    if (!isRecord(segment)) {
      errors[path] = 'El segmento no está correctamente configurado.';
      return;
    }
    if (typeof segment.id !== 'string' || !segment.id.trim() || segmentIds.has(segment.id)) errors[`${path}.id`] = 'El identificador del segmento no es válido.';
    else segmentIds.add(segment.id);
    if (!isValidRouletteHexColor(segment.color)) errors[`${path}.color`] = 'Elegí un color válido.';
    if (segment.prizeId !== null && (typeof segment.prizeId !== 'string' || !ids.has(segment.prizeId))) errors[`${path}.prizeId`] = 'Elegí un premio existente o Sin premio.';
    if (segment.weight !== undefined && (segment.prizeId !== null || !validOptionalInteger(segment.weight, 1, ROULETTE_LIMITS.weight))) errors[`${path}.weight`] = 'El peso del segmento solo aplica a Sin premio y debe ser entero positivo.';
  });
  return errors;
}
