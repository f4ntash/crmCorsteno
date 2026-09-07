import { describe, expect, it } from 'vitest';
import application from '../src';

const app = {
  request(path: string, init: RequestInit | undefined, env: object) {
    const request = new Request(`http://localhost${path}`, init);
    return application.fetch(request, env);
  },
};

type StoredEvent = { id: string; organizationId: string; projectId: string; applicationId: string; event: string; userId: string | null; sessionId: string | null; properties: string | null; occurredAt: number };
type Fixture = { credential: { application_id: string; organization_id: string; project_id: string } | null; credentialStatus: 'active' | 'revoked'; applicationStatus: 'active' | 'inactive'; inserted: StoredEvent[] };

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return { credential: { application_id: 'app-a', organization_id: 'org-a', project_id: 'project-a' }, credentialStatus: 'active', applicationStatus: 'active', inserted: [], ...overrides };
}

function database(state: Fixture): D1Database {
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T>() { if (state.credentialStatus !== 'active' || state.applicationStatus !== 'active') return null as T; return state.credential as T; },
            async run() { if (sql.startsWith('INSERT INTO events')) { const [id, organizationId, projectId, applicationId, event, userId, sessionId, properties, occurredAt] = args as [string, string, string, string, string, string | null, string | null, string | null, number]; state.inserted.push({ id, organizationId, projectId, applicationId, event, userId, sessionId, properties, occurredAt }); } return { success: true }; },
            async all<T>() { return { results: [] as T[] }; },
          };
        },
      };
    },
  };
  return db as unknown as D1Database;
}

function environment(state: Fixture) { return { DB: database(state), ENVIRONMENT: 'test', APP_VERSION: 'test' }; }
function headers(key = 'valid-key') { return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }; }
const validEvent = { event: 'game_finished', userId: 'user-a', sessionId: 'session-a', occurredAt: 1000, properties: { game: 'roulette', result: 'win' } };
const webArEvent = { userId: '4745b141-f137-459c-a87b-311d315f2899', sessionId: '4745b141-f137-459c-a87b-311d315f2899', occurredAt: 1700000000000, properties: { surface: 'web', experience: 'cosquin_ar', target_id: 'cosquin-rock' } };

