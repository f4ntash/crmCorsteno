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
});
