import * as THREE from 'three';

export class RouletteCelebration {
  readonly group = new THREE.Group();
  private readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  private elapsed = 0;
  private active = false;
  private readonly reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  constructor() {
    const count = this.reducedMotion ? 18 : 64;
    this.positions = new Float32Array(count * 3); this.velocities = new Float32Array(count * 3);
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xf3c969, size: 0.075, transparent: true, opacity: 0.95, sizeAttenuation: true }));
    this.group.add(this.points); this.group.visible = false;
  }
  start(win: boolean) {
    this.clear(); if (!win) return;
    for (let i = 0; i < this.positions.length; i += 3) { const angle = Math.random() * Math.PI * 2; const radius = 0.2 + Math.random() * 1.9; this.positions[i] = Math.cos(angle) * radius; this.positions[i + 1] = Math.sin(angle) * radius; this.positions[i + 2] = 0.25 + Math.random() * 0.4; this.velocities[i] = (Math.random() - 0.5) * 0.5; this.velocities[i + 1] = 0.7 + Math.random() * 1.3; this.velocities[i + 2] = (Math.random() - 0.5) * 0.45; }
    this.points.geometry.getAttribute('position').needsUpdate = true; this.elapsed = 0; this.active = true; this.group.visible = true;
  }
  update(delta: number) { if (!this.active) return; this.elapsed += delta; for (let i = 0; i < this.positions.length; i += 3) { this.positions[i] = this.positions[i]! + this.velocities[i]! * delta; this.positions[i + 1] = this.positions[i + 1]! + this.velocities[i + 1]! * delta; this.velocities[i + 1] = this.velocities[i + 1]! - 1.25 * delta; } this.points.geometry.getAttribute('position').needsUpdate = true; (this.points.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - this.elapsed / 2.2); if (this.elapsed >= 2.2) this.clear(); }
  clear() { this.active = false; this.elapsed = 0; this.group.visible = false; (this.points.material as THREE.PointsMaterial).opacity = 0.95; }
  dispose() { this.points.geometry.dispose(); (this.points.material as THREE.Material).dispose(); }
}
