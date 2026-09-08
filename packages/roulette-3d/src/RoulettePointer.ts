import * as THREE from 'three';

export function createRoulettePointer(radius: number) {
  const group = new THREE.Group();

  const material = new THREE.MeshStandardMaterial({
    color: 0xff5a5f, metalness: 0.3, roughness: 0.25, emissive: 0xff5a5f, emissiveIntensity: 0.15,
  });
  const pointer = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 32), material);
  pointer.rotation.z = Math.PI;
  pointer.position.y = radius + 0.32;
  pointer.position.z = 0.34;
  pointer.castShadow = true;
  group.add(pointer);

  const mount = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 16), new THREE.MeshStandardMaterial({
    color: 0xf3c969, metalness: 0.8, roughness: 0.18, emissive: 0xf3c969, emissiveIntensity: 0.1,
  }));
  mount.position.set(0, radius + 0.06, 0.34);
  group.add(mount);

  return group;
}