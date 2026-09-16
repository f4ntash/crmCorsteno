import * as THREE from 'three';

export type SurfaceTextureRole = 'baseColor' | 'normal' | 'roughness';

// Keep source textures alive for the lifetime of the runtime. Each material gets
// a clone, so UV transforms remain surface-local while the file is fetched once.
const sourceTexturePromises = new Map<string, Promise<THREE.Texture>>();

function cacheKey(url: string, role: SurfaceTextureRole) {
  return `${role}:${url}`;
}
export function loadSharedSurfaceTexture(loader: THREE.TextureLoader, url: string, role: SurfaceTextureRole): Promise<THREE.Texture> {
  const key = cacheKey(url, role);
  const cached = sourceTexturePromises.get(key);
  if (cached) return cached;

  const promise = new Promise<THREE.Texture>((resolve, reject) => {
    loader.load(url, (texture) => {
      texture.colorSpace = role === 'baseColor' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.generateMipmaps = true;
      resolve(texture);
    }, undefined, () => reject(new Error(`No se pudo cargar ${role}`)));
  });
  // Cache failures too. A broken asset should not trigger a request on every
  // surface selection; replacing the asset URL is the explicit retry boundary.
  sourceTexturePromises.set(key, promise);
  return promise;
}

export function configureSurfaceTexture(
  source: THREE.Texture,
  role: SurfaceTextureRole,
  repeat: { x: number; y: number },
  rotation: number,
  anisotropy: number,
) {
  const texture = source.clone();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat.x, repeat.y);
  texture.center.set(0.5, 0.5);
  texture.rotation = rotation;
  texture.colorSpace = role === 'baseColor' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.max(1, Math.min(4, Math.floor(anisotropy) || 1));
  texture.needsUpdate = true;
  return texture;
}
