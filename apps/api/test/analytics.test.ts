import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src';

const NOW = 1_700_000_000_000;
type Event = {
  organizationId: string;
  projectId: string;
  applicationId: string;
  event: string;
  userId: string | null;
  sessionId: string | null;
  occurredAt: number;
  properties?: Record<string, string>;
};
type Scope = {
  organizationId: string;
  projectId: string;
  applicationId: string;
};
type TestState = { events: Event[]; scopes: Scope[] };

const a1: Scope = {
  organizationId: 'org-a',
  projectId: 'a1',
  applicationId: 'a1-app',
};
const a1a2: Scope = {
  organizationId: 'org-a',
  projectId: 'a1',
  applicationId: 'a2-app',
};
const a2: Scope = {
  organizationId: 'org-a',
  projectId: 'a2',
  applicationId: 'a3-app',
};
const b1: Scope = {
  organizationId: 'org-b',
  projectId: 'b1',
  applicationId: 'b1-app',
};
const scopes: Scope[] = [a1, a1a2, a2, b1];

function event(scope: Scope, values: Omit<Event, keyof Scope>): Event {
  return { ...scope, ...values };
}
function baseEvents(): Event[] {
  return [
    event(a1, {
      event: 'app_opened',
      userId: 'user1',
      sessionId: 'session1',
      occurredAt: NOW - 1_000,
    }),
    event(a1, {
      event: 'app_opened',
      userId: 'user1',
      sessionId: 'session1',
      occurredAt: NOW - 2_000,
    }),
    event(a1, {
      event: 'app_opened',
      userId: 'user2',
      sessionId: 'session2',
      occurredAt: NOW - 3_000,
    }),
    event(a1, {
      event: 'app_opened',
      userId: 'user3',
      sessionId: 'session3',
      occurredAt: NOW - 4_000,
    }),
    event(a1, {
      event: 'game_started',
      userId: 'user1',
      sessionId: 'session1',
      occurredAt: NOW - 5_000,
      properties: { game: 'roulette' },
    }),
    event(a1, {
      event: 'game_started',
      userId: 'user2',
      sessionId: 'session2',
      occurredAt: NOW - 6_000,
      properties: { game: 'trivia' },
    }),
    event(a1, {
      event: 'game_finished',
      userId: 'user1',
      sessionId: 'session1',
      occurredAt: NOW - 7_000,
      properties: { game: 'roulette', result: 'win', prize: 'Remera' },
    }),
    event(a1, {
      event: 'game_finished',
      userId: 'user2',
      sessionId: 'session2',
      occurredAt: NOW - 8_000,
      properties: { game: 'trivia', result: 'lose' },
    }),
    event(a1, {
      event: 'prize_won',
      userId: 'user1',
      sessionId: 'session1',
      occurredAt: NOW - 9_000,
      properties: { prize: 'Remera' },
    }),
    event(a1, {
      event: 'prize_claimed',
      userId: 'user1',
      sessionId: 'session1',
      occurredAt: NOW - 10_000,
      properties: { prize: 'Gorra' },
    }),
    event(a1a2, {
      event: 'game_started',
      userId: 'a2-user',
      sessionId: 'a2-session',
      occurredAt: NOW - 11_000,
      properties: { game: 'memory' },
    }),
    event(b1, {
      event: 'game_finished',
      userId: 'b-user',
      sessionId: 'b-session',
      occurredAt: NOW - 12_000,
      properties: { game: 'other', result: 'win', prize: 'Other' },
    }),
  ];
}

function filterEvents(state: TestState, sql: string, args: unknown[]): Event[] {
  const organizationId = String(args[0]);
  const since = Number(args[1]);
  const projectId = sql.includes('project_id=?') ? String(args[2]) : undefined;
  const applicationIndex = projectId ? 3 : 2;
  const applicationId = sql.includes('application_id=?')
    ? String(args[applicationIndex])
    : undefined;
  return state.events.filter(
    (item) =>
      item.organizationId === organizationId &&
      item.occurredAt >= since &&
      (!projectId || item.projectId === projectId) &&
      (!applicationId || item.applicationId === applicationId),
  );
}

