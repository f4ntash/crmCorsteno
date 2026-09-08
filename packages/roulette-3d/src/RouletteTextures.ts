import * as THREE from 'three';

export function createLabelTexture(label: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return undefined;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = '700 42px system-ui, sans-serif';
  context.fillStyle = '#ffffff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.shadowColor = 'rgba(0,0,0,.35)';
  context.shadowBlur = 8;
  context.fillText(label.slice(0, 22), canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}

export function loadPrizeTexture(url: string) {
  const loader = new THREE.TextureLoader();
  const texture = loader.load(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}

export function disposeTexture(texture: THREE.Texture | undefined) {
  texture?.dispose();
}
