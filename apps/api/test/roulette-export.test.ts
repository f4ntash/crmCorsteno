import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src';
import { rouletteResultsCsv } from '../src/routes/analytics';

const NOW = new Date('2026-09-10T00:00:00.000Z').getTime();
type Application = { id: string; name: string; projectId: string; applicationType: string; organizationId: string };
type Experience = { id: string; name: string; applicationId: string; type: string; organizationId: string; publishedConfig: string | null; draftConfig: string | null };
type Spin = { id: string; experienceId: string; applicationId: string; createdAt: string; outcomeType: 'prize' | 'no_prize'; prizeId: string | null; claimPrizeName: string | null; claimCode: string | null; claimStatus: 'active' | 'redeemed' | null; redeemedAt: string | null };
type BlockedEvent = { occurredAt: number; properties: string | null };

const application: Application = { id: 'roulette-app', name: 'Ruleta Septiembre', projectId: 'project-a', applicationType: 'roulette', organizationId: 'org-a' };
const experience: Experience = {
  id: 'experience-a',
  name: 'Campaña, "Especial"',
  applicationId: application.id,
  type: 'roulette',
  organizationId: 'org-a',
  publishedConfig: JSON.stringify({ prizes: [{ id: 'p1', name: '=Oferta, "especial"' }, { id: 'p2', name: 'Café gratis' }] }),
  draftConfig: null,
};
const spins: Spin[] = [
  { id: 'spin-no-prize', experienceId: experience.id, applicationId: application.id, createdAt: '2026-09-08T12:00:00.000Z', outcomeType: 'no_prize', prizeId: null, claimPrizeName: null, claimCode: null, claimStatus: null, redeemedAt: null },
  { id: 'spin-old', experienceId: experience.id, applicationId: application.id, createdAt: '2026-08-01T12:00:00.000Z', outcomeType: 'no_prize', prizeId: null, claimPrizeName: null, claimCode: null, claimStatus: null, redeemedAt: null },
  { id: 'spin-win-active', experienceId: experience.id, applicationId: application.id, createdAt: '2026-09-09T12:00:00.000Z', outcomeType: 'prize', prizeId: 'p1', claimPrizeName: '=Oferta, "especial"', claimCode: 'CLAIM-A', claimStatus: 'active', redeemedAt: null },
  { id: 'spin-win-redeemed', experienceId: experience.id, applicationId: application.id, createdAt: '2026-09-09T13:00:00.000Z', outcomeType: 'prize', prizeId: 'p2', claimPrizeName: 'Café gratis', claimCode: 'CLAIM-B', claimStatus: 'redeemed', redeemedAt: '2026-09-09T14:00:00.000Z' },
];
const blockedEvents: BlockedEvent[] = [{ occurredAt: NOW - 60_000, properties: JSON.stringify({ experienceId: experience.id, reason: 'device_limit' }) }];