describe('Event API credentials and ingestion', () => {
  it('accepts a valid key and derives organization, project and application', async () => {
    const state = fixture();
    const response = await app.request('/v1/events', { method: 'POST', headers: headers(), body: JSON.stringify(validEvent) }, environment(state));
    expect(response.status).toBe(201); expect(state.inserted).toHaveLength(1);
    const inserted = state.inserted.at(0);
    if (!inserted) throw new Error('expected an inserted event');
    expect(inserted).toMatchObject({ organizationId: 'org-a', projectId: 'project-a', applicationId: 'app-a', event: 'game_finished', userId: 'user-a', sessionId: 'session-a', occurredAt: 1000 });
    expect(JSON.parse(inserted.properties ?? '{}')).toEqual(validEvent.properties);
  });
  it.each(['image_target_detected', 'experience_started', 'experience_finished'])('accepts WebAR event %s with UUIDs and flexible properties', async event => {
    const state = fixture();
    const response = await app.request('/v1/events', { method: 'POST', headers: headers(), body: JSON.stringify({ ...webArEvent, event }) }, environment(state));
    expect(response.status).toBe(201);
    const inserted = state.inserted[0];
    if (!inserted) throw new Error('expected an inserted WebAR event');
    expect(inserted).toMatchObject({ event, userId: webArEvent.userId, sessionId: webArEvent.sessionId, occurredAt: webArEvent.occurredAt });
    expect(JSON.parse(inserted.properties ?? '{}')).toEqual(webArEvent.properties);
  });
  it('rejects an invalid key without inserting', async () => { const state = fixture({ credential: null }); const response = await app.request('/v1/events', { method: 'POST', headers: headers('invalid-key'), body: JSON.stringify(validEvent) }, environment(state)); expect(response.status).toBe(401); expect(state.inserted).toHaveLength(0); });
  it.each([['revoked credential', { credentialStatus: 'revoked' as const }], ['inactive application', { applicationStatus: 'inactive' as const }]])('rejects ingestion for an %s', async (_label, override) => { const state = fixture(override); const response = await app.request('/v1/events', { method: 'POST', headers: headers(), body: JSON.stringify(validEvent) }, environment(state)); expect(response.status).toBe(401); expect(state.inserted).toHaveLength(0); });
  it.each([['empty event', { ...validEvent, event: '' }], ['unknown event', { ...validEvent, event: 'not_a_real_event' }], ['invalid JSON body', null], ['invalid occurredAt', { ...validEvent, occurredAt: Number.NaN }], ['oversized user id', { ...validEvent, userId: 'x'.repeat(201) }]])('returns 400 for %s', async (_label, body) => { const state = fixture(); const response = await app.request('/v1/events', { method: 'POST', headers: headers(), body: body === null ? '{' : JSON.stringify(body) }, environment(state)); expect(response.status).toBe(400); expect(state.inserted).toHaveLength(0); });
  it('rejects the misspelled WebAR event name', async () => { const state = fixture(); const response = await app.request('/v1/events', { method: 'POST', headers: headers(), body: JSON.stringify({ ...webArEvent, event: 'image_target_detectected' }) }, environment(state)); expect(response.status).toBe(400); expect(state.inserted).toHaveLength(0); });
  it('does not allow body tenant fields to override credential scope', async () => { const state = fixture(); const response = await app.request('/v1/events', { method: 'POST', headers: headers(), body: JSON.stringify({ ...validEvent, organizationId: 'other-org', projectId: 'other-project', applicationId: 'other-app' }) }, environment(state)); expect(response.status).toBe(201); expect(state.inserted[0]).toMatchObject({ organizationId: 'org-a', projectId: 'project-a', applicationId: 'app-a' }); });
  it('accepts a valid batch and applies one credential scope to every item', async () => { const state = fixture(); const response = await app.request('/v1/events/batch', { method: 'POST', headers: headers(), body: JSON.stringify({ events: [validEvent, { ...validEvent, event: 'game_started', occurredAt: 2000 }] }) }, environment(state)); expect(response.status).toBe(201); expect(state.inserted).toHaveLength(2); expect(state.inserted.every(event => event.organizationId === 'org-a' && event.projectId === 'project-a' && event.applicationId === 'app-a')).toBe(true); });
  it('rejects an invalid item in a batch after the earlier item, matching current partial behavior', async () => { const state = fixture(); const response = await app.request('/v1/events/batch', { method: 'POST', headers: headers(), body: JSON.stringify({ events: [validEvent, { ...validEvent, event: '' }] }) }, environment(state)); expect(response.status).toBe(400); expect(state.inserted).toHaveLength(1); });
  it('rejects a batch larger than 50 items', async () => { const state = fixture(); const events = Array.from({ length: 51 }, (_, index) => ({ ...validEvent, occurredAt: index })); const response = await app.request('/v1/events/batch', { method: 'POST', headers: headers(), body: JSON.stringify({ events }) }, environment(state)); expect(response.status).toBe(400); expect(state.inserted).toHaveLength(0); });
  it('keeps the documented empty-batch behavior', async () => { const state = fixture(); const response = await app.request('/v1/events/batch', { method: 'POST', headers: headers(), body: JSON.stringify({ events: [] }) }, environment(state)); expect(response.status).toBe(201); expect(state.inserted).toHaveLength(0); });
});

describe('application credential privileges', () => {
  it.each(['/analytics/summary', '/projects', '/admin/organizations'])('cannot authenticate as a CRM user for GET %s', async path => { const response = await app.request(path, { headers: { Authorization: 'Bearer valid-key', 'X-Organization-Id': 'org-a' } }, environment(fixture())); expect(response.status).toBe(401); });
});
