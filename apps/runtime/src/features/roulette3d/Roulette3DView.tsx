import { useEffect, useRef, useState } from 'react';
import { RoulettePreview } from '../../../../web/src/RoulettePreview';
import { Roulette3D } from '@corsteno/roulette-3d';
import type { Roulette3DConfig } from '@corsteno/roulette-3d';
import { publicExperiencesApi, type SpinResult } from '../../api/publicExperiencesApi';
import { createExperienceAnalytics } from '../../analytics/experienceAnalytics';
import { RouletteResult } from '../roulette/components/RouletteResult';
import { RouletteAudio } from './RouletteAudio';
import { RouletteHaptics } from './RouletteHaptics';

export function Roulette3DView({ config, slug }: { config: Roulette3DConfig; slug: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Roulette3D | undefined>(undefined);
  const [fallback, setFallback] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SpinResult | null>(null);
  const pendingResult = useRef<SpinResult | null>(null);
  const analytics = useRef(createExperienceAnalytics(import.meta.env.VITE_API_URL ?? 'http://localhost:8787', slug));
  const audio = useRef(new RouletteAudio()); const haptics = useRef(new RouletteHaptics());
  const effects = { sound: config.effects?.sound ?? true, vibration: config.effects?.vibration ?? true, celebration: config.effects?.celebration ?? true };
  useEffect(() => { analytics.current.trackViewOnce(); }, [slug]);
  useEffect(() => {
    if (!containerRef.current) return;
    try {
      const engine = new Roulette3D(config, { onTick: (final) => { if (effects.sound) audio.current.tick(final); if (effects.vibration && final) haptics.current.tick(); }, onSpinStart: () => { setWaiting(false); setSpinning(true); }, onSpinComplete: (index) => { const final = pendingResult.current; engine.highlightSegment(index, true); window.setTimeout(() => { if (final?.prize && effects.celebration) engine.celebrate(true); if (effects.sound) { if (final?.prize) audio.current.win(); else audio.current.neutral(); } if (effects.vibration) haptics.current.finish(Boolean(final?.prize)); analytics.current.track('roulette_spin_completed', { experienceId: slug, spinId: final?.spinId }); setWaiting(false); setSpinning(false); setResult(final); }, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 220); } });
      engineRef.current = engine;
      return engine.mount(containerRef.current);
    } catch {
      engineRef.current = undefined;
      setFallback(true);
      return undefined;
    }
  }, [config]);
  if (fallback) {
    const segments = config.segments.map((segment) => { const prize = config.prizes.find((item) => item.id === segment.prizeId); return { ...segment, label: prize?.name ?? 'Sin premio', iconUrl: prize?.iconUrl ?? null }; });
    return <div className="roulette-stage"><RoulettePreview segments={segments} backgroundColor={config.backgroundColor} /><button className="spin-cta" type="button" disabled={waiting} onClick={() => void fallbackSpin()}>{waiting ? 'Preparando…' : 'Girar'}</button>{result && <RouletteResult result={result} config={config} onCta={ctaClick} />}</div>;
  }
  async function fallbackSpin() { if (waiting) return; audio.current.unlock(); analytics.current.track('roulette_spin_click', { experienceId: slug }); setWaiting(true); try { const spinResult = await publicExperiencesApi.spin(slug); analytics.current.track('roulette_spin_started', { experienceId: slug, spinId: spinResult.spinId }); analytics.current.track('roulette_spin_completed', { experienceId: slug, spinId: spinResult.spinId }); setResult(spinResult); } catch (e) { setError((e as Error).message); } finally { setWaiting(false); } }
  async function spin() { if (waiting || spinning) return; audio.current.unlock(); analytics.current.track('roulette_spin_click', { experienceId: slug }); setWaiting(true); setError(''); setResult(null); engineRef.current?.clearCelebration(); try { const spinResult = await publicExperiencesApi.spin(slug); analytics.current.track('roulette_spin_started', { experienceId: slug, spinId: spinResult.spinId }); pendingResult.current = spinResult; if (!engineRef.current?.spinTo(spinResult.segmentIndex)) throw new Error('No se pudo iniciar el giro.'); } catch (e) { pendingResult.current = null; setWaiting(false); setError((e as Error).message); } }
  function ctaClick() { analytics.current.track('roulette_result_cta_click', { experience: slug, prizeId: result?.prize?.id ?? null, spinId: result?.spinId }); }
  return <div className="roulette-stage"><div ref={containerRef} className="roulette-3d" role="img" aria-label="Ruleta de premios" /><button className="spin-cta" type="button" disabled={waiting || spinning} onClick={() => void spin()}>{waiting ? 'Preparando…' : spinning ? 'Girando…' : 'Girar'}</button>{error && <p className="roulette-error" role="alert">{error}</p>}{result && <RouletteResult result={result} config={config} onCta={ctaClick} />}</div>;
}
