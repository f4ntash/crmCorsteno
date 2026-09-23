import { describe, expect, it } from 'vitest';
import { rouletteReferenceRotationToPlaceSegmentAtPointer, rouletteReferenceSegmentAtPointer } from './rouletteReferenceAngles';
import { advanceRouletteReferenceSpin } from './rouletteReferenceSpin';

const TAU = Math.PI * 2;

describe('roulette reference pointer alignment', () => {
  it.each([
    [6, [0, 1, 3, 5]],
    [8, [0, 4, 7]],
    [10, [0, 5, 9]],
  ])('aligns the requested indices for %i segments', (segmentCount, indices) => {
    const step = TAU / segmentCount;

    for (const index of indices) {
      for (const currentRotation of [0, 5 * TAU + 0.37, 14 * TAU + step * 0.9, -step * 0.4]) {
        const targetRotation = rouletteReferenceRotationToPlaceSegmentAtPointer(index, segmentCount, currentRotation);
        if (targetRotation === null) throw new Error('expected a valid target rotation');
        expect(targetRotation).toBeGreaterThan(currentRotation);
        expect(rouletteReferenceSegmentAtPointer(targetRotation, segmentCount)).toBe(index);
      }
    }
  });

  it('keeps consecutive authoritative spins aligned without resetting rotation', () => {
    let rotation = 0.37;
    for (const index of [0, 5, 1, 9, 3]) {
      const targetRotation = rouletteReferenceRotationToPlaceSegmentAtPointer(index, 10, rotation);
      if (targetRotation === null) throw new Error('expected a valid target rotation');
      expect(targetRotation).toBeGreaterThan(rotation);
      expect(rouletteReferenceSegmentAtPointer(targetRotation, 10)).toBe(index);
      rotation = targetRotation;
    }
  });

  it.each([
    [6, [0, 3, 5]],
    [8, [0, 4, 7]],
    [10, [0, 5, 9]],
  ])('animates consecutive targets for %i segments', (segmentCount, indices) => {
    let rotation = 0.37;

    for (const index of indices) {
      const targetRotation = rouletteReferenceRotationToPlaceSegmentAtPointer(index, segmentCount, rotation);
      if (targetRotation === null) throw new Error('expected a valid target rotation');
      const spin = { startRotation: rotation, targetRotation, elapsed: 0, duration: 5_000 };
      let frame = advanceRouletteReferenceSpin(spin, 1 / 60);
      let frameCount = 1;

      expect(frame.rotation).not.toBe(rotation);
      while (!frame.done && frameCount < 600) {
        spin.elapsed = frame.elapsed;
        frame = advanceRouletteReferenceSpin(spin, 1 / 60);
        frameCount += 1;
      }

      expect(frame.done).toBe(true);
      expect(frame.rotation).toBeCloseTo(targetRotation, 10);
      expect(rouletteReferenceSegmentAtPointer(frame.rotation, segmentCount)).toBe(index);
      rotation = frame.rotation;
    }
  });

  it.each([-1, 6, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid target index %s', (index) => {
    expect(rouletteReferenceRotationToPlaceSegmentAtPointer(index, 6)).toBeNull();
  });
});
