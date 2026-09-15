import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import type { D1Database } from '@cloudflare/workers-types';
import app from '../src';

type BoundStatement = { run(): Promise<{ success: boolean; meta: { changes: number } }> };
type SQLiteValue = string | number | bigint | null | Uint8Array;
type SQLiteStatement = { get(...args: SQLiteValue[]): unknown; all(...args: SQLiteValue[]): unknown[]; run(...args: SQLiteValue[]): { changes: number } };
type SQLiteConnection = { exec(sql: string): void; prepare(sql: string): SQLiteStatement; close(): void };
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => SQLiteConnection };

class SqliteD1 {
  private readonly sqlite = new DatabaseSync(':memory:');
  private queue = Promise.resolve();
  beforeNextBatch?: () => void;
  failAnalyticsEvents = false;

  constructor(config: string, stockMode: 'limited' | 'unlimited', stockAvailable: number | null) {
    this.sqlite.exec(`
      CREATE TABLE experiences (id TEXT PRIMARY KEY, organization_id TEXT, name TEXT, slug TEXT UNIQUE, type TEXT, status TEXT, published_config TEXT, starts_at TEXT, ends_at TEXT, application_id TEXT, project_id TEXT);
      CREATE TABLE experience_access_periods (id TEXT, experience_id TEXT, organization_id TEXT, starts_at TEXT, ends_at TEXT, source TEXT, created_at TEXT, created_by TEXT, note TEXT, subscription_period_id TEXT);
      CREATE TABLE channels (id TEXT PRIMARY KEY, organization_id TEXT, status TEXT, type TEXT);
      CREATE TABLE experience_channels (experience_id TEXT, organization_id TEXT, channel_id TEXT);
      CREATE TABLE plans (id TEXT PRIMARY KEY, name TEXT);
      CREATE TABLE subscriptions (id TEXT PRIMARY KEY, organization_id TEXT, plan_id TEXT, status TEXT, feature_entitlements_json TEXT);
      CREATE TABLE subscription_periods (id TEXT PRIMARY KEY, subscription_id TEXT);
      CREATE TABLE subscription_experiences (experience_id TEXT, organization_id TEXT, subscription_id TEXT);
      CREATE TABLE experience_prize_inventory (experience_id TEXT, prize_id TEXT, stock_mode TEXT, stock_available INTEGER, delivered_count INTEGER NOT NULL DEFAULT 0, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (experience_id,prize_id));
      CREATE TABLE experience_spins (id TEXT PRIMARY KEY, experience_id TEXT NOT NULL, organization_id TEXT NOT NULL, application_id TEXT, segment_id TEXT, segment_index INTEGER NOT NULL, prize_id TEXT, outcome_type TEXT NOT NULL, participant_device_id TEXT, participant_session_id TEXT, request_id TEXT, response_json TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE UNIQUE INDEX experience_spins_request_id_idx ON experience_spins (experience_id,organization_id,request_id) WHERE request_id IS NOT NULL;
      CREATE TABLE experience_prize_inventory_events (id TEXT PRIMARY KEY, experience_id TEXT NOT NULL, prize_id TEXT NOT NULL, type TEXT NOT NULL, quantity INTEGER NOT NULL, spin_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE roulette_prize_claims (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, organization_id TEXT NOT NULL, experience_id TEXT NOT NULL, spin_id TEXT NOT NULL UNIQUE, prize_id TEXT NOT NULL, prize_name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT DEFAULT CURRENT_TIMESTAMP, redeemed_at TEXT, redeemed_by TEXT);
      CREATE TABLE projects (id TEXT PRIMARY KEY, organization_id TEXT, name TEXT, slug TEXT, status TEXT, description TEXT, created_at INTEGER, updated_at INTEGER, UNIQUE(organization_id,slug));
      CREATE TABLE applications (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT, name TEXT, slug TEXT, status TEXT, application_type TEXT, created_at INTEGER, updated_at INTEGER, UNIQUE(project_id,slug));
      CREATE TABLE events (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT, application_id TEXT, event_name TEXT, anonymous_user_id TEXT, session_id TEXT, properties TEXT, occurred_at INTEGER, created_at INTEGER);
    `);
    this.sqlite.prepare('INSERT INTO experiences (id,organization_id,name,slug,type,status,published_config) VALUES (?,?,?,?,?,?,?)').run('experience-1', 'org-1', 'Test roulette', 'safe-test', 'roulette', 'published', config);
    this.sqlite.prepare('INSERT INTO channels (id,organization_id,status,type) VALUES (?,?,?,?)').run('channel-1', 'org-1', 'active', 'hosted_runtime');
    this.sqlite.prepare('INSERT INTO experience_channels (experience_id,organization_id,channel_id) VALUES (?,?,?)').run('experience-1', 'org-1', 'channel-1');
    const prizeId = JSON.parse(config).prizes[0].id as string;
    this.sqlite.prepare('INSERT INTO experience_prize_inventory (experience_id,prize_id,stock_mode,stock_available,delivered_count) VALUES (?,?,?,?,0)').run('experience-1', prizeId, stockMode, stockAvailable);
  }