function database(state: TestState): D1Database {
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes('auth_sessions'))
                return {
                  session_id: 'session-crm',
                  id: 'crm-user',
                  email: 'test@example.com',
                  name: 'Test',
                  platform_role: 'user',
                  expires_at: NOW + 10_000,
                } as T;
              if (sql.includes('FROM organizations'))
                return {
                  id: 'org-a',
                  name: 'Org A',
                  slug: 'org-a',
                  role: 'owner',
                } as T;
              if (sql.includes('FROM projects WHERE id=?'))
                return state.scopes.some(
                  (item) =>
                    item.projectId === args[0] &&
                    item.organizationId === args[1],
                )
                  ? ({ id: args[0] } as T)
                  : (null as T);
              if (sql.includes('FROM applications WHERE id=?')) {
                const valid = state.scopes.some(
                  (item) =>
                    item.applicationId === args[0] &&
                    item.organizationId === args[1] &&
                    (!args[2] || item.projectId === args[2]),
                );
                return valid ? ({ id: args[0] } as T) : (null as T);
              }
              if (sql.includes('COUNT(DISTINCT anonymous_user_id)'))
                return {
                  n: new Set(
                    filterEvents(state, sql, args)
                      .map((item) => item.userId)
                      .filter(Boolean),
                  ).size,
                } as T;
              if (sql.includes('COUNT(DISTINCT session_id)'))
                return {
                  n: new Set(
                    filterEvents(state, sql, args)
                      .map((item) => item.sessionId)
                      .filter(Boolean),
                  ).size,
                } as T;
              return null as T;
            },
            async all<T>() {
              if (sql.includes('FROM applications WHERE organization_id=?')) {
                const projectId = sql.includes('project_id=?')
                  ? String(args[1])
                  : undefined;
                return {
                  results: scopes
                    .filter(
                      (item) =>
                        item.organizationId === 'org-a' &&
                        (!projectId || item.projectId === projectId),
                    )
                    .map((item, index) => ({
                      id: item.applicationId,
                      organizationId: item.organizationId,
                      projectId: item.projectId,
                      name: `Application ${index}`,
                      slug: `app-${index}`,
                      status: 'active',
                      applicationType: index === 0 ? 'webar' : null,
                    })) as T[],
                };
              }
              const rows = filterEvents(state, sql, args);
              if (sql.includes('GROUP BY event_name')) {
                const counts = new Map<string, number>();
                for (const item of rows)
                  counts.set(item.event, (counts.get(item.event) ?? 0) + 1);
                return {
                  results: [...counts].map(([event_name, n]) => ({
                    event_name,
                    n,
                  })) as T[],
                };
              }
              if (sql.includes('GROUP BY anonymous_user_id')) {
                const counts = new Map<string, number>();
                for (const item of rows.filter(
                  (item) => item.event === 'game_finished' && item.userId,
                ))
                  counts.set(
                    item.userId as string,
                    (counts.get(item.userId as string) ?? 0) + 1,
                  );
                return {
                  results: [...counts].map(([userId, n]) => ({
                    userId,
                    n,
                  })) as T[],
                };
              }
              if (sql.includes('occurred_at occurredAt')) {
                const limit = Number(args.at(-1));
                return {
                  results: rows
                    .sort((a, b) => b.occurredAt - a.occurredAt)
                    .slice(0, sql.includes('LIMIT ?') ? limit : undefined)
                    .map((item) => ({
                      occurredAt: item.occurredAt,
                      event: item.event,
                      userId: item.userId,
                      anonymousUserId: item.userId,
                      properties: item.properties
                        ? JSON.stringify(item.properties)
                        : null,
                    })) as T[],
                };
              }
              return {
                results: rows.map((item) => ({
                  properties: item.properties
                    ? JSON.stringify(item.properties)
                    : null,
                  occurredAt: item.occurredAt,
                  event: item.event,
                  userId: item.userId,
                })) as T[],
              };
            },
            async run() {
              return { success: true };
            },
          };
        },
      };
    },
  };
  return db as unknown as D1Database;
}

