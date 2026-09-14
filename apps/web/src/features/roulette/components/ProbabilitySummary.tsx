import { calculateEffectiveRouletteProbabilities } from '@corsteno/types';
import type { RouletteConfig } from '../types';

type Inventory = { prizeId: string; stockMode: 'limited' | 'unlimited'; stockAvailable: number | null; deliveredCount: number };

export function ProbabilitySummary({ draft, inventory, valid }: { draft: RouletteConfig; inventory: Inventory[]; valid: boolean }) {
  if (!valid || draft.segments.length === 0 || draft.prizes.length === 0) return <section className="probability-summary"><h3>Probabilidad final</h3><p className="field-help">Completá premios y segmentos válidos para calcularla.</p></section>;
  const inventoryMap = new Map(inventory.map((item) => [item.prizeId, item]));
  const calculation = calculateEffectiveRouletteProbabilities(draft, inventoryMap);
  const effectiveIds = new Set(calculation.outcomes.filter((outcome) => outcome.prizeId !== null).map((outcome) => outcome.prizeId));
  const assignedIds = new Set(draft.segments.map((segment) => segment.prizeId).filter((id): id is string => id !== null));
  const excluded = draft.prizes.filter((prize) => assignedIds.has(prize.id) && !effectiveIds.has(prize.id)).map((prize) => {
    const current = inventoryMap.get(prize.id);
    const reason = prize.enabled === false ? 'deshabilitado' : (prize.weight ?? 1) <= 0 ? 'peso inválido' : current?.stockMode === 'limited' && (current.stockAvailable ?? 0) <= 0 ? 'agotado' : prize.stockMode === 'limited' && (prize.initialStock ?? prize.stockLimit ?? 0) <= 0 ? 'agotado' : 'sin resultado efectivo';
    return `${prize.name}: ${reason}`;
  });
  return <section className="probability-summary"><h3>Probabilidad final</h3><p className="field-help">Porcentaje real de cada resultado considerando los premios activos, sus pesos y el stock disponible.</p>{calculation.outcomes.length === 0 ? <p className="field-help">No hay resultados utilizables con la configuración actual.</p> : <div className="probability-list">{calculation.outcomes.map((outcome) => { const name = outcome.prizeId === null ? 'Sin premio' : draft.prizes.find((prize) => prize.id === outcome.prizeId)?.name ?? 'Premio'; return <div className="probability-row" key={outcome.prizeId ?? 'no-prize'}><div className="probability-label"><span>{name}</span><span>{outcome.probability.toFixed(1)}% <small>~{Math.round(outcome.frequencyPer100)} cada 100</small></span></div><div className="probability-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, Math.max(0, outcome.probability))}%` }} /></div></div>; })}</div>}{excluded.length > 0 && <p className="field-help">No participan: {excluded.join(' · ')}.</p>}</section>;
}
