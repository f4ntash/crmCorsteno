import { assetUrl, SUPPORTED_IMAGE_TYPES } from './assets';

export const SITE_CONTENT_PROFILE_KEY = 'marketing-basic-v1';
export const SITE_CONTENT_PROFILE_VERSION = 1;

export type SiteContentFieldType = 'text' | 'textarea' | 'image' | 'url' | 'boolean';
export type SiteContentFieldDefinition = {
  key: string;
  type: SiteContentFieldType;
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
};
export type SiteContentSectionDefinition = {
  id: string;
  title: string;
  description: string;
  fields: SiteContentFieldDefinition[];
};
export type SiteContentProfile = {
  key: typeof SITE_CONTENT_PROFILE_KEY;
  version: typeof SITE_CONTENT_PROFILE_VERSION;
  name: string;
  description: string;
  sections: SiteContentSectionDefinition[];
};

export type SiteContent = {
  hero: {
    title: string;
    description: string;
    image: string | null;
    ctaLabel: string;
    ctaUrl: string;
  };
  promotion: {
    enabled: boolean;
    title: string;
    description: string;
    image: string | null;
    ctaLabel: string;
    ctaUrl: string;
  };
};

export type ContentValidationIssue = {
  code: string;
  path: string;
  message: string;
};

export const SITE_CONTENT_PROFILE: SiteContentProfile = {
  key: SITE_CONTENT_PROFILE_KEY,
  version: SITE_CONTENT_PROFILE_VERSION,
  name: 'Sitio comercial básico',
  description: 'Un perfil compacto para presentar una propuesta y una promoción.',
  sections: [
    {
      id: 'hero',
      title: 'Principal',
      description: 'El primer mensaje que verá la persona que visite tu sitio.',
      fields: [
        { key: 'hero.title', type: 'text', label: 'Título', required: true, maxLength: 120, placeholder: 'Una propuesta clara para tu público' },
        { key: 'hero.description', type: 'textarea', label: 'Descripción', maxLength: 300, placeholder: 'Contá brevemente qué querés comunicar.' },
        { key: 'hero.image', type: 'image', label: 'Imagen', placeholder: 'Seleccionar imagen' },
        { key: 'hero.ctaLabel', type: 'text', label: 'Texto del botón', maxLength: 80, placeholder: 'Conocer más' },
        { key: 'hero.ctaUrl', type: 'url', label: 'Destino del botón', maxLength: 2048, placeholder: 'https://ejemplo.com o /contacto' },
      ],
    },
    {
      id: 'promotion',
      title: 'Promoción',
      description: 'Un bloque opcional para destacar una oferta o novedad.',
      fields: [
        { key: 'promotion.enabled', type: 'boolean', label: 'Mostrar promoción' },
        { key: 'promotion.title', type: 'text', label: 'Título', maxLength: 120, placeholder: 'Una novedad para tu comunidad' },
        { key: 'promotion.description', type: 'textarea', label: 'Descripción', maxLength: 300, placeholder: 'Describí la promoción en pocas palabras.' },
        { key: 'promotion.image', type: 'image', label: 'Imagen', placeholder: 'Seleccionar imagen' },
        { key: 'promotion.ctaLabel', type: 'text', label: 'Texto del botón', maxLength: 80, placeholder: 'Ver promoción' },
        { key: 'promotion.ctaUrl', type: 'url', label: 'Destino del botón', maxLength: 2048, placeholder: 'https://ejemplo.com o /promocion' },
      ],
    },
  ],
};

