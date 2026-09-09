export type RouletteOutcome = { prizeId: string | null; weight: number; segmentIndices: readonly number[] };
type RouletteSelectionConfig = { segments: readonly unknown[] };
type PrizeRule = { id: string; enabled?: boolean; weight?: number; stockMode?: 'limited' | 'unlimited'; initialStock?: number; stockLimit?: number | null };
type SegmentRule = { prizeId: string | null; weight?: number };
type InventoryRule = { stockMode: 'limited' | 'unlimited'; stockAvailable: number | null; deliveredCount: number };

const UINT32_RANGE = 0x1_0000_0000;

export function selectRouletteSegment(config: RouletteSelectionConfig, randomValue: number) {
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1 || config.segments.length === 0) throw new Error('invalid roulette selection input');
  return Math.min(config.segments.length - 1, Math.floor(randomValue * config.segments.length));
}

export function selectRouletteOutcome(outcomes: readonly RouletteOutcome[], randomValue: number) {
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1 || outcomes.length === 0) throw new Error('invalid roulette selection input');
  const totalWeight = outcomes.reduce((total, outcome) => total + outcome.weight, 0);
  if (!(totalWeight > 0)) throw new Error('roulette outcomes have no weight');
  let cursor = randomValue * totalWeight;
  for (const outcome of outcomes) {
    cursor -= outcome.weight;
    if (cursor < 0) return outcome;
  }
  return outcomes[outcomes.length - 1]!;
}

export function selectLocalAcceptanceOutcome(outcomes: readonly RouletteOutcome[], randomValue: number, environment: string, forcedPrizeId?: string) {
  if (environment === 'development' && forcedPrizeId) return outcomes.find((outcome) => outcome.prizeId === forcedPrizeId) ?? selectRouletteOutcome(outcomes, randomValue);
  return selectRouletteOutcome(outcomes, randomValue);
}

export function buildRouletteOutcomes(config: { prizes: readonly PrizeRule[]; segments: readonly SegmentRule[] }, inventory: ReadonlyMap<string, InventoryRule>) {
  const groups = new Map<string, number[]>();
  for (let index = 0; index < config.segments.length; index += 1) {
    const key = config.segments[index]!.prizeId ?? '__no_prize__';
    const group = groups.get(key);
    if (group) group.push(index);
    else groups.set(key, [index]);
  }
  const outcomes: RouletteOutcome[] = [];
  for (const prize of config.prizes) {
    const segmentIndices = groups.get(prize.id);
    if (!segmentIndices || prize.enabled === false || (prize.weight ?? 1) <= 0) continue;
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

export function selectOutcomeSegment(outcome: RouletteOutcome, randomValue: number) {
  if (!outcome.segmentIndices.length) throw new Error('roulette outcome has no segments');
  return outcome.segmentIndices[Math.min(outcome.segmentIndices.length - 1, Math.floor(randomValue * outcome.segmentIndices.length))]!;
}

export function secureRandomValue() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0]! / UINT32_RANGE;
}

export function secureRandomIndex(length: number) {
  if (!Number.isInteger(length) || length < 1) throw new Error('invalid roulette segment count');
  const limit = Math.floor(UINT32_RANGE / length) * length;
  const bytes = new Uint32Array(1);
  let value = UINT32_RANGE;
  while (value >= limit) {
    crypto.getRandomValues(bytes);
    value = bytes[0]!;
  }
  return value % length;
}