  prepare(sql: string) {
    const sqlite = this.sqlite;
    const failAnalyticsWrite = () => this.failAnalyticsEvents && sql.startsWith('INSERT INTO events');
    return {
      bind(...args: unknown[]) {
        const statement = sqlite.prepare(sql);
        return {
          async first<T>() { return (statement.get(...args as SQLiteValue[]) as T | undefined) ?? null; },
          async all<T>() { return { results: statement.all(...args as SQLiteValue[]) as T[] }; },
          async run() {
            if (failAnalyticsWrite()) throw new Error('simulated analytics write failure');
            const result = statement.run(...args as SQLiteValue[]);
            return { success: true, meta: { changes: Number(result.changes) } };
          },
        };
      },
    };
  }

  batch(statements: BoundStatement[]) {
    this.beforeNextBatch?.();
    this.beforeNextBatch = undefined;
    const execute = this.queue.then(async () => {
      this.sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        this.sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        this.sqlite.exec('ROLLBACK');
        throw error;
      }
    });
    this.queue = execute.then(() => undefined, () => undefined);
    return execute;
  }

  first<T>(sql: string, ...args: unknown[]) { return this.sqlite.prepare(sql).get(...args as SQLiteValue[]) as T | undefined; }
  all<T>(sql: string, ...args: unknown[]) { return this.sqlite.prepare(sql).all(...args as SQLiteValue[]) as T[]; }
  close() { this.sqlite.close(); }
}

function testConfig(participation: Record<string, unknown> = {}, stockMode: 'limited' | 'unlimited' = 'limited', initialStock = 1) {
  return JSON.stringify({
    schemaVersion: 1,
    backgroundColor: '#111111',
    prizes: [{ id: 'prize-1', name: 'Test prize', enabled: true, weight: 1, stockMode, initialStock, redemption: { enabled: true } }],
    segments: Array.from({ length: 6 }, (_, index) => ({ id: `segment-${index}`, color: '#D6B25E', prizeId: 'prize-1' })),
    participation,
  });
}

const ids = {
  device: '11111111-1111-4111-8111-111111111111',
  device2: '22222222-2222-4222-8222-222222222222',
  session: '33333333-3333-4333-8333-333333333333',
  session2: '44444444-4444-4444-8444-444444444444',
};
let databases: SqliteD1[] = [];

function env(config: string, stockMode: 'limited' | 'unlimited' = 'limited', stockAvailable: number | null = 1) {
  const database = new SqliteD1(config, stockMode, stockAvailable);
  databases.push(database);
  return database;
}

async function postSpin(db: SqliteD1, deviceId: string, sessionId: string, requestId = crypto.randomUUID()) {
  const pending: Promise<unknown>[] = [];
  const response = await app.fetch(new Request('http://localhost/public/experiences/safe-test/spin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, sessionId, requestId }),
  }), { DB: db as unknown as D1Database, ENVIRONMENT: 'test', APP_VERSION: 'test' }, { waitUntil: (promise: Promise<unknown>) => pending.push(promise) } as unknown as ExecutionContext);
  await Promise.all(pending);
  return response;
}

