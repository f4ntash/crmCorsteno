import { buildEffectiveRouletteOutcomes } from '@corsteno/types';
import type { RouletteEffectiveOutcome } from '@corsteno/types';

export type RouletteOutcome = RouletteEffectiveOutcome;
type RouletteSelectionConfig = { segments: readonly unknown[] };

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

export const buildRouletteOutcomes = buildEffectiveRouletteOutcomes;

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
