import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { RoulettePreview } from '../../../../web/src/RoulettePreview';
import { Roulette3D } from '@corsteno/roulette-3d';
import { runtimeApiBaseUrl } from '../../config/runtimeEnvironment';
import type { Roulette3DConfig } from '@corsteno/roulette-3d';
import { publicExperiencesApi, ParticipationBlockedError, type SpinResult } from '../../api/publicExperiencesApi';
import { createExperienceAnalytics, getParticipantIdentity } from '../../analytics/experienceAnalytics';
import { RouletteResult } from '../roulette/components/RouletteResult';
import { RouletteAudio } from './RouletteAudio';
import { RouletteHaptics } from './RouletteHaptics';
import { getARCapabilities, type ARCapabilityStatus } from '../xr/xrCapabilities';
import { XRManager } from '../xr/XRManager';
import type { ARExperienceState } from '../xr/ARExperience';
import { buildEffectiveRouletteOutcomes, type CommercialEntitlements } from '@corsteno/types';
import { subscriptionHasFeature } from '../../api/commercialEntitlements';

export function simulateTestSpin(config: Roulette3DConfig, prizeAvailability?: Record<string, 'available' | 'sold_out'>): SpinResult {
  const inventory = new Map(config.prizes.map((prize) => [prize.id, { stockMode: prizeAvailability?.[prize.id] === 'sold_out' ? 'limited' as const : 'unlimited' as const, stockAvailable: prizeAvailability?.[prize.id] === 'sold_out' ? 0 : null, deliveredCount: 0 }]));
  const outcomes = buildEffectiveRouletteOutcomes(config, inventory);
  const totalWeight = outcomes.reduce((total, outcome) => total + outcome.weight, 0);
  let cursor = Math.random() * totalWeight;
  const outcome = outcomes.find((item) => { cursor -= item.weight; return cursor < 0; }) ?? outcomes[outcomes.length - 1];
  const segmentIndex = outcome ? outcome.segmentIndices[Math.min(outcome.segmentIndices.length - 1, Math.floor(Math.random() * outcome.segmentIndices.length))]! : 0;
  const prize = outcome?.prizeId ? config.prizes.find((item) => item.id === outcome.prizeId) : undefined;
  return { spinId: `test-${crypto.randomUUID()}`, segmentIndex, segment: { id: config.segments[segmentIndex]?.id ?? '', prizeId: outcome?.prizeId ?? null }, prize: prize ? { id: prize.id, name: prize.name, iconUrl: prize.iconUrl ?? null } : null, claim: null, prizeAvailability };
}

