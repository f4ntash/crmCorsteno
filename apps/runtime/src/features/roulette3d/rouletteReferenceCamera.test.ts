import { describe, expect, it } from 'vitest';
import { rouletteReferenceCameraDistance, rouletteReferenceCameraFitDistance } from './rouletteReferenceCamera';

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
  ])('compensates for the narrower mobile canvas to restore the previous scale for $viewport', ({ canvasWidth, canvasHeight }) => {
    const boundsRadius = 8.515;
    const fittedDistance = rouletteReferenceCameraFitDistance(canvasWidth, canvasHeight, boundsRadius, 30);

    expect(fittedDistance).toBeGreaterThan(48);
    expect(rouletteReferenceCameraDistance(canvasWidth, canvasHeight, boundsRadius, 30)).toBe(54);
  });

  it('keeps the responsive fit for tablet canvases wider than mobile', () => {
    const tablet = rouletteReferenceCameraFitDistance(740, 840, 8.515, 30);
    expect(rouletteReferenceCameraDistance(740, 840, 8.515, 30)).toBeCloseTo(tablet);
  });
});
