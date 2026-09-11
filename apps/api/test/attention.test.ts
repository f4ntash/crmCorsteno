/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import app from '../src';
import { buildAttentionItems, type AttentionProviderContext } from '../src/services/attention';
import { hasPermission } from '../src/auth/permissions';

const validConfig = JSON.stringify({ schemaVersion: 1, backgroundColor: '#111111', prizes: [{ id: 'p1', name: 'Premio', enabled: true, weight: 1, stockMode: 'unlimited' }], segments: Array.from({ length: 6 }, (_, index) => ({ id: `s${index}`, color: '#D6B25E', prizeId: 'p1' })) });

function context(overrides: Partial<AttentionProviderContext> = {}): AttentionProviderContext {
  return {
    organizationId: 'org-a',
    experiences: [],
    readinessByExperience: new Map(),
    rouletteOperationsByExperience: new Map(),
    ...overrides,
  };
}

describe('organization attention providers', () => {
  it('creates one actionable item for a draft with a readiness problem', () => {
    const items = buildAttentionItems(context({ experiences: [{ id: 'draft', name: 'Borrador', type: 'roulette', status: 'draft', effectiveStatus: 'draft', accessStatus: 'legacy_unrestricted', startsAt: null, endsAt: null, updatedAt: '2026-01-01' }], readinessByExperience: new Map([['draft', [{ code: 'CONFIG_MISSING', message: 'Falta configurar la ruleta.' }]]]) }));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: 'experience.publish_blocked', severity: 'warning', actionHref: '/app/experiences/draft#configuration' });
  });

  it('covers lifecycle states and does not warn on a healthy active experience', () => {
    const items = buildAttentionItems(context({ experiences: [
      { id: 'scheduled', name: 'Próxima', type: 'game', status: 'published', effectiveStatus: 'scheduled', accessStatus: 'legacy_unrestricted', startsAt: '2026-12-01', endsAt: null },
      { id: 'expired', name: 'Terminada', type: 'game', status: 'published', effectiveStatus: 'expired', accessStatus: 'legacy_unrestricted', startsAt: null, endsAt: '2026-01-01' },
      { id: 'healthy', name: 'Activa', type: 'game', status: 'published', effectiveStatus: 'active', accessStatus: 'legacy_unrestricted', startsAt: null, endsAt: null },
    ] }));
    expect(items.map((item) => item.type)).toEqual(['experience.expired', 'experience.scheduled']);
  });

  it('adds Roulette operational items once and keeps them separate by issue', () => {
    const items = buildAttentionItems(context({ experiences: [{ id: 'roulette', name: 'Ruleta', type: 'roulette', status: 'published', effectiveStatus: 'active', accessStatus: 'legacy_unrestricted', startsAt: null, endsAt: null }], rouletteOperationsByExperience: new Map([['roulette', { soldOutLimitedPrizes: 1, pendingClaims: 3 }]]) }));
    expect(items.map((item) => item.type).sort()).toEqual(['roulette.inventory_sold_out', 'roulette.pending_redemptions']);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  });

  it('accepts a future generic provider without importing Roulette code', () => {
    const futureProvider = (value: AttentionProviderContext) => value.experiences.map((experience) => ({ id: `catalog:${experience.id}:out-of-stock`, organizationId: value.organizationId, type: 'catalog.product_out_of_stock', severity: 'warning' as const, title: 'Producto agotado', resourceType: 'catalog_product', resourceId: experience.id }));
    const items = buildAttentionItems(context({ experiences: [{ id: 'product-1', name: 'Producto', type: 'catalog', status: 'published', effectiveStatus: 'active', startsAt: null, endsAt: null }] }), [futureProvider]);
    expect(items).toEqual([expect.objectContaining({ type: 'catalog.product_out_of_stock', resourceType: 'catalog_product' })]);
  });
});

type Experience = { id: string; name: string; type: string; status: 'draft' | 'published' | 'paused'; draftConfig: string | null; publishedConfig: string | null; startsAt: string | null; endsAt: string | null; updatedAt: string };
type Inventory = { experienceId: string; prizeId: string; stockMode: 'limited' | 'unlimited'; stockAvailable: number | null };
type Claim = { experienceId: string; status: 'active' | 'redeemed' };

