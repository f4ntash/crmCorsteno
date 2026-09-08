import { describe, expect, it } from 'vitest';
import { buildRouletteOutcomes, secureRandomIndex, selectRouletteOutcome, selectRouletteSegment } from '../src/services/roulette-selector';

describe('roulette selector', () => {
  it.each([6, 8, 10])('maps injected random values uniformly for %i segments', (count) => {
    const config = { segments: Array.from({ length: count }) };
    expect(selectRouletteSegment(config, 0)).toBe(0);
    expect(selectRouletteSegment(config, 0.999999)).toBe(count - 1);
    expect(selectRouletteSegment(config, (count - 1) / count + 0.000001)).toBe(count - 1);
  });

  it('returns a secure index in range', () => {
    for (const count of [6, 8, 10]) {
      const result = secureRandomIndex(count);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThan(count);
    }
  });

  it('weights prizes without duplicating probability for repeated segments', () => {
    const outcomes = buildRouletteOutcomes({ prizes: [{ id: 'a', weight: 3 }, { id: 'b', weight: 1 }], segments: [{ prizeId: 'a' }, { prizeId: 'a' }, { prizeId: 'b' }] }, new Map());
    expect(outcomes).toEqual([{ prizeId: 'a', weight: 3, segmentIndices: [0, 1] }, { prizeId: 'b', weight: 1, segmentIndices: [2] }]);
    expect(selectRouletteOutcome(outcomes, 0.74).prizeId).toBe('a');
    expect(selectRouletteOutcome(outcomes, 0.75).prizeId).toBe('b');
  });

  it('keeps no-prize segments as one weighted outcome', () => {
    const outcomes = buildRouletteOutcomes({ prizes: [{ id: 'a' }], segments: [{ prizeId: null }, { prizeId: null }, { prizeId: 'a' }] }, new Map());
    expect(outcomes).toEqual([{ prizeId: 'a', weight: 1, segmentIndices: [2] }, { prizeId: null, weight: 1, segmentIndices: [0, 1] }]);
  });
});
