import * as THREE from 'three';
import type { Roulette3D } from '@corsteno/roulette-3d';

export type ARExperienceState = 'searching' | 'ready' | 'placed' | 'ended';
type ARCallbacks = { onState: (state: ARExperienceState) => void; onError: () => void; onSelectAfterPlacement?: () => void };

export class ARExperience {
  private readonly engine: Roulette3D;
  private readonly callbacks: ARCallbacks;
  private readonly reticle = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.1, 32), new THREE.MeshBasicMaterial({ color: 0xf3c969, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  private session?: XRSession;
  private referenceSpace?: XRReferenceSpace;
  private viewerSpace?: XRReferenceSpace;
  private hitTestSource?: XRHitTestSource;
  private latestHit?: XRPose;
  private placed = false;
  private state: ARExperienceState | null = null;
  private readonly initialPosition = new THREE.Vector3();
  private readonly initialQuaternion = new THREE.Quaternion();
  private readonly initialScale = new THREE.Vector3();
  private onSelect = () => { if (this.placed) this.callbacks.onSelectAfterPlacement?.(); else if (this.latestHit) this.place(); };
  private onEnd = () => { this.cleanup(false); this.callbacks.onState('ended'); };

  constructor(engine: Roulette3D, callbacks: ARCallbacks) { this.engine = engine; this.callbacks = callbacks; this.reticle.rotation.x = -Math.PI / 2; this.reticle.matrixAutoUpdate = false; }

  private setState(state: ARExperienceState) { if (this.state === state) return; this.state = state; this.callbacks.onState(state); }

  async start(session: XRSession) {
    try {
      this.session = session; const root = this.engine.getRoot(); root.getWorldPosition(this.initialPosition); this.initialQuaternion.copy(root.quaternion); this.initialScale.copy(root.scale); this.referenceSpace = this.engine.getRenderer().xr.getReferenceSpace() ?? await session.requestReferenceSpace('local-floor'); this.viewerSpace = await session.requestReferenceSpace('viewer'); const requestHitTestSource = session.requestHitTestSource; if (!requestHitTestSource) throw new Error('AR hit-test unavailable'); this.hitTestSource = await requestHitTestSource.call(session, { space: this.viewerSpace });
      session.addEventListener('select', this.onSelect); session.addEventListener('end', this.onEnd); this.engine.getScene().add(this.reticle); this.engine.getRoot().visible = false; this.setState('searching');
    } catch { this.cleanup(true); this.callbacks.onError(); throw new Error('AR hit-test unavailable'); }
  }

  update(_time: number, frame: XRFrame) {
    if (!this.session || !this.referenceSpace || !this.hitTestSource || this.placed) return;
    const hit = frame.getHitTestResults(this.hitTestSource)[0]; const pose = hit?.getPose(this.referenceSpace); this.latestHit = pose ?? undefined; this.reticle.visible = Boolean(pose);
    if (pose) { this.reticle.matrix.fromArray(pose.transform.matrix); this.reticle.matrix.decompose(this.reticle.position, this.reticle.quaternion, this.reticle.scale); this.reticle.scale.multiplyScalar(1 + Math.sin(_time * 0.004) * 0.08); this.reticle.updateMatrix(); this.setState('ready'); }
  }

  private place() { if (!this.latestHit) return; const root = this.engine.getRoot(); root.visible = true; root.scale.setScalar(0.3); root.position.setFromMatrixPosition(this.reticle.matrix); root.position.y += 0.62; const camera = this.engine.getCamera(); const target = new THREE.Vector3(camera.position.x, root.position.y, camera.position.z); root.lookAt(target); this.reticle.visible = false; this.placed = true; this.setState('placed'); }

  cleanup(endSession: boolean) { const session = this.session; this.hitTestSource?.cancel(); this.hitTestSource = undefined; this.viewerSpace = undefined; this.referenceSpace = undefined; this.latestHit = undefined; this.reticle.removeFromParent(); this.reticle.geometry.dispose(); (this.reticle.material as THREE.Material).dispose(); const root = this.engine.getRoot(); root.visible = true; root.position.copy(this.initialPosition); root.quaternion.copy(this.initialQuaternion); root.scale.copy(this.initialScale); this.placed = false; this.session = undefined; session?.removeEventListener('select', this.onSelect); session?.removeEventListener('end', this.onEnd); this.state = null; if (endSession && session) void session.end(); }
}
