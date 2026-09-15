import { describe, expect, it } from 'vitest';
import { rouletteRotationToPlaceSegmentAtPointer, rouletteSegmentCenterAngle, rouletteSegmentGeometryStartAngle } from '@corsteno/roulette-3d';

const TAU = Math.PI * 2;
const mod = (value: number) => ((value % TAU) + TAU) % TAU;

describe('roulette segment alignment', () => {
  it.each([6, 8, 10])('places first, middle, and last segments under the top pointer with %i wedges', (count) => {
    for (const index of [...new Set([0, Math.floor(count / 2), count - 1])]) {
      const step = TAU / count;
      const geometryCenter = rouletteSegmentGeometryStartAngle(index, count) + step / 2 - Math.PI / 2;
      expect(mod(geometryCenter - rouletteSegmentCenterAngle(index, count))).toBeCloseTo(0, 10);
      for (const currentRotation of [0, 5 * TAU + 0.37, 14 * TAU + step * 0.9]) {
        const alignedRotation = rouletteRotationToPlaceSegmentAtPointer(index, count, currentRotation) + 5 * TAU;
        expect(mod(geometryCenter + alignedRotation)).toBeCloseTo(Math.PI / 2, 10);
        expect(alignedRotation).toBeGreaterThan(currentRotation);
      }
    }
  });
});
