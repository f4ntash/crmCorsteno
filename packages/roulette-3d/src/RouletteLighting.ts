import * as THREE from 'three';

export function createRouletteLighting() {
  const group = new THREE.Group();

  group.add(new THREE.HemisphereLight(0xfef6e4, 0x1a1f2b, 1.1));

  const key = new THREE.DirectionalLight(0xfff7ea, 2.1);
  key.position.set(-1.5, 3.2, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 4;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 12;
  key.shadow.camera.left = -3;
  key.shadow.camera.right = 3;
  key.shadow.camera.top = 3;
  key.shadow.camera.bottom = -3;
  key.shadow.bias = -0.0015;
  group.add(key);

  const fill = new THREE.DirectionalLight(0xbcd7ff, 0.6);
  fill.position.set(2.5, -1, 4);
  group.add(fill);

  const rim = new THREE.PointLight(0xffc98a, 4, 12, 2);
  rim.position.set(0, 0, 5.5);
  group.add(rim);

  return group;
}