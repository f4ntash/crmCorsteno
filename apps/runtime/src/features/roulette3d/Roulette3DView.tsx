import { useEffect, useRef } from 'react';
import { useState } from 'react';
import { RoulettePreview } from '../../../../web/src/RoulettePreview';
import { Roulette3D } from './Roulette3D';
import type { Roulette3DConfig } from './types';

export function Roulette3DView({ config }: { config: Roulette3DConfig }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Roulette3D | undefined>(undefined);
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    if (!containerRef.current) return;
    try {
      const engine = new Roulette3D(config);
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
  return <div ref={containerRef} className="roulette-3d" role="img" aria-label="Ruleta de premios" />;
}
