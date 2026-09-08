import { useEffect, useRef, useState } from 'react';
import { RoulettePreview } from '../../../../web/src/RoulettePreview';
import { Roulette3D } from './Roulette3D';
import type { Roulette3DConfig } from './types';
import { publicExperiencesApi, type SpinResult } from '../../api/publicExperiencesApi';
import { createExperienceAnalytics } from '../../analytics/experienceAnalytics';

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
  useEffect(() => { analytics.current.trackViewOnce(); }, [slug]);
  useEffect(() => {
    if (!containerRef.current) return;
    try {
      const engine = new Roulette3D(config, { onSpinStart: () => { setWaiting(false); setSpinning(true); }, onSpinComplete: () => { analytics.current.track('roulette_spin_completed', { experienceId: slug, spinId: pendingResult.current?.spinId }); setWaiting(false); setSpinning(false); setResult(pendingResult.current); } });
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
    return <RoulettePreview segments={segments} backgroundColor={config.backgroundColor} />;
  }
  async function spin() { if (waiting || spinning) return; analytics.current.track('roulette_spin_click', { experienceId: slug }); setWaiting(true); setError(''); setResult(null); try { const spinResult = await publicExperiencesApi.spin(slug); analytics.current.track('roulette_spin_started', { experienceId: slug, spinId: spinResult.spinId }); pendingResult.current = spinResult; if (!engineRef.current?.spinTo(spinResult.segmentIndex)) throw new Error('No se pudo iniciar el giro.'); } catch (e) { pendingResult.current = null; setWaiting(false); setError((e as Error).message); } }
  return <div className="roulette-stage"><div ref={containerRef} className="roulette-3d" role="img" aria-label="Ruleta de premios" /><button className="spin-cta" type="button" disabled={waiting || spinning} onClick={() => void spin()}>{waiting ? 'Preparando…' : spinning ? 'Girando…' : 'Girar'}</button>{error && <p className="roulette-error" role="alert">{error}</p>}{result && <div className="roulette-result" aria-live="polite">{result.prize ? <><strong>¡GANASTE!</strong><span>{result.prize.name}</span></> : <><strong>¡Gracias por jugar!</strong></>}</div>}</div>;
}
