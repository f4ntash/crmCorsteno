export const SURFACE_MATERIAL_SCHEMA_VERSION = 1 as const;
export const SURFACE_COMPATIBLE_SURFACES = ['wall', 'floor'] as const;
export type CompatibleSurface = typeof SURFACE_COMPATIBLE_SURFACES[number];
export type SurfaceMaterialOrientation = 'horizontal' | 'vertical' | 'free';

export type SurfaceTextureAssets = {
  baseColorTexture: string;
  normalTexture?: string;
  roughnessTexture?: string;
  aoTexture?: string;
  displacementTexture?: string;
};

type SurfaceMaterialBase = {
  schemaVersion: typeof SURFACE_MATERIAL_SCHEMA_VERSION;
  enabled?: boolean;
  physicalWidthM: number;
  physicalHeightM: number;
  roughness: number;
  metalness: number;
  rotationDegrees: number;
  repeatMode: 'repeat';
  orientation?: SurfaceMaterialOrientation;
  compatibleSurfaces?: CompatibleSurface[];
};

export type SolidSurfaceMaterialConfig = SurfaceMaterialBase & {
  mode: 'solid';
  baseColor: string;
  fallbackColor?: string;
  demoPlaceholder?: boolean;
};

export type TextureSurfaceMaterialConfig = SurfaceMaterialBase & {
  mode: 'texture';
  assets: SurfaceTextureAssets;
  /** Solid product colour kept visible while maps load or when baseColor fails. */
  fallbackColor?: string;
  /** Tangent-space normal intensity shared by every renderer instance. */
  normalScale?: number;
  demoPlaceholder?: false;
};

export type SurfaceMaterialConfig = SolidSurfaceMaterialConfig | TextureSurfaceMaterialConfig;

/** Organization-owned references stored in D1. These are never sent to the public runtime. */
export type SurfaceMaterialAssetRefs = {
  baseColorAssetId: string;
  normalAssetId?: string | null;
  roughnessAssetId?: string | null;
};

/** Draft/published representation persisted by the surface-material API. */
export type ProductSurfaceConfig = Omit<SurfaceMaterialBase, 'repeatMode'> & {
  enabled: boolean;
  repeatMode?: 'repeat';
  mode: 'solid' | 'texture';
  fallbackColor: string;
  baseColor?: string;
  normalScale?: number;
  assets?: SurfaceMaterialAssetRefs;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPublicAssetUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (value.startsWith('/')) return !value.startsWith('//') && !value.includes('\\');
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password || url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function surfaceMaterialConfigIssues(value: unknown): string[] {
  const config = record(value);
  if (!config) return ['config'];
  const issues: string[] = [];
  const knownFields = new Set(['schemaVersion', 'mode', 'enabled', 'physicalWidthM', 'physicalHeightM', 'roughness', 'metalness', 'rotationDegrees', 'repeatMode', 'orientation', 'compatibleSurfaces', 'baseColor', 'assets', 'fallbackColor', 'normalScale', 'demoPlaceholder']);
  for (const key of Object.keys(config)) if (!knownFields.has(key)) issues.push(key);
  if (config.schemaVersion !== SURFACE_MATERIAL_SCHEMA_VERSION) issues.push('schemaVersion');
  if (!finite(config.physicalWidthM) || config.physicalWidthM <= 0 || config.physicalWidthM > 20) issues.push('physicalWidthM');
  if (!finite(config.physicalHeightM) || config.physicalHeightM <= 0 || config.physicalHeightM > 20) issues.push('physicalHeightM');
  if (!finite(config.roughness) || config.roughness < 0 || config.roughness > 1) issues.push('roughness');
  if (!finite(config.metalness) || config.metalness < 0 || config.metalness > 1) issues.push('metalness');
  if (!finite(config.rotationDegrees) || Math.abs(config.rotationDegrees) > 3600) issues.push('rotationDegrees');
  if (config.repeatMode !== 'repeat') issues.push('repeatMode');
  if (config.enabled !== undefined && typeof config.enabled !== 'boolean') issues.push('enabled');
  if (config.orientation !== undefined && !['horizontal', 'vertical', 'free'].includes(config.orientation as string)) issues.push('orientation');
  if (config.compatibleSurfaces !== undefined && (!Array.isArray(config.compatibleSurfaces) || config.compatibleSurfaces.length === 0 || config.compatibleSurfaces.some((surface) => !SURFACE_COMPATIBLE_SURFACES.includes(surface as CompatibleSurface)))) issues.push('compatibleSurfaces');
  if (config.mode === 'solid') {
    if (typeof config.baseColor !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(config.baseColor)) issues.push('baseColor');
    if (config.demoPlaceholder !== undefined && typeof config.demoPlaceholder !== 'boolean') issues.push('demoPlaceholder');
    if ('assets' in config) issues.push('assets');
    if (config.fallbackColor !== undefined && (typeof config.fallbackColor !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(config.fallbackColor))) issues.push('fallbackColor');
    if ('normalScale' in config) issues.push('normalScale');
  } else if (config.mode === 'texture') {
    const assets = record(config.assets);
    if (!assets || !isPublicAssetUrl(assets.baseColorTexture)) issues.push('assets.baseColorTexture');
    if (assets) {
      const knownAssets = new Set(['baseColorTexture', 'normalTexture', 'roughnessTexture', 'aoTexture', 'displacementTexture']);
      for (const key of Object.keys(assets)) if (!knownAssets.has(key)) issues.push(`assets.${key}`);
      for (const key of ['normalTexture', 'roughnessTexture', 'aoTexture', 'displacementTexture'] as const) {
        if (assets[key] !== undefined && !isPublicAssetUrl(assets[key])) issues.push(`assets.${key}`);
      }
    }
    if ('baseColor' in config) issues.push('baseColor');
    if (config.fallbackColor !== undefined && (typeof config.fallbackColor !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(config.fallbackColor))) issues.push('fallbackColor');
    if (config.normalScale !== undefined && (!finite(config.normalScale) || config.normalScale < 0 || config.normalScale > 2)) issues.push('normalScale');
    if (config.demoPlaceholder !== undefined && config.demoPlaceholder !== false) issues.push('demoPlaceholder');
  } else {
    issues.push('mode');
  }
  return issues;
}

export function isSurfaceMaterialConfig(value: unknown): value is SurfaceMaterialConfig {
  return surfaceMaterialConfigIssues(value).length === 0;
}

export function resolveSurfaceAssetUrl(assetUrl: string, baseUrl: string): string | null {
  if (!isPublicAssetUrl(assetUrl)) return null;
  try {
    const resolved = new URL(assetUrl, baseUrl);
    return ['http:', 'https:'].includes(resolved.protocol) && !resolved.username && !resolved.password ? resolved.href : null;
  } catch {
    return null;
  }
}

function validAssetId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value);
}

