export type RouletteProbabilityPrize = { id: string; name?: string; enabled?: boolean; weight?: number; stockMode?: 'limited' | 'unlimited'; initialStock?: number; stockLimit?: number | null };
export type RouletteProbabilitySegment = { id?: string; prizeId: string | null; weight?: number };
export type RouletteProbabilityInventory = { stockMode: 'limited' | 'unlimited'; stockAvailable: number | null; deliveredCount: number };
export type RouletteEffectiveOutcome = { prizeId: string | null; weight: number; segmentIndices: readonly number[] };
export type RouletteProbabilityItem = RouletteEffectiveOutcome & { probability: number; frequencyPer100: number };
export type RouletteProbabilityExclusion = { prizeId: string; reason: 'unassigned' | 'disabled' | 'invalid_weight' | 'sold_out' };

export function buildEffectiveRouletteOutcomes(config: { prizes: readonly RouletteProbabilityPrize[]; segments: readonly RouletteProbabilitySegment[] }, inventory: ReadonlyMap<string, RouletteProbabilityInventory>) {
  const groups = new Map<string, number[]>();
  for (let index = 0; index < config.segments.length; index += 1) {
    const key = config.segments[index]!.prizeId ?? '__no_prize__';
    groups.set(key, [...(groups.get(key) ?? []), index]);
  }
  const outcomes: RouletteEffectiveOutcome[] = [];
  for (const prize of config.prizes) {
    const segmentIndices = groups.get(prize.id);
    if (!segmentIndices) continue;
    if (prize.enabled === false || (prize.weight ?? 1) <= 0) continue;
    const stock = inventory.get(prize.id);
    const legacyLimited = prize.stockMode === undefined && prize.stockLimit !== undefined && prize.stockLimit !== null;
    const stockMode = stock?.stockMode ?? prize.stockMode ?? (legacyLimited ? 'limited' : 'unlimited');
    const stockAvailable = stock?.stockAvailable ?? (stockMode === 'limited' ? prize.initialStock ?? prize.stockLimit ?? 0 : null);
    if (stockMode === 'limited' && (stockAvailable ?? 0) <= 0) continue;
    outcomes.push({ prizeId: prize.id, weight: prize.weight ?? 1, segmentIndices });
  }
  const noPrizeSegments = groups.get('__no_prize__');
  if (noPrizeSegments) outcomes.push({ prizeId: null, weight: 1, segmentIndices: noPrizeSegments });
  return outcomes;
}

export function calculateEffectiveRouletteProbabilities(config: { prizes: readonly RouletteProbabilityPrize[]; segments: readonly RouletteProbabilitySegment[] }, inventory: ReadonlyMap<string, RouletteProbabilityInventory>) {
  const outcomes = buildEffectiveRouletteOutcomes(config, inventory);
  const totalWeight = outcomes.reduce((total, outcome) => total + outcome.weight, 0);
  return {
    totalWeight,
    outcomes: totalWeight > 0 ? outcomes.map((outcome) => ({ ...outcome, probability: outcome.weight / totalWeight * 100, frequencyPer100: outcome.weight / totalWeight * 100 })) : [],
  };
}
