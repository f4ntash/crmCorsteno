import { describe, expect, it } from 'vitest';
import { ROOM_SURFACES, surfaceAreaM2 } from './surfaces';
import { calculatePhysicalTextureRepeat, normalizeRotationRadians } from './textureScale';

describe('physical surface math', () => {
  it('repeats by measured surface and tile dimensions', () => {
    expect(calculatePhysicalTextureRepeat(5, 2.9, 0.6, 1.2)).toEqual({ x: 5 / 0.6, y: 2.9 / 1.2 });
    expect(calculatePhysicalTextureRepeat(5, 5, 0.6, 1.2)).toEqual({ x: 5 / 0.6, y: 5 / 1.2 });
  });

  it('rejects invalid or zero physical dimensions', () => {
    expect(calculatePhysicalTextureRepeat(5, 2.9, 0, 1.2)).toBeNull();
    expect(calculatePhysicalTextureRepeat(Number.NaN, 2.9, 0.6, 1.2)).toBeNull();
  });

  it('normalizes tile orientation into radians', () => {
    expect(normalizeRotationRadians(90)).toBeCloseTo(Math.PI / 2);
    expect(normalizeRotationRadians(-90)).toBeCloseTo(Math.PI * 1.5);
    expect(normalizeRotationRadians(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('calculates wall and floor area from their physical dimensions', () => {
    expect(ROOM_SURFACES.map((surface) => surfaceAreaM2(surface))).toEqual([25, 14.5, 14.5, 14.5]);
  });
});