export function defaultSiteContent(): SiteContent {
  return {
    hero: { title: '', description: '', image: null, ctaLabel: '', ctaUrl: '' },
    promotion: { enabled: false, title: '', description: '', image: null, ctaLabel: '', ctaUrl: '' },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.split('').some((character) => character.charCodeAt(0) < 32) || trimmed.includes('\\')) return null;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function addIssue(issues: ContentValidationIssue[], code: string, path: string, message: string) {
  issues.push({ code, path, message });
}

function textValue(
  source: Record<string, unknown>,
  key: string,
  path: string,
  maxLength: number,
  required: boolean,
  issues: ContentValidationIssue[],
) {
  const raw = source[key];
  if (raw === undefined) {
    if (required) addIssue(issues, 'CONTENT_REQUIRED', path, 'Este campo es obligatorio.');
    return '';
  }
  if (typeof raw !== 'string') {
    addIssue(issues, 'CONTENT_TYPE', path, 'Este campo debe ser texto.');
    return '';
  }
  const value = raw.trim();
  if (required && !value) addIssue(issues, 'CONTENT_REQUIRED', path, 'Este campo es obligatorio.');
  if (value.length > maxLength) addIssue(issues, 'CONTENT_MAX_LENGTH', path, `Usá hasta ${maxLength} caracteres.`);
  return value;
}

async function imageValue(
  db: D1Database,
  organizationId: string,
  origin: string,
  source: Record<string, unknown>,
  key: string,
  path: string,
  issues: ContentValidationIssue[],
) {
  const raw = source[key];
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') {
    addIssue(issues, 'CONTENT_IMAGE_INVALID', path, 'Seleccioná una imagen válida.');
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    addIssue(issues, 'CONTENT_IMAGE_INVALID', path, 'Seleccioná una imagen de la biblioteca de archivos.');
    return null;
  }
  const match = parsed.pathname.match(/^\/assets\/organizations\/([^/]+)\/assets\/([^/]+)\.(png|jpg|jpeg|webp|svg)$/i);
  if (parsed.origin !== origin || parsed.search || parsed.hash || !match || match[1] !== organizationId) {
    addIssue(issues, 'CONTENT_IMAGE_INVALID', path, 'La imagen debe pertenecer a esta organización.');
    return null;
  }
  const assetId = match[2];
  const row = await db.prepare('SELECT id,storage_key storageKey,mime_type mimeType FROM organization_assets WHERE id=? AND organization_id=? AND archived_at IS NULL').bind(assetId, organizationId).first<{ id: string; storageKey: string; mimeType: string }>();
  if (!row || !SUPPORTED_IMAGE_TYPES.includes(row.mimeType as typeof SUPPORTED_IMAGE_TYPES[number])) {
    addIssue(issues, 'CONTENT_IMAGE_INVALID', path, 'La imagen no está disponible en esta organización.');
    return null;
  }
  const expectedPath = `organizations/${organizationId}/assets/${assetId}.`;
  if (!row.storageKey.startsWith(expectedPath)) {
    addIssue(issues, 'CONTENT_IMAGE_INVALID', path, 'La imagen no está disponible en esta organización.');
    return null;
  }
  return assetUrl(origin, row.storageKey);
}

async function sectionContent(
  db: D1Database,
  organizationId: string,
  origin: string,
  source: unknown,
  section: 'hero' | 'promotion',
  issues: ContentValidationIssue[],
): Promise<SiteContent[typeof section]> {
  const defaults = defaultSiteContent()[section];
  if (!isRecord(source)) {
    addIssue(issues, 'CONTENT_SECTION_INVALID', section, 'Esta sección no tiene una estructura válida.');
    return defaults;
  }
  const allowed = new Set(SITE_CONTENT_PROFILE.sections.find((item) => item.id === section)?.fields.map((field) => field.key.split('.')[1]) ?? []);
  for (const key of Object.keys(source)) if (!allowed.has(key)) addIssue(issues, 'CONTENT_UNKNOWN_FIELD', `${section}.${key}`, 'Este campo no está disponible en el perfil actual.');
  const title = textValue(source, 'title', `${section}.title`, 120, section === 'hero', issues);
  const description = textValue(source, 'description', `${section}.description`, 300, false, issues);
  const ctaLabel = textValue(source, 'ctaLabel', `${section}.ctaLabel`, 80, false, issues);
  const rawUrl = source.ctaUrl;
  let ctaUrl = '';
  if (rawUrl !== undefined && rawUrl !== null) {
    if (typeof rawUrl !== 'string' || rawUrl.trim().length > 2048 || safeUrl(rawUrl) === null) addIssue(issues, 'CONTENT_URL_INVALID', `${section}.ctaUrl`, 'Usá una URL http://, https:// o una ruta del sitio.');
    else ctaUrl = safeUrl(rawUrl) ?? '';
  }
  const image = await imageValue(db, organizationId, origin, source, 'image', `${section}.image`, issues);
  if (section === 'hero') return { title, description, image, ctaLabel, ctaUrl };
  const enabled = source.enabled === undefined ? false : source.enabled;
  if (typeof enabled !== 'boolean') addIssue(issues, 'CONTENT_TYPE', 'promotion.enabled', 'Este campo debe ser verdadero o falso.');
  return { enabled: typeof enabled === 'boolean' ? enabled : false, title, description, image, ctaLabel, ctaUrl };
}

export async function validateSiteContent(db: D1Database, organizationId: string, origin: string, raw: unknown): Promise<{ ok: true; value: SiteContent } | { ok: false; issues: ContentValidationIssue[] }> {
  const issues: ContentValidationIssue[] = [];
  if (!isRecord(raw)) return { ok: false, issues: [{ code: 'CONTENT_INVALID', path: '', message: 'El contenido debe tener una estructura válida.' }] };
  for (const key of Object.keys(raw)) if (key !== 'hero' && key !== 'promotion') addIssue(issues, 'CONTENT_UNKNOWN_FIELD', key, 'Este campo no está disponible en el perfil actual.');
  const hero = await sectionContent(db, organizationId, origin, raw.hero, 'hero', issues) as SiteContent['hero'];
  const promotion = await sectionContent(db, organizationId, origin, raw.promotion, 'promotion', issues) as SiteContent['promotion'];
  const value: SiteContent = { hero, promotion };
  return issues.length ? { ok: false, issues } : { ok: true, value };
}
