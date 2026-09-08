import { useEffect, useRef, useState } from 'react';
import { RoulettePreview } from '../../../RoulettePreview';
import { Roulette3D } from '@corsteno/roulette-3d';
import type { Roulette3DConfig } from '@corsteno/roulette-3d';

export function Roulette3DPreview({ config }: { config: Roulette3DConfig }) {
  const ref = useRef<HTMLDivElement>(null); const engineRef = useRef<Roulette3D | null>(null); const [fallback, setFallback] = useState(false);
  useEffect(() => { if (!ref.current) return; try { const engine = new Roulette3D(config); engineRef.current = engine; return engine.mount(ref.current); } catch { setFallback(true); return undefined; } }, []);
  useEffect(() => { try { engineRef.current?.update(config); } catch { setFallback(true); } }, [config]);
  if (fallback) return <RoulettePreview segments={config.segments.map((segment) => ({ ...segment, label: config.prizes.find((p) => p.id === segment.prizeId)?.name ?? 'Sin premio', iconUrl: config.prizes.find((p) => p.id === segment.prizeId)?.iconUrl ?? null }))} backgroundColor={config.backgroundColor} />;
  return <div className="roulette-3d-preview" ref={ref} role="img" aria-label="Vista previa 3D de la ruleta"><span>Cargando preview 3D…</span></div>;
}
