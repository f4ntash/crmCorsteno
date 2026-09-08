import * as THREE from 'three';
import { createLabelTexture, disposeTexture, loadPrizeTexture } from './RouletteTextures';
import type { Roulette3DConfig } from './types';

const radius = 2.3;
const depth = 0.28;

export class RouletteWheel {
  readonly group = new THREE.Group();
  private resources: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];

  constructor(config: Roulette3DConfig) { this.update(config); }

  update(config: Roulette3DConfig) {
    this.clear();
    const count = Math.max(1, Math.min(10, config.segments.length));
    const step = (Math.PI * 2) / count;
    const gap = Math.min(0.035, step * 0.08);
    config.segments.forEach((segment, index) => {
      const geometry = new THREE.CylinderGeometry(radius, radius, depth, 24, 1, false, -Math.PI / 2 + index * step + gap, step - gap * 2);
      geometry.rotateX(Math.PI / 2);
      const material = new THREE.MeshStandardMaterial({ color: segment.color, metalness: 0.22, roughness: 0.3 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.resources.push(geometry, material);
      const prize = config.prizes.find((item) => item.id === segment.prizeId);
      const texture = prize?.iconUrl ? loadPrizeTexture(prize.iconUrl) : createLabelTexture(prize?.name ?? 'Sin premio');
      if (!texture) return;
      const iconMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
      const icon = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.24), iconMaterial);
      const angle = -Math.PI / 2 + (index + 0.5) * step;
      icon.position.set(Math.cos(angle) * radius * 0.58, Math.sin(angle) * radius * 0.58, depth / 2 + 0.025);
      icon.rotation.z = angle + Math.PI / 2;
      icon.scale.setScalar(prize?.iconUrl ? 1.35 : 1);
      this.group.add(icon);
      this.resources.push(icon.geometry, iconMaterial, texture);
    });
    const separatorMaterial = new THREE.MeshStandardMaterial({ color: 0x111923, metalness: 0.7, roughness: 0.25 });
    for (let index = 0; index < count; index += 1) {
      const separator = new THREE.Mesh(new THREE.BoxGeometry(0.035, radius, depth + 0.09), separatorMaterial);
      const angle = -Math.PI / 2 + index * step;
      separator.position.set(Math.cos(angle) * radius / 2, Math.sin(angle) * radius / 2, depth / 2 + 0.02);
      separator.rotation.z = angle + Math.PI / 2;
      separator.castShadow = true;
      this.group.add(separator);
      this.resources.push(separator.geometry);
    }
    this.resources.push(separatorMaterial);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.38, 32), new THREE.MeshStandardMaterial({ color: 0x17212c, metalness: 0.8, roughness: 0.2 }));
    hub.rotation.x = Math.PI / 2;
    hub.position.z = 0.13;
    hub.castShadow = true;
    this.group.add(hub);
    this.resources.push(hub.geometry, hub.material);
  }

  dispose() { this.clear(); }

  private clear() {
    for (const resource of this.resources) {
      if (resource instanceof THREE.Texture) disposeTexture(resource);
      else resource.dispose();
    }
    this.resources = [];
    while (this.group.children.length) this.group.remove(this.group.children[0]!);
  }
}

export { radius as ROULETTE_RADIUS };