export function Roulette3DView({ config, slug, entitlements, prizeAvailability, initialResult, testMode = false }: { config: Roulette3DConfig; slug: string; entitlements?: CommercialEntitlements; prizeAvailability?: Record<string, 'available' | 'sold_out'>; initialResult?: SpinResult; testMode?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Roulette3D | undefined>(undefined);
  const xrManagerRef = useRef<XRManager | undefined>(undefined);
  const completionTimerRef = useRef<number | undefined>(undefined);
  const animationWatchdogRef = useRef<number | undefined>(undefined);
  const spinInFlight = useRef(false);
  const spinRequestId = useRef<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState('');
  const [arStatus, setArStatus] = useState<ARCapabilityStatus>('unknown');
  const [arState, setArState] = useState<ARExperienceState | null>(null);
  const [arError, setArError] = useState('');
  const [participated, setParticipated] = useState(false);
  const [availability, setAvailability] = useState(prizeAvailability);
  const [result, setResult] = useState<SpinResult | null>(initialResult ?? null);
  const pendingResult = useRef<SpinResult | null>(null);
  const analytics = useRef(testMode ? { track: () => undefined, trackViewOnce: () => undefined } : createExperienceAnalytics(runtimeApiBaseUrl, slug));
  const participant = useRef<ReturnType<typeof getParticipantIdentity> | null>(null);
  participant.current ??= getParticipantIdentity();
  useEffect(() => setAvailability(prizeAvailability), [prizeAvailability]);
  useEffect(() => { if (result?.prizeAvailability) setAvailability(result.prizeAvailability); }, [result]);
  const audio = useRef(new RouletteAudio()); const haptics = useRef(new RouletteHaptics());
  const effects = { sound: config.effects?.sound ?? true, vibration: config.effects?.vibration ?? true, celebration: config.effects?.celebration ?? true };
  const content = { title: 'Ruleta de premios', intro: 'Girá la ruleta y descubrí tu premio.', spinButtonLabel: 'Girar', winMessage: '¡GANASTE!', noPrizeMessage: '¡GRACIAS POR JUGAR!', ...config.content };
  const stageStyle: CSSProperties = config.branding?.backgroundImageUrl ? { backgroundImage: `linear-gradient(#0d141bcc,#0d141bcc), url("${config.branding.backgroundImageUrl}")`, backgroundColor: config.backgroundColor, backgroundSize: 'cover', backgroundPosition: 'center', padding: '18px 12px', boxSizing: 'border-box', borderRadius: 24 } : { backgroundColor: config.backgroundColor, padding: '18px 12px', boxSizing: 'border-box', borderRadius: 24 };
  useEffect(() => { if (!testMode) analytics.current.trackViewOnce(); }, [slug, testMode]);
  useEffect(() => { let active = true; void getARCapabilities().then((capabilities) => { if (active) setArStatus(capabilities.status); }); return () => { active = false; }; }, []);
  useEffect(() => {
    if (!containerRef.current) return;
    try {
      const engine = new Roulette3D({ ...config, prizeAvailability: availability }, { onXRFrame: (time, frame) => xrManagerRef.current?.update(time, frame), onTick: (final) => { if (effects.sound) audio.current.tick(final); if (effects.vibration && final) haptics.current.tick(); }, onSpinStart: () => { setWaiting(false); setSpinning(true); }, onSpinComplete: (index) => { const final = pendingResult.current; engine.highlightSegment(index, true); if (animationWatchdogRef.current) window.clearTimeout(animationWatchdogRef.current); completionTimerRef.current = window.setTimeout(() => { if (final?.prize && effects.celebration) engine.celebrate(true); if (effects.sound) { if (final?.prize) audio.current.win(); else audio.current.neutral(); } if (effects.vibration) haptics.current.finish(Boolean(final?.prize)); setWaiting(false); setSpinning(false); spinInFlight.current = false; setResult(final); pendingResult.current = null; if (final) clearSpinRequestId(); }, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 220); } });
      engineRef.current = engine;
      engine.mount(containerRef.current);
      return () => { if (completionTimerRef.current) clearTimeout(completionTimerRef.current); if (animationWatchdogRef.current) clearTimeout(animationWatchdogRef.current); xrManagerRef.current?.dispose(); xrManagerRef.current = undefined; engineRef.current = undefined; engine.dispose(); };
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
    return <div className="roulette-stage" style={stageStyle}>{config.branding?.logoUrl && <img src={config.branding.logoUrl} alt="" style={{ maxWidth: 'min(220px, 70vw)', maxHeight: 72, objectFit: 'contain' }} />}{content.title && <h1 style={{ margin: 0, textAlign: 'center' }}>{content.title}</h1>}{content.intro && <p style={{ margin: 0, textAlign: 'center', whiteSpace: 'pre-line' }}>{content.intro}</p>}<RoulettePreview segments={segments} backgroundColor={config.backgroundColor} /><button className="spin-cta" type="button" disabled={waiting} onClick={() => void fallbackSpin()}>{waiting ? 'Preparando…' : content.spinButtonLabel}</button>{result && <RouletteResult result={result} config={config} onCta={ctaClick} />}</div>;
  }
  function getSpinRequestId() {
    if (spinRequestId.current) return spinRequestId.current;
    const key = `corsteno_spin_request:${slug}`;
    try {
      const stored = window.sessionStorage.getItem(key);
      if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)) { spinRequestId.current = stored; return stored; }
      const created = crypto.randomUUID();
      window.sessionStorage.setItem(key, created);
      spinRequestId.current = created;
    } catch { spinRequestId.current = crypto.randomUUID(); }
    return spinRequestId.current;
  }
  function clearSpinRequestId() { const key = `corsteno_spin_request:${slug}`; try { window.sessionStorage.removeItem(key); } catch { /* storage is optional */ } spinRequestId.current = null; }
  function displaySpinError(error: unknown) { if (error instanceof ParticipationBlockedError) { if (error.details.reason === 'cooldown' && error.details.retryAt) { const minutes = Math.max(1, Math.ceil((new Date(error.details.retryAt).getTime() - Date.now()) / 60000)); setError(`Podés volver a girar en ${minutes} min.`); } else if (error.details.reason === 'session_limit' || error.details.reason === 'device_limit') { setParticipated(true); setError(''); } else if (error.details.reason === 'identity_required') setError('No pudimos validar tu participación anónima.'); else setError('Ya participaste en esta experiencia.'); } else setError('No pudimos completar el giro. Revisá tu conexión e intentá de nuevo.'); }
  async function fallbackSpin() { if (spinInFlight.current || waiting || (!testMode && participated)) return; spinInFlight.current = true; audio.current.unlock(); setWaiting(true); setError(''); if (testMode) { setResult(simulateTestSpin(config, availability)); setWaiting(false); spinInFlight.current = false; return; } const requestId = getSpinRequestId(); analytics.current.track('roulette_spin_click', { experienceId: slug }); analytics.current.track('roulette_spin_started', { experienceId: slug, requestId }); try { const spinResult = await publicExperiencesApi.spin(slug, participant.current!, requestId); setResult(spinResult); clearSpinRequestId(); } catch (e) { displaySpinError(e); } finally { setWaiting(false); spinInFlight.current = false; } }
  async function spin() { if (spinInFlight.current || waiting || spinning || (!testMode && participated) || (arState !== null && arState !== 'placed')) return; spinInFlight.current = true; audio.current.unlock(); setWaiting(true); setError(''); engineRef.current?.clearCelebration(); if (testMode) { pendingResult.current = simulateTestSpin(config, availability); if (!engineRef.current?.spinTo(pendingResult.current.segmentIndex)) { setResult(pendingResult.current); setWaiting(false); spinInFlight.current = false; } return; } const requestId = getSpinRequestId(); analytics.current.track('roulette_spin_click', { experienceId: slug }); analytics.current.track('roulette_spin_started', { experienceId: slug, requestId }); try { const spinResult = await publicExperiencesApi.spin(slug, participant.current!, requestId); pendingResult.current = spinResult; if (!engineRef.current?.spinTo(spinResult.segmentIndex)) { pendingResult.current = null; setWaiting(false); setSpinning(false); spinInFlight.current = false; setResult(spinResult); clearSpinRequestId(); } else { animationWatchdogRef.current = window.setTimeout(() => { const final = pendingResult.current; if (!final) return; pendingResult.current = null; setWaiting(false); setSpinning(false); spinInFlight.current = false; setResult(final); clearSpinRequestId(); }, 7_000); } } catch (e) { pendingResult.current = null; setWaiting(false); spinInFlight.current = false; displaySpinError(e); } }
  function ctaClick() { analytics.current.track('roulette_result_cta_click', { experience: slug, prizeId: result?.prize?.id ?? null, spinId: result?.spinId }); }
  return <div className="roulette-stage" style={stageStyle}>{testMode && <p role="status" style={{ margin: 0, textAlign: 'center', fontWeight: 700 }}>MODO PRUEBA</p>}{config.branding?.logoUrl && <img src={config.branding.logoUrl} alt="" style={{ maxWidth: 'min(220px, 70vw)', maxHeight: 72, objectFit: 'contain' }} />}{content.title && <h1 style={{ margin: 0, textAlign: 'center' }}>{content.title}</h1>}{content.intro && <p style={{ margin: 0, textAlign: 'center', whiteSpace: 'pre-line' }}>{content.intro}</p>}<div ref={containerRef} className="roulette-3d" role="img" aria-label={content.title || 'Ruleta de premios'} />{arStatus === 'supported' && subscriptionHasFeature(entitlements, 'webxr_ar') && !arState && <button className="ar-cta" type="button" onClick={() => void enterAR()}>Ver en AR</button>}{arState && <div className="ar-overlay" role="status"><p>{arState === 'searching' ? 'Mové el teléfono para encontrar una superficie.' : arState === 'ready' ? 'Tocá para colocar la ruleta.' : 'Ruleta colocada. Tocá Girar o la pantalla para jugar.'}</p>{arState === 'ended' ? null : <button className="secondary-cta" type="button" onClick={() => void leaveAR()}>Salir de AR</button>}</div>}<button className="spin-cta" type="button" disabled={waiting || spinning || (!testMode && participated) || (arState !== null && arState !== 'placed')} onClick={() => void spin()}>{waiting ? 'Preparando…' : spinning ? 'Girando…' : !testMode && participated ? 'Ya participaste' : content.spinButtonLabel}</button>{!testMode && participated && <p role="status">Ya participaste en esta experiencia.</p>}{arError && <p className="roulette-error" role="alert">{arError}</p>}{error && <p className="roulette-error" role="alert">{error}</p>}{result && <RouletteResult result={result} config={{ ...config, content }} onCta={ctaClick} />}</div>;
}
