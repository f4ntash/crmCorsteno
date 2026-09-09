/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import app from '../src';

type DbState = {
  plans: any[];
  experiences: any[];
  subscriptions: any[];
  periods: any[];
  links: any[];
  access: any[];
};

function fixture(role = 'owner', platformRole = 'corsteno_admin') {
  const state: DbState = {
    plans: [
      { id: 'plan-month', code: 'monthly', name: 'Monthly', description: 'Example', billingInterval: 'monthly', billingIntervalCount: 1, includedAccessDays: null, priceAmountMinor: 125000, currency: 'ARS', active: 1, pricingMode: 'paid', availableForSale: 1 },
      { id: 'plan-off', code: 'off', name: 'Inactive', description: null, billingInterval: 'yearly', billingIntervalCount: 1, includedAccessDays: null, priceAmountMinor: 1, currency: 'USD', active: 0, pricingMode: 'paid', availableForSale: 0 },
    ],
    experiences: [{ id: 'exp-a', organization_id: 'org-a', name: 'A', slug: 'a' }, { id: 'exp-b', organization_id: 'org-b', name: 'B', slug: 'b' }],
    subscriptions: [], periods: [], links: [], access: [],
  };
  const db = {
    prepare(sql: string) {
      return { bind(...args: any[]) {
        const statement: any = { __sql: sql, __args: args };
        statement.first = async () => {
          if (sql.includes('auth_sessions')) return { session_id: 'session', id: 'user', email: 'u@example.com', name: 'User', platformRole, expires_at: Date.now() + 60000 };
          if (sql.includes('FROM organizations')) return { id: 'org-a', name: 'A', slug: 'a', role };
          if (sql.includes('FROM plans')) return state.plans.find((p) => p.id === args[0]) ?? null;
          if (sql.includes('subscription_periods') && sql.includes('idempotency_key')) return state.periods.find((p) => p.subscriptionId === args[0] && p.organizationId === args[1] && p.idempotencyKey === args[2]) ?? null;
          if (sql.includes('FROM subscriptions s')) {
            const sub = state.subscriptions.find((s) => s.id === args[0] && s.organizationId === args[1]);
            if (!sub) return null;
            const plan = state.plans.find((p) => p.id === sub.planId)!;
            return { ...sub, planCode: plan.code, planName: plan.name, planDescription: plan.description };
          }
          return null;
        };
        statement.all = async () => {
          if (sql.includes('FROM plans')) return { results: state.plans.filter((p) => p.active === 1) };
          if (sql.includes('SELECT id FROM subscriptions')) return { results: state.subscriptions.filter((s) => s.organizationId === args[0]).map((s) => ({ id: s.id })) };
          if (sql.includes('FROM subscription_periods')) return { results: state.periods.filter((p) => p.subscriptionId === args[0] && p.organizationId === args[1]) };
          if (sql.includes('FROM subscription_experiences')) return { results: state.links.filter((l) => l.subscriptionId === args[0] && l.organizationId === args[1]).map((l) => state.experiences.find((e) => e.id === l.experienceId)).filter(Boolean) };
          if (sql.includes('FROM experiences')) return { results: state.experiences.filter((e) => e.organization_id === args[0] && args.slice(1).includes(e.id)).map((e) => ({ id: e.id })) };
          return { results: [] };
        };
        statement.run = async () => {
          if (sql.includes('UPDATE auth_sessions')) return { meta: { changes: 1 } };
          if (sql.startsWith('INSERT INTO subscriptions')) { state.subscriptions.push({ id: args[0], organizationId: args[1], planId: args[2], status: args[3], startsAt: args[4], currentPeriodStart: args[5], currentPeriodEnd: args[6], cancelAtPeriodEnd: args[7], priceAmountMinor: args[8], currency: args[9], billingInterval: args[10], billingIntervalCount: args[11], includedAccessDays: args[12] }); }
          if (sql.startsWith('INSERT') && sql.includes('subscription_periods')) { state.periods.push({ id: args[0], subscriptionId: args[1], organizationId: args[2], startsAt: args[3], endsAt: args[4], status: args[5], idempotencyKey: args[6] ?? null, createdAt: '2026-01-01' }); }
          if (sql.startsWith('INSERT') && sql.includes('subscription_experiences')) state.links.push({ subscriptionId: args[0], experienceId: args[1], organizationId: args[2] });
          if (sql.startsWith('INSERT') && sql.includes('experience_access_periods')) state.access.push({ id: args[0], experienceId: args[1], organizationId: args[2], startsAt: args[3], endsAt: args[4], source: args[5], subscriptionPeriodId: args[8] });
          if (sql.startsWith('UPDATE subscriptions')) { const sub = state.subscriptions.find((s) => s.id === args[args.length - 2]); if (sub) { if (sql.includes('cancel_at_period_end=1')) sub.cancelAtPeriodEnd = 1; else { sub.currentPeriodStart = args[0]; sub.currentPeriodEnd = args[1]; sub.status = 'active'; sub.cancelAtPeriodEnd = 0; } } }
          return { meta: { changes: 1 } };
        };
        return statement;
      } };
    },
    async batch(statements: any[]) { for (const statement of statements) await statement.run(); return statements.map(() => ({ meta: { changes: 1 } })); },
  };
  return { DB: db, ENVIRONMENT: 'test', APP_VERSION: 'test', __state: state };
}

