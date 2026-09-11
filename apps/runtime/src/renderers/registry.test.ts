import { describe, expect, it, vi } from 'vitest';
import type { RuntimeExperienceRenderInput, RuntimeRenderer } from './registry';
import { resolveRuntimeRenderer, runtimeRendererRegistry } from './registry';

const input: RuntimeExperienceRenderInput = {
  type: 'test-event',
  config: { label: 'demo' },
  slug: 'demo',
  entitlements: { features: [], maxActiveExperiences: 0 },
};

describe('runtime experience renderer registry', () => {
  it('resolves the existing Roulette renderer', () => {
    expect(resolveRuntimeRenderer('roulette')).toBe(runtimeRendererRegistry.get('roulette'));
  });

  it('returns no renderer for unsupported public types', () => {
    expect(resolveRuntimeRenderer('unsupported')).toBeNull();
    expect(resolveRuntimeRenderer(null)).toBeNull();
  });

  it('supports a test-only renderer without mounting Roulette', () => {
    const render = vi.fn(() => null);
    const testRenderer: RuntimeRenderer = { type: 'test-event', render };
    const registry = new Map(runtimeRendererRegistry).set(testRenderer.type, testRenderer);
    const resolved = resolveRuntimeRenderer('test-event', registry);
    expect(resolved).toBe(testRenderer);
    resolved?.render(input);
    expect(render).toHaveBeenCalledWith(input);
  });
});