afterEach(() => { for (const db of databases) db.close(); databases = []; });

describe('roulette D1 admission under concurrency', () => {
  it('admits exactly one same-device/session spin with each limit set to one', async () => {
    const config = testConfig({ maxSpinsPerDevice: 1, maxSpinsPerSession: 1, cooldownSeconds: 0 });
    const db = env(config);
    const [first, second] = await Promise.all([postSpin(db, ids.device, ids.session), postSpin(db, ids.device, ids.session)]);
    expect([first.status, second.status].sort()).toEqual([200, 429]);
    const spins = db.all<{ id: string; outcome_type: string; prize_id: string }>('SELECT id,outcome_type,prize_id FROM experience_spins');
    const claims = db.all<{ id: string; organization_id: string; experience_id: string; spin_id: string; prize_id: string; status: string; created_at: string; redeemed_at: string | null }>('SELECT * FROM roulette_prize_claims');
    expect(spins).toHaveLength(1);
    expect(spins[0]).toMatchObject({ outcome_type: 'prize', prize_id: 'prize-1' });
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ organization_id: 'org-1', experience_id: 'experience-1', spin_id: spins[0]!.id, prize_id: 'prize-1', status: 'active' });
    expect(claims[0]!.created_at).toBeTruthy();
    expect(claims[0]!.redeemed_at).toBeNull();
    expect(db.all("SELECT id FROM experience_prize_inventory_events WHERE type='prize_delivered'")).toHaveLength(1);
    expect(db.first<{ stock_available: number; delivered_count: number }>('SELECT stock_available,delivered_count FROM experience_prize_inventory')).toMatchObject({ stock_available: 0, delivered_count: 1 });
    expect(db.all("SELECT event_name FROM events WHERE event_name='roulette_spin_completed'")).toHaveLength(1);
    expect(db.all("SELECT event_name FROM events WHERE event_name='roulette_prize_won'")).toHaveLength(1);
  });

  it('caps a larger configured limit at two concurrent spins', async () => {
    const config = testConfig({ maxSpinsPerDevice: 2, maxSpinsPerSession: null, cooldownSeconds: 0 }, 'unlimited', 0);
    const db = env(config, 'unlimited', null);
    const responses = await Promise.all([postSpin(db, ids.device, ids.session), postSpin(db, ids.device, ids.session2), postSpin(db, ids.device, ids.session)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 200, 429]);
    expect(db.all('SELECT id FROM experience_spins')).toHaveLength(2);
    expect(db.all('SELECT id FROM roulette_prize_claims')).toHaveLength(2);
    expect(db.first<{ delivered_count: number }>('SELECT delivered_count FROM experience_prize_inventory')).toMatchObject({ delivered_count: 2 });
    expect(db.all("SELECT event_name FROM events WHERE event_name='roulette_spin_completed'")).toHaveLength(2);
  });

  it('enforces a session-only limit across two different devices', async () => {
    const config = testConfig({ maxSpinsPerDevice: null, maxSpinsPerSession: 1, cooldownSeconds: 0 }, 'unlimited', 0);
    const db = env(config, 'unlimited', null);
    const [first, second] = await Promise.all([postSpin(db, ids.device, ids.session), postSpin(db, ids.device2, ids.session)]);
    expect([first.status, second.status].sort()).toEqual([200, 429]);
    expect(db.all('SELECT id FROM experience_spins')).toHaveLength(1);
    expect(db.all('SELECT id FROM roulette_prize_claims')).toHaveLength(1);
    expect(db.all("SELECT event_name FROM events WHERE event_name='roulette_spin_completed'")).toHaveLength(1);
  });

  it('does not oversell stock=1 for two distinct participants', async () => {
    const db = env(testConfig({}, 'limited', 1));
    const [first, second] = await Promise.all([postSpin(db, ids.device, ids.session), postSpin(db, ids.device2, ids.session2)]);
    expect([first.status, second.status].filter((status) => status === 200)).toHaveLength(2);
    const payloads = await Promise.all([first.json(), second.json()]) as Array<Record<string, unknown>>;
    expect(payloads.filter((payload) => typeof payload.spinId === 'string')).toHaveLength(1);
    expect(db.all('SELECT id FROM experience_spins')).toHaveLength(1);
    expect(db.all('SELECT id FROM roulette_prize_claims')).toHaveLength(1);
    expect(db.all("SELECT id FROM experience_prize_inventory_events WHERE type='prize_delivered'")).toHaveLength(1);
    expect(db.first<{ stock_available: number; delivered_count: number }>('SELECT stock_available,delivered_count FROM experience_prize_inventory')).toMatchObject({ stock_available: 0, delivered_count: 1 });
    expect(db.all("SELECT event_name FROM events WHERE event_name='roulette_spin_completed'")).toHaveLength(1);
  });

  it('keeps a successful spin when secondary analytics persistence fails', async () => {
    const db = env(testConfig({}, 'limited', 1));
    db.failAnalyticsEvents = true;
    const response = await postSpin(db, ids.device, ids.session);
    expect(response.status).toBe(200);
    expect(db.all('SELECT id FROM experience_spins')).toHaveLength(1);
    expect(db.all('SELECT id FROM roulette_prize_claims')).toHaveLength(1);
    expect(db.all('SELECT id FROM experience_prize_inventory_events WHERE type=\'prize_delivered\'')).toHaveLength(1);
    expect(db.all('SELECT id FROM events')).toHaveLength(0);
  });

  it('replays the saved response for the same idempotency key without another delivery', async () => {
    const db = env(testConfig({}, 'limited', 1));
    const requestId = '55555555-5555-4555-8555-555555555555';
    const [first, replay] = await Promise.all([postSpin(db, ids.device, ids.session, requestId), postSpin(db, ids.device, ids.session, requestId)]);
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(await first.json());
    expect(db.all('SELECT id FROM experience_spins')).toHaveLength(1);
    expect(db.all('SELECT id FROM roulette_prize_claims')).toHaveLength(1);
    expect(db.all("SELECT id FROM experience_prize_inventory_events WHERE type='prize_delivered'")).toHaveLength(1);
    expect(db.all("SELECT event_name FROM events WHERE event_name='roulette_spin_completed'")).toHaveLength(1);
  });

  it('rejects reusing an idempotency key for another anonymous identity', async () => {
    const db = env(testConfig({}, 'unlimited', 0), 'unlimited', null);
    const requestId = '66666666-6666-4666-8666-666666666666';
    expect((await postSpin(db, ids.device, ids.session, requestId)).status).toBe(200);
    expect((await postSpin(db, ids.device2, ids.session2, requestId)).status).toBe(409);
    expect(db.all('SELECT id FROM experience_spins')).toHaveLength(1);
  });

  it('refuses a spin when stock is zero or the published config changes before admission', async () => {
    const soldOutConfig = testConfig({}, 'limited', 0);
    const soldOutDb = env(soldOutConfig, 'limited', 0);
    const soldOut = await postSpin(soldOutDb, ids.device, ids.session);
    expect(await soldOut.json()).toMatchObject({ active: false, reason: 'unavailable' });
    expect(soldOutDb.all('SELECT id FROM experience_spins')).toHaveLength(0);

    const config = testConfig({}, 'unlimited', 0);
    const changedConfig = JSON.stringify({ ...JSON.parse(config), backgroundColor: '#222222' });
    const changedDb = env(config, 'unlimited', null);
    changedDb.beforeNextBatch = () => { void changedDb.prepare('UPDATE experiences SET published_config=? WHERE id=?').bind(changedConfig, 'experience-1').run(); };
    const changed = await postSpin(changedDb, ids.device2, ids.session2);
    expect(changed.status).toBe(503);
    expect(changedDb.all('SELECT id FROM experience_spins')).toHaveLength(0);
    expect(changedDb.all('SELECT id FROM roulette_prize_claims')).toHaveLength(0);
  });
});
