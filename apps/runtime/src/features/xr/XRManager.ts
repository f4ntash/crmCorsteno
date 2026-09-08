import type { Roulette3D } from '@corsteno/roulette-3d';
import { ARExperience, type ARExperienceState } from './ARExperience';

export class XRManager {
  private readonly engine: Roulette3D;
  private readonly onState: (state: ARExperienceState) => void;
  private readonly onError: () => void;
  private readonly onSelectAfterPlacement?: () => void;
  private experience?: ARExperience;
  private session?: XRSession;

  constructor(engine: Roulette3D, callbacks: { onState: (state: ARExperienceState) => void; onError: () => void; onSelectAfterPlacement?: () => void }) { this.engine = engine; this.onState = callbacks.onState; this.onError = callbacks.onError; this.onSelectAfterPlacement = callbacks.onSelectAfterPlacement; }

  async enter() { try { const xr = (navigator as Navigator & { xr?: XRSystem }).xr; if (!xr) throw new Error('AR unavailable'); this.session = await xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['local-floor', 'dom-overlay'], domOverlay: { root: document.body } }); await this.engine.enterXR(this.session); this.experience = new ARExperience(this.engine, { onState: this.onState, onError: this.onError, onSelectAfterPlacement: this.onSelectAfterPlacement }); await this.experience.start(this.session); } catch (error) { await this.leave(); throw error; } }
  async leave() { this.experience?.cleanup(false); this.experience = undefined; const session = this.session; this.session = undefined; if (session) { try { await session.end(); } catch { /* session may already have ended */ } } await this.engine.exitXR(); this.onState('ended'); }
  update(time: number, frame: XRFrame) { this.experience?.update(time, frame); }
  dispose() { this.experience?.cleanup(false); this.experience = undefined; }
}
