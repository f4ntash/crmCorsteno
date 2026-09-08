import * as THREE from 'three';

export function createRouletteFrame(radius: number) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0x17212c, metalness: 0.8, roughness: 0.24 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius + 0.13, 0.16, 12, 64), material);
  ring.castShadow = true;
  ring.receiveShadow = true;
  group.add(ring);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(radius - 0.05, 0.035, 8, 64), new THREE.MeshStandardMaterial({ color: 0xf3c969, metalness: 0.75, roughness: 0.2 }));
  inner.position.z = 0.1;
  group.add(inner);
  return group;
}
