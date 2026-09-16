import { describe, expect, it } from 'vitest';
import { assignProductToSurface, resetSurfaceAssignments } from './assignments';

describe('surface assignments', () => {
  it('assigns each product independently to a stable surface id', () => {
    const initial = resetSurfaceAssignments();
    const withWall = assignProductToSurface(initial, 'wall-back', 'product-oak');
    const complete = assignProductToSurface(withWall, 'floor', 'product-cement');
    expect(complete).toEqual({ 'wall-back': 'product-oak', floor: 'product-cement' });
    expect(initial).toEqual({});
  });

  it('replaces one surface without changing other assignments and resets to neutral', () => {
    const before = { floor: 'product-cement', 'wall-back': 'product-oak' } as const;
    expect(assignProductToSurface(before, 'wall-back', 'product-marble')).toEqual({ floor: 'product-cement', 'wall-back': 'product-marble' });
    expect(resetSurfaceAssignments()).toEqual({});
  });
});
