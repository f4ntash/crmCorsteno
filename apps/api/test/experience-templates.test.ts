import { describe, expect, it } from 'vitest';
import { validateProductCatalogDraft } from '../src/services/product-catalog';
import { createExperienceTemplateDraft, experienceTemplates, listExperienceTemplates, resolveExperienceTemplate } from '../src/services/experience-templates';
import { validDraftConfig } from '../src/services/roulette-config';

describe('experience template registry', () => {
  it('keeps a small product-aware registry with public metadata only', () => {
    expect(listExperienceTemplates()).toEqual([
      expect.objectContaining({ id: 'roulette-event', type: 'roulette', name: 'Ruleta de premios para evento' }),
      expect.objectContaining({ id: 'roulette-local-promo', type: 'roulette', name: 'Ruleta promocional para local' }),
      expect.objectContaining({ id: 'roulette-brand-activation', type: 'roulette', name: 'Sorteo / activación de marca' }),
      expect.objectContaining({ id: 'catalog-commercial', type: 'product-catalog', name: 'Catálogo comercial' }),
    ]);
    expect(listExperienceTemplates('roulette')).toHaveLength(3);
    expect(listExperienceTemplates('product-catalog')).toHaveLength(1);
    expect(listExperienceTemplates()).not.toEqual(expect.arrayContaining([expect.objectContaining({ config: expect.anything() })]));
  });

  it('generates valid initial drafts for every registered template', () => {
    for (const template of experienceTemplates) {
      const config = createExperienceTemplateDraft(template);
      expect(template.type === 'roulette' ? validDraftConfig(config) : validateProductCatalogDraft(config)).toBe(true);
    }
  });

  it('resolves by both product type and stable id', () => {
    const roulette = resolveExperienceTemplate('roulette', 'roulette-event');
    expect(roulette?.type).toBe('roulette');
    expect(resolveExperienceTemplate('product-catalog', 'roulette-event')).toBeNull();
    expect(resolveExperienceTemplate('roulette', 'missing')).toBeNull();
  });

  it('keeps the existing onboarding segment-count option server-side', () => {
    const template = resolveExperienceTemplate('roulette', 'roulette-local-promo');
    expect(template).not.toBeNull();
    const config = createExperienceTemplateDraft(template!, 10) as { segments: unknown[] };
    expect(config.segments).toHaveLength(10);
  });
});