function environment(state: TestState) {
  return { DB: database(state), ENVIRONMENT: 'test', APP_VERSION: 'test' };
}
async function request<T>(
  path: string,
  state: TestState,
): Promise<{ status: number; body: T }> {
  try {
    const response = await app.fetch(
      new Request(`http://localhost${path}`, {
        headers: {
          Cookie: 'corsteno_session=test-session',
          'X-Organization-Id': 'org-a',
        },
      }),
      environment(state),
    );
    const body =
      response.status === 404
        ? (undefined as unknown as T)
        : ((await response.json()) as T);
    return { status: response.status, body };
  } catch (error) {
    if (error instanceof Response)
      return { status: error.status, body: undefined as unknown as T };
    throw error;
  }
}
function state(events = baseEvents()): TestState {
  return { events, scopes };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Analytics deterministic summary', () => {
  it('returns applications with safe type and organization scope', async () => {
    const result = await request<
      Array<{ applicationType: string; organizationId: string }>
    >('/applications', state());
    expect(result.status).toBe(200);
    expect(result.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          applicationType: 'webar',
          organizationId: 'org-a',
        }),
        expect.objectContaining({
          applicationType: 'generic',
          organizationId: 'org-a',
        }),
      ]),
    );
    expect(result.body.every((item) => item.organizationId === 'org-a')).toBe(
      true,
    );
  });
  it('calculates users, sessions, opens, games, prizes and rates', async () => {
    const result = await request<{
      totals: Record<string, number>;
      rates: Record<string, number>;
    }>('/analytics/summary?range=all', state());
    expect(result.status).toBe(200);
    expect(result.body.totals).toMatchObject({
      uniqueUsers: 4,
      sessions: 4,
      appOpens: 4,
      gamesStarted: 3,
      gamesFinished: 2,
      prizesWon: 1,
      prizesClaimed: 1,
    });
    expect(result.body.rates).toEqual({
      completion: 2 / 3,
      prizeConversion: 1 / 3,
    });
  });
  it('uses zero-safe rates when no games started', async () => {
    const result = await request<{
      totals: Record<string, number>;
      rates: Record<string, number>;
    }>('/analytics/summary?range=all&projectId=a2', state([]));
    expect(result.body.rates).toEqual({ completion: 0, prizeConversion: 0 });
    expect(result.body.totals.gamesStarted).toBe(0);
  });
});

describe('Analytics ranges and timeseries', () => {
  it.each(['24h', '7d', '30d', 'all'])('applies range %s', async (range) => {
    const events = [
      ...baseEvents(),
      event(a1, {
        event: 'app_opened',
        userId: 'old',
        sessionId: 'old',
        occurredAt: NOW - 31 * 24 * 60 * 60 * 1000,
      }),
    ];
    const result = await request<{ totals: { appOpens: number } }>(
      `/analytics/summary?range=${range}`,
      state(events),
    );
    expect(result.status).toBe(200);
    expect(result.body.totals.appOpens).toBe(range === 'all' ? 5 : 4);
  });
  it.each(['users', 'events', 'games', 'prizes'] as const)(
    'returns deterministic %s timeseries',
    async (metric) => {
      const result = await request<{
        metric: string;
        points: Array<{ value: number }>;
      }>(`/analytics/timeseries?metric=${metric}&range=24h`, state());
      if (!result.body) throw new Error('expected analytics response');
      expect(result.status).toBe(200);
      expect(result.body.metric).toBe(metric);
      expect(result.body.points.length).toBeGreaterThan(0);
      expect(
        result.body.points.reduce((sum, point) => sum + point.value, 0),
      ).toBe(
        metric === 'users'
          ? 4
          : metric === 'events'
            ? 11
            : metric === 'games'
              ? 5
              : 2,
      );
    },
  );
  it('combines range, project and application filters', async () => {
    const project = await request<{ totals: { gamesStarted: number } }>(
      '/analytics/summary?range=7d&projectId=a1',
      state(),
    );
    const application = await request<{ totals: { gamesStarted: number } }>(
      '/analytics/summary?range=7d&applicationId=a1-app',
      state(),
    );
    if (!project.body || !application.body)
      throw new Error('expected analytics response');
    expect(project.body.totals.gamesStarted).toBe(3);
    expect(application.body.totals.gamesStarted).toBe(2);
  });
});

