import { describe, expect, it } from 'vitest';
import { rouletteReferenceCameraFitDistance } from './rouletteReferenceCamera';

describe('responsive roulette camera fit', () => {
  it('backs the camera away for narrow portrait canvases', () => {
    const portrait = rouletteReferenceCameraFitDistance(390, 680, 9, 30);
    const tablet = rouletteReferenceCameraFitDistance(768, 840, 9, 30);
    expect(portrait).toBeGreaterThan(tablet);
    expect(portrait).toBeGreaterThan(48);
  });

  it('keeps the same fit distance for square and landscape canvases', () => {
    const square = rouletteReferenceCameraFitDistance(430, 430, 9, 30);
    const landscape = rouletteReferenceCameraFitDistance(1280, 720, 9, 30);
    expect(square).toBeCloseTo(landscape);
  });

  it.each([
    { viewport: '390x844', canvasWidth: 347, canvasHeight: 726 },
    { viewport: '430x932', canvasWidth: 387, canvasHeight: 802 },
    { viewport: '768x1024', canvasWidth: 740, canvasHeight: 840 },
  ])('fits the complete Ruleta Demo wheel in its measured $viewport canvas', ({ canvasWidth, canvasHeight }) => {
    const wheelBoundsRadius = 8.515;
    const verticalHalfFov = Math.PI / 12;
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * (canvasWidth / canvasHeight));
    const limitingHalfFov = Math.min(verticalHalfFov, horizontalHalfFov);
    const fitDistance = rouletteReferenceCameraFitDistance(canvasWidth, canvasHeight, wheelBoundsRadius, 30);

    expect(Math.asin(wheelBoundsRadius / fitDistance)).toBeLessThan(limitingHalfFov);
    expect(fitDistance).toBeLessThan(100);
  });
});
