import { useEffect, useRef, useState } from 'react';
import { RoulettePreview } from '../../../../web/src/RoulettePreview';
import { Roulette3D } from './Roulette3D';
import type { Roulette3DConfig } from './types';

export function Roulette3DView({ config }: { config: Roulette3DConfig }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Roulette3D | undefined>(undefined);
  const [fallback, setFallback] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const demoTarget = useRef(0);
  useEffect(() => {
    if (!containerRef.current) return;
    try {
      const engine = new Roulette3D(config, { onSpinStart: () => setSpinning(true), onSpinComplete: () => setSpinning(false) });
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
  function spinDemo() { const target = demoTarget.current % config.segments.length; demoTarget.current += 1; engineRef.current?.spinTo(target); }
  return <div className="roulette-stage"><div ref={containerRef} className="roulette-3d" role="img" aria-label="Ruleta de premios" /><button className="spin-cta" type="button" disabled={spinning} onClick={spinDemo}>{spinning ? 'Girando…' : 'Girar'}</button></div>;
}
