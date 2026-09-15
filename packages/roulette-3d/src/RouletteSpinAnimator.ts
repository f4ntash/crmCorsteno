import * as THREE from 'three';
import { rouletteRotationToPlaceSegmentAtPointer } from './RouletteAngles';

export type RouletteSpinCallbacks = { onSpinStart?: () => void; onSpinComplete?: (targetSegmentIndex: number) => void; onTick?: (final: boolean) => void };

const TAU = Math.PI * 2;
const mod = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;
const easeOutCubic = (value: number) => 1 - (1 - value) ** 3;
const easeInOutCubic = (value: number) => value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;

export class RouletteSpinAnimator {
  private wheel: THREE.Object3D;
  private pointer?: THREE.Object3D;
  private segmentCount: number;
  private readonly callbacks: RouletteSpinCallbacks;
  private readonly reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  private spinning = false;
  private elapsed = 0;
  private duration = 0;
  private startRotation = 0;
  private targetRotation = 0;
  private targetIndex = 0;
  private previousRotation = 0;
  private nextBoundary = 0;
  private pointerKick = 0;

  constructor(wheel: THREE.Object3D, pointer: THREE.Object3D | undefined, segmentCount: number, callbacks: RouletteSpinCallbacks = {}) {
    this.wheel = wheel;
    this.pointer = pointer;
    this.segmentCount = segmentCount;
    this.callbacks = callbacks;
    this.previousRotation = wheel.rotation.z;
  }

  setTarget(wheel: THREE.Object3D, pointer: THREE.Object3D | undefined, segmentCount: number) {
    this.wheel = wheel;
    this.pointer = pointer;
    this.segmentCount = segmentCount;
    this.spinning = false;
    this.previousRotation = wheel.rotation.z;
  }

  spinTo(targetSegmentIndex: number) {
    if (this.spinning || targetSegmentIndex < 0 || targetSegmentIndex >= this.segmentCount) return false;
    const step = TAU / this.segmentCount;
    const extraTurns = this.reducedMotion ? 2 : 5;
    this.startRotation = this.wheel.rotation.z;
    this.targetRotation = rouletteRotationToPlaceSegmentAtPointer(targetSegmentIndex, this.segmentCount, this.startRotation) + extraTurns * TAU;
    this.targetIndex = targetSegmentIndex;
    this.elapsed = 0;
    this.duration = this.reducedMotion ? 1400 : 5000;
    this.previousRotation = this.startRotation;
    this.nextBoundary = Math.floor(this.startRotation / step + 1) * step;
    this.pointerKick = 0;
    this.spinning = true;
    this.callbacks.onSpinStart?.();
    return true;
  }

  update(deltaSeconds: number) {
    if (!this.spinning) {
      this.pointerKick *= Math.max(0, 1 - deltaSeconds * 12);
      if (this.pointer) this.pointer.rotation.z = this.pointerKick;
      return;
    }
    this.elapsed = Math.min(this.duration, this.elapsed + deltaSeconds * 1000);
    const progress = this.elapsed / this.duration;
    const phaseProgress = progress < 0.05 ? easeInOutCubic(progress / 0.05) * 0.015 : progress < 0.16 ? 0.015 + easeInOutCubic((progress - 0.05) / 0.11) * 0.2 : progress < 0.3 ? 0.215 + ((progress - 0.16) / 0.14) * 0.2 : progress < 0.92 ? 0.415 + easeOutCubic((progress - 0.3) / 0.62) * 0.56 : 0.975 + easeInOutCubic((progress - 0.92) / 0.08) * 0.025;
    const anticipation = progress < 0.05 ? -0.018 * Math.sin(progress / 0.05 * Math.PI) : 0;
    this.wheel.rotation.z = this.startRotation + (this.targetRotation - this.startRotation) * phaseProgress + anticipation;
    const step = TAU / this.segmentCount;
    while (this.wheel.rotation.z >= this.nextBoundary && this.nextBoundary <= this.targetRotation + step) {
      this.nextBoundary += step;
      this.pointerKick = 0.12;
      this.callbacks.onTick?.(this.nextBoundary > this.targetRotation - step ? true : false);
    }
    this.previousRotation = this.wheel.rotation.z;
    this.pointerKick *= Math.max(0, 1 - deltaSeconds * 18);
    if (this.pointer) this.pointer.rotation.z = this.pointerKick;
    if (this.elapsed >= this.duration) {
      this.wheel.rotation.z = this.targetRotation;
      this.spinning = false;
      this.pointerKick = 0;
      if (this.pointer) this.pointer.rotation.z = 0;
      this.callbacks.onSpinComplete?.(this.targetIndex);
    }
  }

  get isSpinning() { return this.spinning; }
}