/** Validation for the persisted, asset-ID based representation. */
export function productSurfaceConfigIssues(value: unknown, path = 'config'): string[] {
  const config = record(value);
  if (!config) return [path];
  const issues: string[] = [];
  const knownFields = new Set(['schemaVersion', 'enabled', 'mode', 'physicalWidthM', 'physicalHeightM', 'rotationDegrees', 'repeatMode', 'orientation', 'compatibleSurfaces', 'roughness', 'metalness', 'normalScale', 'fallbackColor', 'baseColor', 'assets']);
  for (const key of Object.keys(config)) if (!knownFields.has(key)) issues.push(`${path}.${key}`);
  if (config.schemaVersion !== SURFACE_MATERIAL_SCHEMA_VERSION) issues.push(`${path}.schemaVersion`);
  if (typeof config.enabled !== 'boolean') issues.push(`${path}.enabled`);
  if (config.mode !== 'solid' && config.mode !== 'texture') issues.push(`${path}.mode`);
  if (!finite(config.physicalWidthM) || config.physicalWidthM <= 0 || config.physicalWidthM > 20) issues.push(`${path}.physicalWidthM`);
  if (!finite(config.physicalHeightM) || config.physicalHeightM <= 0 || config.physicalHeightM > 20) issues.push(`${path}.physicalHeightM`);
  if (!finite(config.rotationDegrees) || Math.abs(config.rotationDegrees) > 3600) issues.push(`${path}.rotationDegrees`);
  if (config.orientation !== undefined && !['horizontal', 'vertical', 'free'].includes(config.orientation as string)) issues.push(`${path}.orientation`);
  if (!Array.isArray(config.compatibleSurfaces) || config.compatibleSurfaces.length === 0 || config.compatibleSurfaces.some((surface) => !SURFACE_COMPATIBLE_SURFACES.includes(surface as CompatibleSurface))) issues.push(`${path}.compatibleSurfaces`);
  if (config.repeatMode !== undefined && config.repeatMode !== 'repeat') issues.push(`${path}.repeatMode`);
  if (!finite(config.roughness) || config.roughness < 0 || config.roughness > 1) issues.push(`${path}.roughness`);
  if (!finite(config.metalness) || config.metalness < 0 || config.metalness > 1) issues.push(`${path}.metalness`);
  if (config.normalScale !== undefined && (!finite(config.normalScale) || config.normalScale < 0 || config.normalScale > 2)) issues.push(`${path}.normalScale`);
  if (typeof config.fallbackColor !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(config.fallbackColor)) issues.push(`${path}.fallbackColor`);
  if (config.mode === 'solid') {
    if (typeof config.baseColor !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(config.baseColor)) issues.push(`${path}.baseColor`);
    if (config.assets !== undefined) issues.push(`${path}.assets`);
  } else {
    const assets = record(config.assets);
    if (!assets || !validAssetId(assets.baseColorAssetId)) issues.push(`${path}.assets.baseColorAssetId`);
    if (assets) {
      for (const key of ['normalAssetId', 'roughnessAssetId'] as const) if (assets[key] !== undefined && assets[key] !== null && !validAssetId(assets[key])) issues.push(`${path}.assets.${key}`);
      for (const key of Object.keys(assets)) if (!['baseColorAssetId', 'normalAssetId', 'roughnessAssetId'].includes(key)) issues.push(`${path}.assets.${key}`);
    }
    if (config.baseColor !== undefined) issues.push(`${path}.baseColor`);
  }
  return issues;
}

export function isProductSurfaceConfig(value: unknown): value is ProductSurfaceConfig {
  return productSurfaceConfigIssues(value).length === 0;
}
