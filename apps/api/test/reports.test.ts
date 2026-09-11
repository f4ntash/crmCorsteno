import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src';
import { availableReportDefinitions, genericReportProvider, reportDefinitions } from '../src/services/report-providers';
import type { ReportContext, ReportProvider } from '../src/services/report-types';

const NOW = new Date('2026-09-10T00:00:00.000Z').getTime();
type Application = { id: string; name: string; projectId: string; projectName: string; applicationType: string; organizationId: string };
type Event = { id: string; occurredAt: number; event: string; application: string; project: string; organizationId: string };
type Product = { name: string; priceMinorUnits: number; currency: string; stock: number };

const roulette: Application = { id: 'roulette-app', name: 'Ruleta Septiembre', projectId: 'project-a', projectName: 'Evento 2026', applicationType: 'roulette', organizationId: 'org-a' };
const generic: Application = { id: 'generic-app', name: '=Catálogo, "general"', projectId: 'project-a', projectName: 'Evento 2026', applicationType: 'generic', organizationId: 'org-a' };
const catalog: Application = { id: 'catalog-app', name: 'Catálogo de aceptación', projectId: 'project-a', projectName: 'Evento 2026', applicationType: 'product-catalog', organizationId: 'org-a' };
const events: Event[] = [
  { id: 'event-1', occurredAt: NOW - 60_000, event: 'experience_view', application: generic.name, project: generic.projectName, organizationId: 'org-a' },
  { id: 'event-2', occurredAt: NOW - 30_000, event: 'app_opened', application: generic.name, project: generic.projectName, organizationId: 'org-a' },
  { id: 'event-old', occurredAt: NOW - 90 * 86400000, event: 'old_event', application: generic.name, project: generic.projectName, organizationId: 'org-a' },
];

function database(options: { role?: string; platformRole?: string; org?: string; revoked?: boolean; applications?: Application[]; events?: Event[]; canonicalProducts?: Product[] } = {}): D1Database {
  const organization = options.org ?? 'org-a';
  const applications = options.applications ?? [roulette, generic];
  const currentEvents = options.events ?? events;
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes('auth_sessions')) return { session_id: 'session', id: 'user-a', email: 'member@example.com', name: 'Member', platformRole: options.platformRole ?? 'user', expires_at: NOW + 60000 } as T;
              if (sql.includes('FROM organizations')) return options.revoked ? null : { id: organization, name: 'Org A', slug: 'org-a', role: options.platformRole ? 'global_admin' : options.role ?? 'member' } as T;
              if (sql.includes("application_type='roulette'")) return applications.some((item) => item.organizationId === organization && item.applicationType === 'roulette') ? { value: 1 } as T : null;
              if (sql.includes("sqlite_master") && sql.includes("name='products'")) return options.canonicalProducts ? { value: 1 } as T : null;
              if (sql.includes("FROM products WHERE")) return options.canonicalProducts?.length ? { value: 1 } as T : null;
              if (sql.includes('FROM applications')) {
                const id = String(args[0] ?? '');
                const projectId = args.length > 2 ? String(args[2]) : null;
                const item = applications.find((candidate) => candidate.id === id && candidate.organizationId === organization && (!projectId || candidate.projectId === projectId));
                return item ? item as T : null;
              }
              return null;
            },
            async all<T>() {
              if (sql.includes('FROM events e')) {
                const since = Number(args[2]);
                return { results: currentEvents.filter((event) => event.organizationId === organization && event.occurredAt >= since) } as { results: T[] };
              }
              if (sql.includes('FROM products p WHERE')) return { results: (options.canonicalProducts ?? []).map((product) => ({ ...product, visible: 1 })) } as { results: T[] };
              return { results: [] as T[] };
            },
            async run() { return { success: true }; },
          };
        },
      };
    },
  };
  return db as unknown as D1Database;
}

function environment(options: Parameters<typeof database>[0] = {}) {
  return { DB: database(options), ENVIRONMENT: 'test', APP_VERSION: 'test' };
}

