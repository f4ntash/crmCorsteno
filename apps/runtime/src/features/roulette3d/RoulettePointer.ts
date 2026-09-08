import * as THREE from 'three';

export function createRoulettePointer(radius: number) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0xf4f7fa, metalness: 0.25, roughness: 0.2 });
  const pointer = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 4), material);
  pointer.rotation.z = Math.PI;
  pointer.position.y = radius + 0.36;
  pointer.position.z = 0.34;
  pointer.castShadow = true;
  group.add(pointer);
  const mount = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 8), new THREE.MeshStandardMaterial({ color: 0xf3c969, metalness: 0.75, roughness: 0.2 }));
  mount.position.set(0, radius + 0.08, 0.34);
  group.add(mount);
  return group;
}
