import * as THREE from 'three';
import { createLabelTexture, disposeTexture, loadPrizeTexture } from './RouletteTextures';
import { rouletteSegmentCenterAngle, rouletteSegmentGeometryStartAngle } from './RouletteAngles';
import type { Roulette3DConfig } from './types';

const radius = 2.3;
const depth = 0.28;

export class RouletteWheel {
  readonly group = new THREE.Group();
  private segmentMeshes: THREE.Mesh[] = [];
  private resources: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = [];

  constructor(config: Roulette3DConfig) { this.update(config); }

  update(config: Roulette3DConfig) {
    this.clear();
    const count = Math.max(1, Math.min(10, config.segments.length));
    const step = (Math.PI * 2) / count;
    const gap = Math.min(0.035, step * 0.08);
    config.segments.forEach((segment, index) => {
      const geometry = new THREE.CylinderGeometry(radius, radius, depth, 24, 1, false, rouletteSegmentGeometryStartAngle(index, count) + gap, step - gap * 2);
      geometry.rotateX(Math.PI / 2);
      const material = new THREE.MeshStandardMaterial({
        color: segment.color,
        metalness: 0.08,
        roughness: 0.52,
        emissive: segment.color,
        emissiveIntensity: 0.08,
        transparent: segment.prizeId !== null && config.prizeAvailability?.[segment.prizeId] === 'sold_out',
        opacity: segment.prizeId !== null && config.prizeAvailability?.[segment.prizeId] === 'sold_out' ? 0.38 : 1,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.segmentMeshes.push(mesh);
      this.resources.push(geometry, material);
      const prize = config.prizes.find((item) => item.id === segment.prizeId);
      const soldOut = segment.prizeId !== null && config.prizeAvailability?.[segment.prizeId] === 'sold_out';
      const texture = !soldOut && prize?.iconUrl ? loadPrizeTexture(prize.iconUrl) : createLabelTexture(soldOut ? 'SIN STOCK' : (prize?.name ?? 'Sin premio'));
      if (!texture) return;
      const iconMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
      const icon = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.24), iconMaterial);
      const angle = rouletteSegmentCenterAngle(index, count);
      icon.position.set(Math.cos(angle) * radius * 0.6, Math.sin(angle) * radius * 0.6, depth / 2 + 0.025);
      icon.rotation.z = angle - Math.PI / 2; // FIX: antes era +Math.PI/2, quedaba el texto invertido
      icon.scale.setScalar(prize?.iconUrl ? 1.35 : 1);
      this.group.add(icon);
      this.resources.push(icon.geometry, iconMaterial, texture);
    });
    const separatorMaterial = new THREE.MeshStandardMaterial({ color: 0x121a24, metalness: 0.55, roughness: 0.35 });
    for (let index = 0; index < count; index += 1) {
      const separator = new THREE.Mesh(new THREE.BoxGeometry(0.03, radius, depth + 0.02), separatorMaterial);
      const angle = -Math.PI / 2 + index * step;
      separator.position.set(Math.cos(angle) * radius / 2, Math.sin(angle) * radius / 2, depth / 2 + 0.005);
      separator.rotation.z = angle + Math.PI / 2;
      separator.castShadow = false; // eran ellos los que generaban las franjas oscuras diagonales
      this.group.add(separator);
      this.resources.push(separator.geometry);
    }
    this.resources.push(separatorMaterial);

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.34, 32), new THREE.MeshStandardMaterial({ color: 0x1b2530, metalness: 0.75, roughness: 0.3 }));
    hub.rotation.x = Math.PI / 2;
    hub.position.z = 0.14;
    hub.castShadow = true;
    this.group.add(hub);
    this.resources.push(hub.geometry, hub.material);

    const hubCap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 32), new THREE.MeshStandardMaterial({
      color: 0xf3c969, metalness: 0.85, roughness: 0.18, emissive: 0xf3c969, emissiveIntensity: 0.12,
    }));
    hubCap.rotation.x = Math.PI / 2;
    hubCap.position.z = 0.14 + 0.17 + 0.03;
    this.group.add(hubCap);
    this.resources.push(hubCap.geometry, hubCap.material);
  }

  dispose() { this.clear(); }
  highlight(index: number, active: boolean) { const mesh = this.segmentMeshes[index]; if (!mesh) return; const material = mesh.material as THREE.MeshStandardMaterial; material.emissiveIntensity = active ? 0.42 : 0.08; mesh.scale.setScalar(active ? 1.025 : 1); }

  private clear() {
    for (const resource of this.resources) {
      if (resource instanceof THREE.Texture) disposeTexture(resource);
      else resource.dispose();
    }
    this.resources = [];
    this.segmentMeshes = [];
    while (this.group.children.length) this.group.remove(this.group.children[0]!);
  }
}

export { radius as ROULETTE_RADIUS };