function request(path: string, options: Parameters<typeof database>[0] = {}) {
  return app.fetch(new Request(`http://localhost${path}`, { headers: { Cookie: 'corsteno_session=test', 'X-Organization-Id': options.org ?? 'org-a' } }), environment(options));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('report registry', () => {
  it('lists generic and conditional product reports', async () => {
    const context: ReportContext = { db: database({ applications: [roulette, generic, catalog] }), organizationId: 'org-a', query: new URLSearchParams() };
    expect((await availableReportDefinitions(context)).map((report) => report.id)).toEqual(['analytics.application-activity.csv', 'roulette.results.csv']);
    const genericOnly = await availableReportDefinitions({ ...context, query: new URLSearchParams('applicationId=generic-app') });
    expect(genericOnly.map((report) => report.id)).toEqual(['analytics.application-activity.csv']);
    const catalogOnly = await availableReportDefinitions({ ...context, query: new URLSearchParams('applicationId=catalog-app') });
    expect(catalogOnly.map((report) => report.id)).toEqual(['analytics.application-activity.csv', 'catalog.inventory.csv']);
  });

  it('accepts a future non-Roulette provider without changing the registry', async () => {
    const futureProvider: ReportProvider = () => [{ id: 'catalog.inventory.csv', title: 'Inventario', description: 'Inventario del catálogo.', scope: 'application', format: 'csv', requiresApplication: true, emptyBehavior: 'error', available: () => true, export: async () => ({ body: 'ok', filename: 'catalog.csv', contentType: 'text/csv; charset=utf-8', rowCount: 1, emptyBehavior: 'error' }) }];
    const context: ReportContext = { db: database(), organizationId: 'org-a', query: new URLSearchParams() };
    expect(reportDefinitions(context, [genericReportProvider, futureProvider]).map((report) => report.id)).toEqual(['analytics.application-activity.csv', 'catalog.inventory.csv']);
    expect((await availableReportDefinitions(context, [futureProvider])).map((report) => report.id)).toEqual(['catalog.inventory.csv']);
  });
});

describe('generic application activity report', () => {
  it('exports scoped safe fields with range filtering and CSV protection', async () => {
    const response = await request('/reports/analytics.application-activity.csv?applicationId=generic-app&projectId=project-a&range=7d');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-disposition')).toContain('corsteno-catalogo-general-actividad-2026-09-10.csv');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const csv = new TextDecoder().decode(bytes);
    expect(csv).toContain('"fecha_hora_utc","proyecto","aplicacion","evento"');
    expect(csv).toContain('experience_view');
    expect(csv).not.toContain('old_event');
    expect(csv).toContain('"\'=Catálogo, ""general"""');
    expect(csv).not.toContain('anonymous_user_id');
    expect(csv).not.toContain('session_id');
    expect(csv).not.toContain('event-1');
  });

  it('returns a clear no-data error and protects organization/application scope', async () => {
    expect((await request('/reports/analytics.application-activity.csv?applicationId=generic-app&range=7d', { events: [] })).status).toBe(422);
    expect((await request('/reports/analytics.application-activity.csv?applicationId=generic-app&range=7d', { org: 'org-b' })).status).toBe(404);
    expect((await request('/reports/analytics.application-activity.csv?applicationId=roulette-app&projectId=project-b', {})).status).toBe(404);
    expect((await request('/reports/analytics.application-activity.csv?range=7d', {})).status).toBe(400);
  });

  it('exports canonical organization inventory without requiring a catalog application', async () => {
    const response = await request('/reports/catalog.inventory.csv?range=7d', { canonicalProducts: [{ name: 'Lámpara Nido', priceMinorUnits: 18900000, currency: 'ARS', stock: 12 }] });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain('corsteno-productos-inventario-productos-2026-09-10.csv');
    expect(await response.text()).toContain('Lámpara Nido');
  });
});

describe('reports permissions', () => {
  it('keeps analytics export unavailable to operators, viewers and revoked members', async () => {
    expect((await request('/reports', { role: 'operator' })).status).toBe(403);
    expect((await request('/reports', { role: 'viewer' })).status).toBe(403);
    expect((await request('/reports', { revoked: true })).status).toBe(403);
    expect((await request('/reports', { platformRole: 'corsteno_admin' })).status).toBe(200);
  });
});
