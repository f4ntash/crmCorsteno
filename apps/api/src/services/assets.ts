export const MAX_ASSET_BYTES = 2 * 1024 * 1024;
export const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const;
export type SupportedImageType = typeof SUPPORTED_IMAGE_TYPES[number];
export const MODEL_ASSET_CATEGORY = 'model-3d' as const;
/** Initial operational limit for a single GLB; large enough for real product models without requiring chunked uploads. */
export const MAX_MODEL_ASSET_BYTES = 25 * 1024 * 1024;
export const SUPPORTED_MODEL_TYPE = 'model/gltf-binary' as const;

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

export function sanitizeSvg(value: string) {
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(value) || !/<\/svg>\s*$/i.test(value)) return null;
  if (/<\/?script\b|<\/?foreignObject\b|<\/?iframe\b|<\/?object\b|<\/?embed\b|<!DOCTYPE\b|<!ENTITY\b|\son[a-z0-9_-]+\s*=|(?:href|src|xlink:href)\s*=\s*["']\s*(?:https?:|\/\/|data:|javascript:)|url\s*\(/i.test(value)) return null;
  return value;
}

export type ValidatedImage = { ok: true; bytes: ArrayBuffer; extension: 'png' | 'jpg' | 'webp' | 'svg'; mimeType: SupportedImageType };
export type ImageValidationFailure = { ok: false; status: 400 | 413 | 415; message: string };

export type ValidatedModel = { ok: true; bytes: ArrayBuffer; extension: 'glb'; mimeType: typeof SUPPORTED_MODEL_TYPE };
export type ModelValidationFailure = { ok: false; status: 400 | 413 | 415; message: string };

export async function validateImageFile(file: File, allowedTypes: readonly SupportedImageType[] = SUPPORTED_IMAGE_TYPES): Promise<ValidatedImage | ImageValidationFailure> {
  if (file.size > MAX_ASSET_BYTES) return { ok: false, status: 413, message: 'File exceeds the 2 MB limit' };
  if (!allowedTypes.includes(file.type as SupportedImageType)) return { ok: false, status: 415, message: 'Only PNG, JPEG, WebP and SVG files are allowed' };
  if (file.type === 'image/svg+xml') {
    const safe = sanitizeSvg(await file.text());
    if (!safe) return { ok: false, status: 400, message: 'SVG contains unsupported or executable content' };
    return { ok: true, bytes: new TextEncoder().encode(safe).buffer, extension: 'svg', mimeType: file.type as SupportedImageType };
  }
  const bytes = await file.arrayBuffer();
  const view = new Uint8Array(bytes);
  if (file.type === 'image/png' && (view.length < PNG_SIGNATURE.length || !PNG_SIGNATURE.every((byte, index) => view[index] === byte))) return { ok: false, status: 400, message: 'Invalid PNG file' };
  if (file.type === 'image/jpeg' && (view.length < 3 || view[0] !== 0xff || view[1] !== 0xd8 || view[2] !== 0xff)) return { ok: false, status: 400, message: 'Invalid JPEG file' };
  if (file.type === 'image/webp' && (view.length < 12 || new TextDecoder().decode(view.slice(0, 4)) !== 'RIFF' || new TextDecoder().decode(view.slice(8, 12)) !== 'WEBP')) return { ok: false, status: 400, message: 'Invalid WebP file' };
  return { ok: true, bytes, extension: file.type === 'image/png' ? 'png' : file.type === 'image/jpeg' ? 'jpg' : 'webp', mimeType: file.type as SupportedImageType };
}

export async function validateGlbFile(file: File): Promise<ValidatedModel | ModelValidationFailure> {
  if (file.size > MAX_MODEL_ASSET_BYTES) return { ok: false, status: 413, message: 'El modelo supera el límite de 25 MB' };
  if (!/\.glb$/i.test(file.name)) return { ok: false, status: 415, message: 'Solo se admiten modelos GLB' };
  if (file.type && file.type !== SUPPORTED_MODEL_TYPE && file.type !== 'application/octet-stream') return { ok: false, status: 415, message: 'El modelo debe usar el formato GLB' };
  const bytes = await file.arrayBuffer();
  const view = new DataView(bytes);
  if (view.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67) return { ok: false, status: 400, message: 'El archivo no contiene una cabecera GLB válida' };
  if (view.getUint32(4, true) !== 2) return { ok: false, status: 400, message: 'Solo se admite GLB versión 2' };
  const declaredLength = view.getUint32(8, true);
  if (declaredLength < 20 || declaredLength !== view.byteLength) return { ok: false, status: 400, message: 'El archivo GLB está incompleto' };
  if (view.getUint32(16, true) !== 0x4e4f534a) return { ok: false, status: 400, message: 'El archivo GLB no contiene un bloque JSON válido' };
  const jsonLength = view.getUint32(12, true);
  if (jsonLength < 2 || 20 + jsonLength > view.byteLength) return { ok: false, status: 400, message: 'El archivo GLB no contiene una escena válida' };
  try {
    const json = new TextDecoder().decode(new Uint8Array(bytes, 20, jsonLength)).replace(/ +$/g, '');
    const parsed = JSON.parse(json) as { asset?: { version?: unknown } };
    if (parsed?.asset?.version !== '2.0') return { ok: false, status: 400, message: 'El GLB debe declarar glTF versión 2.0' };
  } catch {
    return { ok: false, status: 400, message: 'El archivo GLB contiene JSON inválido' };
  }
  return { ok: true, bytes, extension: 'glb', mimeType: SUPPORTED_MODEL_TYPE };
}

export function cleanOriginalFilename(value: string) {
  const filename = value.split(/[\\/]/).pop()?.split('').filter((character) => { const code = character.charCodeAt(0); return code >= 32 && code !== 127; }).join('').trim();
  return (filename || 'archivo').slice(0, 160);
}

export function organizationAssetKey(organizationId: string, assetId: string, extension: ValidatedImage['extension']) {
  return `organizations/${organizationId}/assets/${assetId}.${extension}`;
}

export function organizationModelAssetKey(organizationId: string, assetId: string) {
  return `organizations/${organizationId}/assets/${assetId}.glb`;
}

export function assetUrl(origin: string, key: string) {
  return `${origin}/assets/${key}`;
}