describe('Analytics recurrence, breakdown and activity', () => {
  it('groups recurrence and excludes anonymous-less events', async () => {
    const events = [
      'userA',
      'userB',
      'userB',
      'userC',
      'userC',
      'userC',
      'userD',
      'userD',
      'userD',
      'userD',
      'userD',
    ].map((userId, index) =>
      event(a1, {
        event: 'game_finished',
        userId,
        sessionId: `s-${userId}`,
        occurredAt: NOW - index,
      }),
    );
    events.push(
      event(a1, {
        event: 'game_finished',
        userId: null,
        sessionId: null,
        occurredAt: NOW,
      }),
    );
    const result = await request<{
      once: number;
      twice: number;
      threeOrMore: number;
    }>('/analytics/recurrence?range=all&projectId=a1', state(events));
    expect(result.body).toEqual({ once: 1, twice: 1, threeOrMore: 2 });
  });
  it.each([
    [
      'game',
      [
        ['roulette', 4],
        ['trivia', 2],
        ['memory', 1],
      ],
    ],
    [
      'prize',
      [
        ['Remera', 3],
        ['Gorra', 2],
        ['Cerveza', 1],
      ],
    ],
    [
      'result',
      [
        ['win', 5],
        ['lose', 3],
      ],
    ],
  ] as const)(
    'returns descending %s breakdown',
    async (dimension, expected) => {
      const events = expected.flatMap(([name, count]) =>
        Array.from({ length: count }, (_, index) =>
          event(a1, {
            event: 'game_finished',
            userId: `u-${name}-${index}`,
            sessionId: `s-${name}-${index}`,
            occurredAt: NOW - index,
            properties: { [dimension]: name },
          }),
        ),
      );
      const result = await request<{
        items: Array<{ name: string; value: number }>;
      }>(
        `/analytics/breakdown?dimension=${dimension}&range=all&projectId=a1`,
        state(events),
      );
      expect(result.body.items).toEqual(
        expected.map(([name, value]) => ({ name, value })),
      );
    },
  );
  it('returns activity newest first and honors limit', async () => {
    const result = await request<Array<{ occurredAt: number }>>(
      '/analytics/activity?range=all&projectId=a1&limit=2',
      state(),
    );
    const [newest, next] = result.body;
    if (!newest || !next) throw new Error('expected two activity rows');
    expect(result.body).toHaveLength(2);
    expect(newest.occurredAt).toBeGreaterThan(next.occurredAt);
  });
});

describe('Analytics isolation and scope validation', () => {
  it('isolates tenant data across summary, activity, timeseries, breakdown and recurrence', async () => {
    const testState = state();
    const summary = await request<{ totals: { gamesFinished: number } }>(
      '/analytics/summary?range=all',
      testState,
    );
    const activity = await request<Array<{ anonymousUserId: string }>>(
      '/analytics/activity?range=all',
      testState,
    );
    const timeseries = await request<{ points: Array<{ value: number }> }>(
      '/analytics/timeseries?metric=events&range=all',
      testState,
    );
    const breakdown = await request<{ items: Array<{ name: string }> }>(
      '/analytics/breakdown?dimension=game&range=all',
      testState,
    );
    const recurrence = await request<{ threeOrMore: number }>(
      '/analytics/recurrence?range=all',
      testState,
    );
    expect(summary.body.totals.gamesFinished).toBe(2);
    expect(
      activity.body.every((item) => item.anonymousUserId !== 'b-user'),
    ).toBe(true);
    expect(
      timeseries.body.points.reduce((sum, point) => sum + point.value, 0),
    ).toBe(11);
    expect(breakdown.body.items.some((item) => item.name === 'other')).toBe(
      false,
    );
    expect(recurrence.body.threeOrMore).toBe(0);
  });
  it('rejects foreign project scope with 404 on every analytics endpoint', async () => {
    for (const path of [
      '/analytics/summary?projectId=b1',
      '/analytics/activity?projectId=b1',
      '/analytics/timeseries?metric=events&projectId=b1',
      '/analytics/breakdown?dimension=game&projectId=b1',
      '/analytics/recurrence?projectId=b1',
    ]) {
      expect((await request(path, state())).status).toBe(404);
    }
  });
  it('rejects foreign application scope with 404 on every analytics endpoint', async () => {
    for (const path of [
      '/analytics/summary?applicationId=b1-app',
      '/analytics/activity?applicationId=b1-app',
      '/analytics/timeseries?metric=events&applicationId=b1-app',
      '/analytics/breakdown?dimension=game&applicationId=b1-app',
      '/analytics/recurrence?applicationId=b1-app',
    ]) {
      expect((await request(path, state())).status).toBe(404);
    }
  });
  it('rejects incompatible project and application scopes', async () => {
    expect(
      (
        await request(
          '/analytics/summary?projectId=a1&applicationId=a3-app',
          state(),
        )
      ).status,
    ).toBe(404);
  });
  it('applies project and application filters to breakdown and recurrence', async () => {
    const breakdown = await request<{ items: Array<{ name: string }> }>(
      '/analytics/breakdown?dimension=game&projectId=a1&applicationId=a1-app&range=all',
      state(),
    );
    const recurrence = await request<{ once: number }>(
      '/analytics/recurrence?projectId=a1&applicationId=a1-app&range=all',
      state(),
    );
    expect(breakdown.body.items.some((item) => item.name === 'memory')).toBe(
      false,
    );
    expect(recurrence.body.once).toBe(2);
  });
});
