import * as THREE from 'three';

export function createRouletteFrame(radius: number) {
  const group = new THREE.Group();

  const outerMaterial = new THREE.MeshStandardMaterial({ color: 0x1b2530, metalness: 0.75, roughness: 0.28 });
  const outerRing = new THREE.Mesh(new THREE.TorusGeometry(radius + 0.16, 0.19, 16, 64), outerMaterial);
  outerRing.castShadow = true;
  outerRing.receiveShadow = true;
  group.add(outerRing);

  const goldMaterial = new THREE.MeshStandardMaterial({
    color: 0xf3c969, metalness: 0.85, roughness: 0.16, emissive: 0xf3c969, emissiveIntensity: 0.08,
  });
  const innerRing = new THREE.Mesh(new THREE.TorusGeometry(radius - 0.02, 0.04, 10, 64), goldMaterial);
  innerRing.position.z = 0.12;
  group.add(innerRing);

  const bulbGeometry = new THREE.SphereGeometry(0.045, 10, 10);
  const bulbMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff3d0, emissive: 0xffd97a, emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.35,
  });
  const bulbCount = 20;
  for (let i = 0; i < bulbCount; i += 1) {
    const angle = (i / bulbCount) * Math.PI * 2;
    const bulb = new THREE.Mesh(bulbGeometry, bulbMaterial);
    bulb.position.set(Math.cos(angle) * (radius + 0.16), Math.sin(angle) * (radius + 0.16), 0.16);
    group.add(bulb);
  }

  return group;
}