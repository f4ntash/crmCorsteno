import * as THREE from 'three';

export function createRouletteLighting() {
  const group = new THREE.Group();
  group.add(new THREE.HemisphereLight(0xdbeafe, 0x111827, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 3.8);
  key.position.set(-3, 5, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 12;
  key.shadow.camera.left = -5;
  key.shadow.camera.right = 5;
  key.shadow.camera.top = 5;
  key.shadow.camera.bottom = -5;
  group.add(key);
  const rim = new THREE.PointLight(0x79a7d3, 12, 10, 2);
  rim.position.set(3, 1, 3);
  group.add(rim);
  return group;
}
