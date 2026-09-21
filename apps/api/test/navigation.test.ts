import { describe, expect, it } from 'vitest';
import {
  buildNavigation,
  activeWorkspaceApplications,
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
    expect(keys(['roulette'])).toEqual(['summary', 'experiences', 'analytics', 'reports', 'redeem']);
    expect(keys(['roulette'])).not.toContain('channels');
    expect(keys(['roulette'])).not.toContain('products');
    expect(keys(['roulette'])).not.toContain('leads');
  });

  it('shows Web modules only in a Web workspace', () => {
    expect(keys(['website'])).toEqual(['summary', 'experiences', 'channels', 'analytics']);
    expect(keys(['website'])).not.toContain('redeem');
    expect(keys(['website'])).not.toContain('products');
    expect(keys(['website'])).not.toContain('leads');
  });

  it('registers AR without inventing Roulette or Web modules', () => {
    expect(keys(['ar'])).toEqual(['summary', 'experiences', 'analytics']);
    expect(keys(['ar'])).not.toContain('redeem');
    expect(keys(['ar'])).not.toContain('channels');
    expect(keys(['ar'])).not.toContain('leads');
  });

  it('keeps Product Catalog separate from Web', () => {
    expect(keys(['product-catalog'])).toEqual(['summary', 'experiences', 'products', 'channels']);
    expect(keys(['product-catalog'])).not.toContain('analytics');
    expect(keys(['product-catalog'])).not.toContain('leads');
  });

  it('unions combined Roulette and Web modules without duplicates or unrelated products', () => {
    const result = keys(['roulette', 'website']);
    expect(result).toEqual(['summary', 'experiences', 'analytics', 'reports', 'redeem', 'channels']);
    expect(result).toEqual([...new Set(result)]);
    expect(result).not.toContain('products');
    expect(result).not.toContain('leads');
  });

  it('keeps an empty workspace on Inicio only', () => {
    expect(keys([])).toEqual(['summary']);
    expect(keys([])).not.toContain('leads');
    expect(keys([])).not.toContain('experiences');
  });

  it('adds the read-only Treasure Hunt section only when its capability is available', () => {
    expect(buildNavigation(context([], { treasureHuntAvailable: true })).find((item) => item.key === 'treasure-hunt')).toMatchObject({ to: '/app/treasure-hunt' });
    expect(keys([])).not.toContain('treasure-hunt');
    expect(keys([], { permissions: [], treasureHuntAvailable: true })).not.toContain('treasure-hunt');
    expect(keys([], { workspace: false, treasureHuntAvailable: true })).not.toContain('treasure-hunt');
  });

  it('authorizes the Treasure Hunt route from permission and capability', () => {
    expect(canAccessTreasureHuntRoute({ workspace: true, permissions: ['crm.read'], treasureHuntAvailable: true })).toBe(true);
    expect(canAccessTreasureHuntRoute({ workspace: true, permissions: ['crm.read'], treasureHuntAvailable: false })).toBe(false);
    expect(canAccessTreasureHuntRoute({ workspace: true, permissions: [], treasureHuntAvailable: true })).toBe(false);
    expect(canAccessTreasureHuntRoute({ workspace: false, permissions: ['crm.read'], treasureHuntAvailable: true })).toBe(false);
  });

  it('shows generic Analytics for an active application without exposing product modules', () => {
    const applications = activeWorkspaceApplications([{ id: 'app-la-estacion', name: 'TUS ESTACIONES', status: 'active', applicationType: 'generic' }]);
    expect(keys(['ar'], {
      permissions: ['analytics.read', 'crm.read'],
      activeApplications: applications,
      applicationTypes: new Set(applications.map((application) => application.applicationType ?? 'generic')),
    })).toEqual(['summary', 'analytics']);
  });

  it('does not show generic Analytics without an active application', () => {
    expect(keys([], { permissions: ['analytics.read'], activeApplications: [] })).not.toContain('analytics');
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
    expect(keys(['roulette', 'product-catalog'], { permissions: ['crm.read'] })).toEqual(['summary', 'experiences', 'products', 'channels']);
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
