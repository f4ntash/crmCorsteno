import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SURFACE_MATERIAL_SCHEMA_VERSION, type TextureSurfaceMaterialConfig } from '@corsteno/types';
import { resolveSurfaceMaterial } from './surfaceMaterialResolver';

function config(overrides: Partial<TextureSurfaceMaterialConfig> = {}): TextureSurfaceMaterialConfig {
  return {
    schemaVersion: SURFACE_MATERIAL_SCHEMA_VERSION,
    mode: 'texture',
    physicalWidthM: 0.16,
    physicalHeightM: 2.4,
    roughness: 0.78,
    metalness: 0,
    rotationDegrees: 90,
    repeatMode: 'repeat',
    fallbackColor: '#9b7854',
    normalScale: 0.38,
    assets: {
      baseColorTexture: '/pbr/base.webp',
      normalTexture: '/pbr/normal.webp',
      roughnessTexture: '/pbr/roughness.webp',
    },
    ...overrides,
  };
}

function fakeLoader(failures: string[] = []) {
  let loadCount = 0;
  const loader = {
    load(url: string, onLoad: (texture: THREE.Texture) => void, _onProgress?: unknown, onError?: () => void) {
      loadCount += 1;
      if (failures.some((failure) => url.includes(failure))) { onError?.(); return; }
      const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
      texture.needsUpdate = true;
      onLoad(texture);
    },
  } as unknown as THREE.TextureLoader;
  return { loader, getLoadCount: () => loadCount };
}

describe('resolveSurfaceMaterial', () => {
  it('loads PBR maps once and keeps repeat/rotation on surface-local clones', async () => {
    const fake = fakeLoader();
    const first = resolveSurfaceMaterial(config(), 5, 2.9, '#d7d1c6', { textureLoader: fake.loader, baseUrl: 'http://localhost:5175', anisotropy: 8 });
    const second = resolveSurfaceMaterial(config(), 5, 2.9, '#d7d1c6', { textureLoader: fake.loader, baseUrl: 'http://localhost:5175', anisotropy: 8 });
    expect(first.material.color.getHexString()).toBe('9b7854');
    expect((await first.ready).failures).toEqual([]);
    expect((await second.ready).failures).toEqual([]);
    expect(fake.getLoadCount()).toBe(3);
    expect(first.material.map?.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(first.material.normalMap?.colorSpace).toBe(THREE.NoColorSpace);
    expect(first.material.roughnessMap?.colorSpace).toBe(THREE.NoColorSpace);
    expect(first.material.map?.repeat.x).toBeCloseTo(31.25);
    expect(first.material.map?.repeat.y).toBeCloseTo(2.9 / 2.4);
    expect(first.material.map?.rotation).toBeCloseTo(Math.PI / 2);
    expect(first.material.map).not.toBe(second.material.map);
    first.dispose();
    second.dispose();
  });

  it('keeps the solid fallback when Base Color fails and degrades optional maps', async () => {
    const fake = fakeLoader(['base.webp']);
    const resolved = resolveSurfaceMaterial(config({ assets: { baseColorTexture: '/pbr/failing-base.webp', normalTexture: '/pbr/failing-normal.webp', roughnessTexture: '/pbr/failing-roughness.webp' } }), 5, 2.9, '#d7d1c6', { textureLoader: fake.loader, baseUrl: 'http://localhost:5175', anisotropy: 2 });
    const result = await resolved.ready;
    expect(result.failures).toEqual(['baseColor']);
    expect(resolved.material.color.getHexString()).toBe('9b7854');
    expect(resolved.material.normalMap).toBeTruthy();
    expect(resolved.material.roughnessMap).toBeTruthy();
    resolved.dispose();
  });

  it('does not report omitted optional maps as failures', async () => {
    const fake = fakeLoader();
    const resolved = resolveSurfaceMaterial(config({ assets: { baseColorTexture: '/pbr/base-only.webp' } }), 5, 2.9, '#d7d1c6', { textureLoader: fake.loader, baseUrl: 'http://localhost:5175', anisotropy: 2 });
    expect((await resolved.ready).failures).toEqual([]);
    expect(resolved.material.map).toBeTruthy();
    expect(resolved.material.normalMap).toBeNull();
    expect(resolved.material.roughnessMap).toBeNull();
    resolved.dispose();
  });
});
