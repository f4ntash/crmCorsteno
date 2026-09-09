import { useEffect, useRef, useState } from 'react';
import { RoulettePreview } from '../../../../web/src/RoulettePreview';
import { Roulette3D } from '@corsteno/roulette-3d';
import type { Roulette3DConfig } from '@corsteno/roulette-3d';
import { publicExperiencesApi, ParticipationBlockedError, type SpinResult } from '../../api/publicExperiencesApi';
import { createExperienceAnalytics, getParticipantIdentity } from '../../analytics/experienceAnalytics';
import { RouletteResult } from '../roulette/components/RouletteResult';
import { RouletteAudio } from './RouletteAudio';
import { RouletteHaptics } from './RouletteHaptics';
import { getARCapabilities, type ARCapabilityStatus } from '../xr/xrCapabilities';
import { XRManager } from '../xr/XRManager';
import type { ARExperienceState } from '../xr/ARExperience';
import type { CommercialEntitlements } from '@corsteno/types';
import { subscriptionHasFeature } from '../../api/commercialEntitlements';

export function Roulette3DView({ config, slug, entitlements, prizeAvailability }: { config: Roulette3DConfig; slug: string; entitlements?: CommercialEntitlements; prizeAvailability?: Record<string, 'available' | 'sold_out'> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Roulette3D | undefined>(undefined);
  const xrManagerRef = useRef<XRManager | undefined>(undefined);
  const [fallback, setFallback] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SpinResult | null>(null);
  const [arStatus, setArStatus] = useState<ARCapabilityStatus>('unknown');
  const [arState, setArState] = useState<ARExperienceState | null>(null);
  const [arError, setArError] = useState('');
  const participationKey = `corsteno:participated:${slug}`;
  const [participated, setParticipated] = useState(() => {
    try { return window.localStorage.getItem(participationKey) === '1'; } catch { return false; }
  });
  const [availability, setAvailability] = useState(prizeAvailability);
  const pendingResult = useRef<SpinResult | null>(null);
  const analytics = useRef(createExperienceAnalytics(import.meta.env.VITE_API_URL ?? 'http://localhost:8787', slug));
  const participant = useRef(getParticipantIdentity());
  useEffect(() => setAvailability(prizeAvailability), [prizeAvailability]);
  useEffect(() => { if (result?.prizeAvailability) setAvailability(result.prizeAvailability); }, [result]);
  useEffect(() => {
    if (!result) return;
    setParticipated(true);
    try { window.localStorage.setItem(participationKey, '1'); } catch { /* storage is optional */ }
  }, [result, participationKey]);
  const audio = useRef(new RouletteAudio()); const haptics = useRef(new RouletteHaptics());
  const effects = { sound: config.effects?.sound ?? true, vibration: config.effects?.vibration ?? true, celebration: config.effects?.celebration ?? true };
  useEffect(() => { analytics.current.trackViewOnce(); }, [slug]);
  useEffect(() => { let active = true; void getARCapabilities().then((capabilities) => { if (active) setArStatus(capabilities.status); }); return () => { active = false; }; }, []);
  useEffect(() => {
    if (!containerRef.current) return;
    try {
      const engine = new Roulette3D({ ...config, prizeAvailability: availability }, { onXRFrame: (time, frame) => xrManagerRef.current?.update(time, frame), onTick: (final) => { if (effects.sound) audio.current.tick(final); if (effects.vibration && final) haptics.current.tick(); }, onSpinStart: () => { setWaiting(false); setSpinning(true); }, onSpinComplete: (index) => { const final = pendingResult.current; engine.highlightSegment(index, true); window.setTimeout(() => { if (final?.prize && effects.celebration) engine.celebrate(true); if (effects.sound) { if (final?.prize) audio.current.win(); else audio.current.neutral(); } if (effects.vibration) haptics.current.finish(Boolean(final?.prize)); analytics.current.track('roulette_spin_completed', { experienceId: slug, spinId: final?.spinId }); setWaiting(false); setSpinning(false); setResult(final); }, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 220); } });
      engineRef.current = engine;
      engine.mount(containerRef.current);
      return () => { xrManagerRef.current?.dispose(); xrManagerRef.current = undefined; engineRef.current = undefined; engine.dispose(); };
    } catch {
      engineRef.current = undefined;
      setFallback(true);
      return undefined;
    }
  }, [config, availability]);
  function handleARState(state: ARExperienceState) { setArState(state === 'ended' ? null : state); if (state === 'placed') analytics.current.track('roulette_ar_placed', { experienceId: slug }); if (state === 'ended') analytics.current.track('roulette_ar_session_ended', { experienceId: slug }); }
  async function enterAR() { const engine = engineRef.current; if (!engine || arStatus !== 'supported' || !subscriptionHasFeature(entitlements, 'webxr_ar')) return; setArError(''); analytics.current.track('roulette_ar_open_click', { experienceId: slug }); const manager = new XRManager(engine, { onState: handleARState, onError: () => setArError('No pudimos iniciar AR. Podés seguir jugando en modo 3D.'), onSelectAfterPlacement: () => { void spin(); } }); xrManagerRef.current = manager; try { await manager.enter(); analytics.current.track('roulette_ar_session_started', { experienceId: slug }); } catch { xrManagerRef.current = undefined; setArState(null); setArError('No pudimos iniciar AR. Podés seguir jugando en modo 3D.'); } }
  async function leaveAR() { if (!xrManagerRef.current) return; await xrManagerRef.current.leave(); xrManagerRef.current = undefined; }
  if (fallback) {
    const segments = config.segments.map((segment) => { const prize = config.prizes.find((item) => item.id === segment.prizeId); return { ...segment, label: prize?.name ?? 'Sin premio', iconUrl: prize?.iconUrl ?? null }; });
    return <div className="roulette-stage"><RoulettePreview segments={segments} backgroundColor={config.backgroundColor} /><button className="spin-cta" type="button" disabled={waiting} onClick={() => void fallbackSpin()}>{waiting ? 'Preparando…' : 'Girar'}</button>{result && <RouletteResult result={result} config={config} onCta={ctaClick} />}</div>;
  }
  function displaySpinError(error: unknown) { if (error instanceof ParticipationBlockedError) { if (error.details.reason === 'cooldown' && error.details.retryAt) { const minutes = Math.max(1, Math.ceil((new Date(error.details.retryAt).getTime() - Date.now()) / 60000)); setError(`Podés volver a girar en ${minutes} min.`); } else if (error.details.reason === 'session_limit') setError('Ya utilizaste todas tus participaciones.'); else if (error.details.reason === 'identity_required') setError('No pudimos validar tu participación anónima.'); else setError('Ya participaste en esta experiencia.'); } else setError((error as Error).message); }
  async function fallbackSpin() { if (waiting || participated) return; audio.current.unlock(); analytics.current.track('roulette_spin_click', { experienceId: slug }); setWaiting(true); try { const spinResult = await publicExperiencesApi.spin(slug, participant.current); analytics.current.track('roulette_spin_started', { experienceId: slug, spinId: spinResult.spinId }); analytics.current.track('roulette_spin_completed', { experienceId: slug, spinId: spinResult.spinId }); setResult(spinResult); setParticipated(true); } catch (e) { displaySpinError(e); } finally { setWaiting(false); } }
  async function spin() { if (waiting || spinning || participated || (arState !== null && arState !== 'placed')) return; audio.current.unlock(); analytics.current.track('roulette_spin_click', { experienceId: slug }); setWaiting(true); setError(''); setResult(null); engineRef.current?.clearCelebration(); try { const spinResult = await publicExperiencesApi.spin(slug, participant.current); analytics.current.track('roulette_spin_started', { experienceId: slug, spinId: spinResult.spinId }); pendingResult.current = spinResult; if (!engineRef.current?.spinTo(spinResult.segmentIndex)) throw new Error('No se pudo iniciar el giro.'); } catch (e) { pendingResult.current = null; setWaiting(false); displaySpinError(e); } }
  function ctaClick() { analytics.current.track('roulette_result_cta_click', { experience: slug, prizeId: result?.prize?.id ?? null, spinId: result?.spinId }); }
  return <div className="roulette-stage"><div ref={containerRef} className="roulette-3d" role="img" aria-label="Ruleta de premios" />{arStatus === 'supported' && subscriptionHasFeature(entitlements, 'webxr_ar') && !arState && <button className="ar-cta" type="button" onClick={() => void enterAR()}>Ver en AR</button>}{arState && <div className="ar-overlay" role="status"><p>{arState === 'searching' ? 'Mové el teléfono para encontrar una superficie.' : arState === 'ready' ? 'Tocá para colocar la ruleta.' : 'Ruleta colocada. Tocá Girar o la pantalla para jugar.'}</p>{arState === 'ended' ? null : <button className="secondary-cta" type="button" onClick={() => void leaveAR()}>Salir de AR</button>}</div>}<button className="spin-cta" type="button" disabled={waiting || spinning || participated || (arState !== null && arState !== 'placed')} onClick={() => void spin()}>{waiting ? 'Preparando…' : spinning ? 'Girando…' : participated ? 'Ya participaste' : 'Girar'}</button>{participated && <p role="status">Ya participaste en esta experiencia.</p>}{arError && <p className="roulette-error" role="alert">{arError}</p>}{error && <p className="roulette-error" role="alert">{error}</p>}{result && <RouletteResult result={result} config={config} onCta={ctaClick} />}</div>;
}