function database(role: string, org = 'org-a', currentSpins = spins, currentBlockedEvents = blockedEvents): D1Database {
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes('auth_sessions')) return { session_id: 'session-crm', id: 'crm-user', email: 'staff@example.com', name: 'Staff', platform_role: 'user', expires_at: NOW + 10_000 } as T;
              if (sql.includes('FROM organizations')) return { id: org, name: 'Org A', slug: 'org-a', role } as T;
              if (sql.includes('FROM applications WHERE id=?')) {
                if (args[0] === application.id && application.organizationId === org) return application as T;
                if (args[0] === 'generic-app' && org === 'org-a') return { ...application, id: 'generic-app', applicationType: 'generic' } as T;
                return null as T;
              }
              return null as T;
            },
            async all<T>() {
              if (sql.includes('SELECT e.id,e.name,e.application_id applicationId')) {
                return { results: org === experience.organizationId && (!sql.includes('e.id=?') || args.includes(experience.id)) && (!sql.includes('e.application_id=?') || args.includes(application.id)) ? [experience] : [] } as T;
              }
              if (sql.includes('FROM experience_spins')) {
                const since = String(args[1]);
                const selectedExperience = sql.includes('s.experience_id=?') ? String(args[args.length - 1]) : null;
                const selectedApplication = sql.includes('s.application_id=?') ? application.id : null;
                return { results: currentSpins.filter((spin) => spin.createdAt >= since && (!selectedExperience || spin.experienceId === selectedExperience) && (!selectedApplication || spin.applicationId === selectedApplication)).map((spin) => ({ ...spin, experienceName: experience.name })) as T[] };
              }
              if (sql.includes('SELECT occurred_at occurredAt,properties FROM events')) {
                const since = Number(args[2]);
                return { results: currentBlockedEvents.filter((event) => event.occurredAt >= since) as T[] };
              }
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

function environment(role = 'owner', org = 'org-a', currentSpins = spins, currentBlockedEvents = blockedEvents) {
  return { DB: database(role, org, currentSpins, currentBlockedEvents), ENVIRONMENT: 'test', APP_VERSION: 'test' };
}

async function request(path: string, options: { role?: string; org?: string; spins?: Spin[]; blockedEvents?: BlockedEvent[]; cookie?: boolean } = {}) {
  const headers = new Headers({ 'X-Organization-Id': options.org ?? 'org-a' });
  if (options.cookie !== false) headers.set('Cookie', 'corsteno_session=test-session');
  return app.fetch(new Request(`http://localhost${path}`, { headers }), environment(options.role, options.org, options.spins, options.blockedEvents));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('Roulette CSV export', () => {
  it('exports only the selected Roulette scope with date filtering and safe claim fields', async () => {
    const response = await request('/analytics/roulette-export?applicationId=roulette-app&range=7d');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-disposition')).toContain('corsteno-campana-especial-resultados-2026-09-10.csv');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const csv = new TextDecoder().decode(bytes);
    expect(csv).toContain('"fecha_hora_utc","experiencia","tipo_resultado","premio","codigo_claim","estado_claim","canjeado_en_utc","motivo_bloqueo"');
    expect(csv).toContain('win');
    expect(csv).toContain('no_prize');
    expect(csv).toContain('blocked');
    expect(csv).toContain('CLAIM-A');
    expect(csv).toContain('CLAIM-B');
    expect(csv).toContain('redeemed');
    expect(csv).toContain('2026-09-09T14:00:00.000Z');
    expect(csv).toContain("'=Oferta, \"\"especial\"\"");
    expect(csv).not.toContain('spin-win-active');
    expect(csv).not.toContain('participant_device_id');
    expect(csv).not.toContain('participant_session_id');
    expect(csv).not.toContain('organization_id');
    expect(csv).not.toContain('2026-08-01');
  });

  it('supports an explicitly selected experience and returns an empty standards-compatible CSV', async () => {
    const response = await request(`/analytics/roulette-export?experienceId=${experience.id}&range=all`, { spins: [], blockedEvents: [] });
    expect(response.status).toBe(200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toBe('"fecha_hora_utc","experiencia","tipo_resultado","premio","codigo_claim","estado_claim","canjeado_en_utc","motivo_bloqueo"\r\n');
  });

  it('rejects generic applications, operators, unauthorized callers, and foreign organizations', async () => {
    const generic = await request('/analytics/roulette-export?applicationId=generic-app', { cookie: true });
    expect(generic.status).toBe(422);
    const operator = await request('/analytics/roulette-export?applicationId=roulette-app', { role: 'operator' });
    expect(operator.status).toBe(403);
    const viewer = await request('/analytics/roulette-export?applicationId=roulette-app', { role: 'viewer' });
    expect(viewer.status).toBe(403);
    const unauthorized = await request('/analytics/roulette-export?applicationId=roulette-app', { cookie: false });
    expect(unauthorized.status).toBe(401);
    const foreign = await request('/analytics/roulette-export?applicationId=roulette-app', { org: 'org-b' });
    expect(foreign.status).toBe(404);
  });

  it('escapes commas, quotes, line breaks, and formula-like customer text', () => {
    const csv = rouletteResultsCsv([{ occurredAt: '2026-09-10T00:00:00.000Z', experience: '=Campaña', resultType: 'win', prizeName: 'Premio, "especial"\nsegunda línea', claimCode: '+CODE', claimStatus: 'active', redeemedAt: '', blockReason: '@reason' }]);
    expect(csv).toContain('"\'=Campaña"');
    expect(csv).toContain('"Premio, ""especial""\nsegunda línea"');
    expect(csv).toContain('"\'+CODE"');
    expect(csv).toContain('"\'@reason"');
  });
});