function fixture(options: { role?: string; platformRole?: string; experiences?: Experience[]; inventory?: Inventory[]; claims?: Claim[] } = {}) {
  const experiences = options.experiences ?? [{ id: 'healthy', name: 'Activa', type: 'roulette', status: 'published', draftConfig: validConfig, publishedConfig: validConfig, startsAt: null, endsAt: null, updatedAt: '2026-01-01' }];
  const inventory = options.inventory ?? [];
  const claims = options.claims ?? [];
  const DB: any = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes('auth_sessions')) return { session_id: 'session', id: 'actor', email: 'actor@test.local', name: 'Actor', platformRole: options.platformRole ?? 'user', expires_at: Date.now() + 60000 } as T;
              if (sql.includes('SELECT id,name,slug,? role FROM organizations')) return { id: 'org-a', name: 'Org A', slug: 'org-a', role: 'global_admin' } as T;
              if (sql.includes('JOIN memberships m ON')) return args[0] === 'org-a' ? { id: 'org-a', name: 'Org A', slug: 'org-a', role: options.role ?? 'member' } as T : null;
              return null;
            },
            async all<T>() {
              if (sql.includes('experience_access_periods')) return { results: [] } as { results: T[] };
              if (sql.includes('experience_prize_inventory')) return { results: inventory } as { results: T[] };
              if (sql.includes('roulette_prize_claims')) {
                const results = experiences.filter((experience) => experience.type === 'roulette').flatMap((experience) => {
                  const pendingClaims = claims.filter((claim) => claim.experienceId === experience.id && claim.status === 'active').length;
                  return pendingClaims ? [{ experienceId: experience.id, pendingClaims }] : [];
                });
                return { results } as { results: T[] };
              }
              if (sql.includes('FROM experiences')) return { results: experiences.map((experience) => ({ ...experience })) } as { results: T[] };
              return { results: [] } as { results: T[] };
            },
            async run() { return { success: true, meta: { changes: 1 } }; },
          };
        },
      };
    },
  };
  return { DB, ENVIRONMENT: 'test', APP_VERSION: 'test' };
}

function request(path: string, env: any, init: RequestInit = {}) {
  return app.fetch(new Request(`http://localhost${path}`, { ...init, headers: { Cookie: 'corsteno_session=x', 'X-Organization-Id': 'org-a', ...(init.headers ?? {}) } }), env);
}

describe('GET /attention', () => {
  it('returns bounded deterministic organization-scoped operational items', async () => {
    const experiences: Experience[] = Array.from({ length: 25 }, (_, index) => ({ id: `draft-${String(index).padStart(2, '0')}`, name: `Draft ${index}`, type: 'game', status: 'draft', draftConfig: '{}', publishedConfig: null, startsAt: null, endsAt: null, updatedAt: '2026-01-01' }));
    const response = await request('/attention?limit=100', fixture({ experiences }));
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.items).toHaveLength(25);
    expect(body.total).toBe(25);
    expect(body.limit).toBe(50);
    expect(body.items.map((item: any) => item.id)).toEqual([...body.items].sort((a: any, b: any) => a.id.localeCompare(b.id)).map((item: any) => item.id));
  });

  it('includes readiness, lifecycle, sold-out, and pending-claim states without false healthy warnings', async () => {
    const experiences: Experience[] = [
      { id: 'draft', name: 'Borrador', type: 'roulette', status: 'draft', draftConfig: '{"segments":[]}', publishedConfig: null, startsAt: null, endsAt: null, updatedAt: '2026-01-01' },
      { id: 'scheduled', name: 'Próxima', type: 'game', status: 'published', draftConfig: '{}', publishedConfig: '{}', startsAt: '2099-01-01', endsAt: null, updatedAt: '2026-01-01' },
      { id: 'expired', name: 'Terminada', type: 'game', status: 'published', draftConfig: '{}', publishedConfig: '{}', startsAt: null, endsAt: '2020-01-01', updatedAt: '2026-01-01' },
      { id: 'roulette', name: 'Ruleta', type: 'roulette', status: 'published', draftConfig: validConfig, publishedConfig: validConfig, startsAt: null, endsAt: null, updatedAt: '2026-01-01' },
      { id: 'healthy', name: 'Sana', type: 'game', status: 'published', draftConfig: '{}', publishedConfig: '{}', startsAt: null, endsAt: null, updatedAt: '2026-01-01' },
    ];
    const response = await request('/attention', fixture({ experiences, inventory: [{ experienceId: 'roulette', prizeId: 'p1', stockMode: 'limited', stockAvailable: 0 }], claims: [{ experienceId: 'roulette', status: 'active' }, { experienceId: 'roulette', status: 'active' }, { experienceId: 'roulette', status: 'redeemed' }] }));
    const body = await response.json() as any;
    expect(body.items.map((item: any) => item.type)).toEqual(expect.arrayContaining(['experience.publish_blocked', 'experience.scheduled', 'experience.expired', 'roulette.inventory_sold_out', 'roulette.pending_redemptions']));
    expect(body.items.some((item: any) => item.resourceId === 'healthy')).toBe(false);
    expect(body.items.filter((item: any) => item.resourceId === 'roulette' && item.type === 'roulette.pending_redemptions')).toHaveLength(1);
  });

  it('rejects viewer/operator/foreign contexts and preserves platform-admin access', async () => {
    expect((await request('/attention', fixture({ role: 'viewer' }))).status).toBe(403);
    expect((await request('/attention', fixture({ role: 'operator' }))).status).toBe(403);
    expect((await request('/attention', fixture(), { headers: { 'X-Organization-Id': 'org-b' } })).status).toBe(403);
    expect((await request('/attention', fixture({ platformRole: 'corsteno_admin' }))).status).toBe(200);
    expect(hasPermission('member', 'crm.read')).toBe(true);
    expect(hasPermission('operator', 'crm.read')).toBe(false);
  });
});
