import { describe, expect, it } from 'vitest';
import {
  buildNavigation,
  canAccessTreasureHuntRoute,
  isExperienceAssignedToWorkspace,
  isWorkspaceProductAssigned,
  navigationHasKey,
  productNavigation,
} from '../../web/src/app/navigation';

const allPermissions = ['crm.read', 'crm.manage', 'claims.redeem', 'analytics.read', 'activity.read', 'assets.read'];
function context(productTypes: string[], overrides: Partial<Parameters<typeof buildNavigation>[0]> = {}) {
  return {
    mode: 'workspace' as const,
    platformRole: 'user',
    permissions: allPermissions,
    workspace: true,
    productTypes: new Set(productTypes),
    ...overrides,
  };
}
function keys(productTypes: string[], overrides: Partial<Parameters<typeof buildNavigation>[0]> = {}) {
  return buildNavigation(context(productTypes, overrides)).map((item) => item.key);
}

describe('product-scoped navigation', () => {
  it('keeps global platform administration independent from customer products', () => {
    expect(buildNavigation(context(['roulette', 'website', 'ar', 'product-catalog'], { mode: 'admin', platformRole: 'corsteno_admin', workspace: false }))).toEqual([
      { key: 'summary', label: 'Inicio', to: '/app', adminOnly: true, requiredProduct: null, requiredPermission: null, allowedMode: ['admin'], capabilities: [] },
      { key: 'leads', label: 'Leads', to: '/app/leads', adminOnly: true, requiredProduct: null, requiredPermission: null, allowedMode: ['admin'], capabilities: [] },
      { key: 'commercial', label: 'Catálogo comercial', to: '/app/commercial', adminOnly: true, requiredProduct: null, requiredPermission: null, allowedMode: ['admin'], capabilities: [] },
      { key: 'subscriptions', label: 'Suscripciones', to: '/app/subscriptions', adminOnly: true, requiredProduct: null, requiredPermission: null, allowedMode: ['admin'], capabilities: [] },
    ]);
  });

  it('shows only Roulette modules in a Roulette workspace', () => {
    expect(keys(['roulette'])).toEqual(['summary', 'experiences', 'analytics', 'reports', 'redeem', 'treasure-hunt']);
    expect(keys(['roulette'])).not.toContain('channels');
    expect(keys(['roulette'])).not.toContain('products');
    expect(keys(['roulette'])).not.toContain('leads');
  });

  it('shows Web modules only in a Web workspace', () => {
    expect(keys(['website'])).toEqual(['summary', 'experiences', 'channels', 'analytics', 'treasure-hunt']);
    expect(keys(['website'])).not.toContain('redeem');
    expect(keys(['website'])).not.toContain('products');
    expect(keys(['website'])).not.toContain('leads');
  });

  it('registers AR without inventing Roulette or Web modules', () => {
    expect(keys(['ar'])).toEqual(['summary', 'experiences', 'analytics', 'treasure-hunt']);
    expect(keys(['ar'])).not.toContain('redeem');
    expect(keys(['ar'])).not.toContain('channels');
    expect(keys(['ar'])).not.toContain('leads');
  });

  it('keeps Product Catalog separate from Web', () => {
    expect(keys(['product-catalog'])).toEqual(['summary', 'experiences', 'products', 'channels', 'treasure-hunt']);
    expect(keys(['product-catalog'])).not.toContain('analytics');
    expect(keys(['product-catalog'])).not.toContain('leads');
  });

  it('unions combined Roulette and Web modules without duplicates or unrelated products', () => {
    const result = keys(['roulette', 'website']);
    expect(result).toEqual(['summary', 'experiences', 'analytics', 'reports', 'redeem', 'channels', 'treasure-hunt']);
    expect(result).toEqual([...new Set(result)]);
    expect(result).not.toContain('products');
    expect(result).not.toContain('leads');
  });

  it('keeps an empty workspace on Inicio only', () => {
    expect(keys([])).toEqual(['summary', 'treasure-hunt']);
    expect(keys([])).not.toContain('leads');
    expect(keys([])).not.toContain('experiences');
  });

  it('adds the read-only Treasure Hunt section for an authorized workspace', () => {
    expect(buildNavigation(context([])).find((item) => item.key === 'treasure-hunt')).toMatchObject({ to: '/app/treasure-hunt' });
    expect(keys([], { permissions: [] })).not.toContain('treasure-hunt');
    expect(keys([], { workspace: false })).not.toContain('treasure-hunt');
  });

  it('authorizes the Treasure Hunt route from workspace permission, not campaign loading state', () => {
    expect(canAccessTreasureHuntRoute({ workspace: true, permissions: ['crm.read'] })).toBe(true);
    expect(canAccessTreasureHuntRoute({ workspace: true, permissions: [] })).toBe(false);
    expect(canAccessTreasureHuntRoute({ workspace: false, permissions: ['crm.read'] })).toBe(false);
  });

  it('recomputes navigation when the organization changes product type', () => {
    expect(keys(['roulette'])).toContain('redeem');
    expect(keys(['roulette'])).not.toContain('products');
    expect(keys(['website'])).toContain('channels');
    expect(keys(['website'])).not.toContain('redeem');
  });

  it('protects deep links with the organization experience list', () => {
    const experiences = [{ id: 'roulette-1', type: 'roulette' }, { id: 'catalog-1', type: 'product-catalog' }];
    expect(isExperienceAssignedToWorkspace(experiences, 'roulette-1')).toBe(true);
    expect(isExperienceAssignedToWorkspace(experiences, 'missing-catalog')).toBe(false);
    expect(isExperienceAssignedToWorkspace([{ id: 'unknown-1', type: 'map' }], 'unknown-1')).toBe(false);
  });

  it('gates every product navigation item by a declared capability and permission', () => {
    for (const items of Object.values(productNavigation)) {
      for (const item of items) {
        expect(item.adminOnly).toBe(false);
        expect(item.requiredProduct).toBe(item.capability);
        expect(item.requiredPermission).toBeTruthy();
        expect(item.allowedMode).toEqual(['workspace']);
      }
    }
    expect(buildNavigation(context(['roulette']))[0]).toMatchObject({ adminOnly: false, requiredProduct: null, requiredPermission: null, allowedMode: ['workspace'] });
    expect(keys(['roulette', 'product-catalog'], { permissions: ['crm.read'] })).toEqual(['summary', 'experiences', 'products', 'channels', 'treasure-hunt']);
    expect(keys(['roulette', 'product-catalog'], { permissions: ['claims.redeem'] })).toEqual(['summary', 'redeem']);
  });

  it('does not expose customer navigation to a normal client in admin mode', () => {
    expect(keys(['roulette'], { mode: 'admin', platformRole: 'user', workspace: false })).toEqual([]);
  });

  it('keeps product and experience assignment helpers canonical', () => {
    expect(isWorkspaceProductAssigned(new Set(['website']), 'website')).toBe(true);
    expect(isWorkspaceProductAssigned(new Set(['website']), 'product-catalog')).toBe(false);
    expect(isWorkspaceProductAssigned(new Set(['ar']), 'map')).toBe(false);
    expect(navigationHasKey(buildNavigation(context(['ar'])), 'experiences')).toBe(true);
  });
});
