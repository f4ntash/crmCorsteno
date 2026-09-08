import * as THREE from 'three';
import { createRouletteFrame } from './RouletteFrame';
import { createRouletteLighting } from './RouletteLighting';
import { createRoulettePointer } from './RoulettePointer';
import { RouletteWheel, ROULETTE_RADIUS } from './RouletteWheel';
import { RouletteSpinAnimator } from './RouletteSpinAnimator';
import type { Roulette3DConfig } from './types';

type Roulette3DOptions = { onSpinStart?: () => void; onSpinComplete?: (targetSegmentIndex: number) => void };

export class Roulette3D {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  private readonly root = new THREE.Group();
  private wheel?: RouletteWheel;
  private frame?: THREE.Group;
  private pointer?: THREE.Group;
  private container?: HTMLElement;
  private animationFrame?: number;
  private resizeObserver?: ResizeObserver;
  private lastTime = 0;
  private readonly spinAnimator: RouletteSpinAnimator;

  constructor(config: Roulette3DConfig, options: Roulette3DOptions = {}) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.scene.background = new THREE.Color(config.backgroundColor);
    this.scene.add(createRouletteLighting());
    this.root.position.y = -0.12;
    this.scene.add(this.root);
    this.update(config);
    this.spinAnimator = new RouletteSpinAnimator(this.wheel!.group, this.pointer, config.segments.length, options);
    this.camera.position.set(0, 0.05, 7.6);
    this.camera.lookAt(0, 0, 0);
  }

  mount(container: HTMLElement) { this.container = container; container.replaceChildren(this.renderer.domElement); this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container); this.resize(); this.lastTime = performance.now(); this.animate(); return () => this.dispose(); }
  update(config: Roulette3DConfig) { this.scene.background = new THREE.Color(config.backgroundColor); this.wheel?.dispose(); this.wheel = new RouletteWheel(config); this.root.add(this.wheel.group); if (!this.frame) { this.frame = createRouletteFrame(ROULETTE_RADIUS); this.root.add(this.frame); } if (!this.pointer) { this.pointer = createRoulettePointer(ROULETTE_RADIUS); this.root.add(this.pointer); } if (this.spinAnimator) this.spinAnimator.setTarget(this.wheel.group, this.pointer, config.segments.length); }
  spinTo(targetSegmentIndex: number) { return this.spinAnimator.spinTo(targetSegmentIndex); }
  resize() { if (!this.container) return; const width = Math.max(1, this.container.clientWidth); const height = Math.max(1, this.container.clientHeight); this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height, false); }
  dispose() { if (this.animationFrame) cancelAnimationFrame(this.animationFrame); this.animationFrame = undefined; this.resizeObserver?.disconnect(); this.resizeObserver = undefined; this.wheel?.dispose(); this.scene.traverse((object) => { const mesh = object as THREE.Mesh; mesh.geometry?.dispose(); const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []; materials.forEach((material) => { material.dispose(); const map = (material as THREE.MeshStandardMaterial).map; map?.dispose(); }); }); this.renderer.dispose(); this.renderer.domElement.remove(); this.container = undefined; }

  private animate = (time = performance.now()) => { this.animationFrame = requestAnimationFrame(this.animate); const delta = Math.min(0.05, (time - this.lastTime) / 1000); this.lastTime = time; if (!this.spinAnimator.isSpinning) this.wheel!.group.rotation.z += delta * 0.018; this.spinAnimator.update(delta); this.renderer.render(this.scene, this.camera); };
}
