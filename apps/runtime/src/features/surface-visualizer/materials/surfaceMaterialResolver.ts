import * as THREE from 'three';
import { resolveSurfaceAssetUrl, type SurfaceMaterialConfig, type TextureSurfaceMaterialConfig } from '@corsteno/types';
import { calculatePhysicalTextureRepeat, normalizeRotationRadians } from '../utils/textureScale';
import { configureSurfaceTexture, loadSharedSurfaceTexture, type SurfaceTextureRole } from './textureCache';

type TextureAssignment = {
  path: string | undefined;
  role: SurfaceTextureRole;
  materialField: 'map' | 'normalMap' | 'roughnessMap';
};

export type SurfaceMaterialTextureResult = {
  failures: SurfaceTextureRole[];
};

export type ResolvedSurfaceMaterial = {
  material: THREE.MeshStandardMaterial;
  ready: Promise<SurfaceMaterialTextureResult>;
  dispose: () => void;
};

type Options = {
  textureLoader: THREE.TextureLoader;
  baseUrl: string;
  anisotropy: number;
};

const DEFAULT_TEXTURE_FALLBACK = '#9b7854';
const DEFAULT_NORMAL_SCALE = 0.45;

function fallbackColor(config: SurfaceMaterialConfig | null) {
  if (config?.mode === 'solid') return config.baseColor;
  if (config?.mode === 'texture') return config.fallbackColor ?? DEFAULT_TEXTURE_FALLBACK;
  return '#d7d1c6';
}

export function resolveSurfaceMaterial(
  config: SurfaceMaterialConfig | null,
  widthM: number,
  heightM: number,
  neutralColor: string,
  options: Options,
): ResolvedSurfaceMaterial {
  if (!config) {
    return resolvedImmediate(new THREE.MeshStandardMaterial({ color: neutralColor, roughness: 0.84, metalness: 0 }));
  }
  if (config.mode === 'solid') {
    return resolvedImmediate(new THREE.MeshStandardMaterial({ color: config.baseColor, roughness: config.roughness, metalness: config.metalness }));
  }
  return resolveTextureMaterial(config, widthM, heightM, options);
}

function resolvedImmediate(material: THREE.MeshStandardMaterial): ResolvedSurfaceMaterial {
  return { material, ready: Promise.resolve({ failures: [] }), dispose: () => material.dispose() };
}

function resolveTextureMaterial(config: TextureSurfaceMaterialConfig, widthM: number, heightM: number, options: Options): ResolvedSurfaceMaterial {
  const material = new THREE.MeshStandardMaterial({
    // Keep a visible product-colour placeholder until all maps have finished.
    color: fallbackColor(config),
    roughness: config.roughness,
    metalness: config.metalness,
  });
  const repeat = calculatePhysicalTextureRepeat(widthM, heightM, config.physicalWidthM, config.physicalHeightM) ?? { x: 1, y: 1 };
  const rotation = normalizeRotationRadians(config.rotationDegrees) ?? 0;
  material.normalScale.setScalar(config.normalScale ?? DEFAULT_NORMAL_SCALE);
  const assignments: TextureAssignment[] = [{ path: config.assets.baseColorTexture, role: 'baseColor', materialField: 'map' }];
  if (config.assets.normalTexture) assignments.push({ path: config.assets.normalTexture, role: 'normal', materialField: 'normalMap' });
  if (config.assets.roughnessTexture) assignments.push({ path: config.assets.roughnessTexture, role: 'roughness', materialField: 'roughnessMap' });
  const ownedTextures = new Set<THREE.Texture>();
  let disposed = false;
  const ready = Promise.all(assignments.map(async (assignment) => {
    if (!assignment.path) return { role: assignment.role, status: 'missing' as const };
    const url = resolveSurfaceAssetUrl(assignment.path, options.baseUrl);
    if (!url) return { role: assignment.role, status: 'failed' as const };
    try {
      const source = await loadSharedSurfaceTexture(options.textureLoader, url, assignment.role);
      if (disposed) return { role: assignment.role, status: 'disposed' as const };
      const texture = configureSurfaceTexture(source, assignment.role, repeat, rotation, options.anisotropy);
      ownedTextures.add(texture);
      material[assignment.materialField] = texture;
      return { role: assignment.role, status: 'loaded' as const };
    } catch {
      return { role: assignment.role, status: 'failed' as const };
    }
  })).then((results) => {
    const failures = results.filter((result) => result.status === 'failed' || result.status === 'missing').map((result) => result.role);
    if (!failures.includes('baseColor') && !disposed) material.color.set('#ffffff');
    if (!disposed) material.needsUpdate = true;
    return { failures };
  });
  return {
    material,
    ready,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const texture of ownedTextures) texture.dispose();
      ownedTextures.clear();
      material.dispose();
    },
  };
}