function request(path: string, env: any, init: RequestInit = {}) {
  return app.fetch(new Request(`http://localhost${path}`, { ...init, headers: { Cookie: 'corsteno_session=x', 'X-Organization-Id': 'org-a', 'Content-Type': 'application/json', ...(init.headers ?? {}) } }), env);
}

describe('commercial plans and subscriptions', () => {
  it('lists only active plans and stores integer price snapshots', async () => {
    const env = fixture();
    const plans = await request('/plans', env);
    expect(await plans.json()).toHaveLength(1);
    const created = await request('/subscriptions', env, { method: 'POST', body: JSON.stringify({ plan_id: 'plan-month', experience_ids: ['exp-a'], starts_at: '2026-09-10T00:00:00Z', organization_id: 'org-b' }) });
    expect(created.status).toBe(201);
    const body = await created.json() as any;
    expect(body.priceAmountMinor).toBe(125000);
    expect(body.currentPeriodEnd).toBe('2026-10-10T00:00:00.000Z');
    expect(env.__state.access).toEqual([expect.objectContaining({ source: 'subscription', experienceId: 'exp-a' })]);
    expect((await request('/subscriptions', env, { method: 'POST', body: JSON.stringify({ plan_id: 'plan-off', experience_ids: ['exp-a'], starts_at: '2026-09-10T00:00:00Z' }) })).status).toBe(400);
  });

  it('requires manage permission and rejects foreign experiences', async () => {
    expect((await request('/subscriptions', fixture('member'), { method: 'POST', body: JSON.stringify({ plan_id: 'plan-month', experience_ids: ['exp-a'], starts_at: '2026-09-10T00:00:00Z' }) })).status).toBe(403);
    expect((await request('/subscriptions', fixture(), { method: 'POST', body: JSON.stringify({ plan_id: 'plan-month', experience_ids: ['exp-b'], starts_at: '2026-09-10T00:00:00Z' }) })).status).toBe(404);
    expect((await app.fetch(new Request('http://localhost/plans'), fixture())).status).toBe(401);
  });

  it('renews idempotently and cancels without deleting current entitlement', async () => {
    const env = fixture();
    const created = await request('/subscriptions', env, { method: 'POST', body: JSON.stringify({ plan_id: 'plan-month', experience_ids: ['exp-a'], starts_at: '2099-09-10T00:00:00Z' }) });
    const subscription = await created.json() as any;
    const first = await request(`/subscriptions/${subscription.id}/renew`, env, { method: 'POST', headers: { 'Idempotency-Key': 'renew-1' } });
    expect(first.status).toBe(200);
    const count = env.__state.periods.length;
    expect((await request(`/subscriptions/${subscription.id}/renew`, env, { method: 'POST', headers: { 'Idempotency-Key': 'renew-1' } })).status).toBe(200);
    expect(env.__state.periods).toHaveLength(count);
    expect((await request(`/subscriptions/${subscription.id}/cancel`, env, { method: 'POST' })).status).toBe(200);
    expect(env.__state.access.length).toBe(2);
  });
});
