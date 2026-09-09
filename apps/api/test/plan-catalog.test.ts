/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import app from '../src';

type PlanState = { id: string; code: string; name: string; description: string | null; billingInterval: string; billingIntervalCount: number; includedAccessDays: number | null; priceAmountMinor: number; currency: string; active: number; availableForSale: number };

function fixture(platformRole = 'corsteno_admin') {
  const state: PlanState = { id: 'plan-a', code: 'pro', name: 'Pro', description: 'Desc', billingInterval: 'monthly', billingIntervalCount: 1, includedAccessDays: null, priceAmountMinor: 2500000, currency: 'ARS', active: 1, availableForSale: 1 };
  const db = { prepare(sql: string) { return { bind(...args: unknown[]) { const statement: any = { __sql: sql, __args: args };
    statement.first = async () => { if (sql.includes('auth_sessions')) return { session_id: 's', id: 'u', email: 'admin@example.com', name: 'Admin', platformRole, expires_at: Date.now() + 60000 }; if (sql.includes('FROM organizations')) return { id: 'org-a', name: 'A', slug: 'a', role: 'global_admin' }; if (sql.includes('FROM plans')) return state.id === args[0] ? state : null; return null; };
    statement.all = async () => ({ results: sql.includes('FROM plans') ? [state] : [] });
    statement.run = async () => { if (sql.startsWith('UPDATE plans')) { state.name = String(args[0]); state.priceAmountMinor = Number(args[5]); state.currency = String(args[6]); state.active = Number(args[7]); state.availableForSale = Number(args[8]); } return { meta: { changes: 1 } }; };
    return statement; } }; }, async batch() { return []; } };
  return { DB: db, ENVIRONMENT: 'test', APP_VERSION: 'test', __state: state };
}

function request(path: string, env: any, init: RequestInit = {}) { return app.fetch(new Request(`http://localhost${path}`, { ...init, headers: { Cookie: 'corsteno_session=x', 'X-Organization-Id': 'org-a', 'Content-Type': 'application/json', ...(init.headers ?? {}) } }), env); }

describe('commercial plan catalog', () => {
  it('platform admin can update global price and availability', async () => {
    const env = fixture();
    const response = await request('/plans/plan-a', env, { method: 'PATCH', body: JSON.stringify({ name: 'Pro Plus', price_amount_minor: 3000000, currency: 'ARS', available_for_sale: 0 }) });
    expect(response.status).toBe(200);
    expect(env.__state).toMatchObject({ name: 'Pro Plus', priceAmountMinor: 3000000, availableForSale: 0 });
  });

  it('organization administrators cannot mutate the global catalog', async () => {
    expect((await request('/plans/plan-a', fixture('user'), { method: 'PATCH', body: JSON.stringify({ price_amount_minor: 1 }) })).status).toBe(403);
  });

  it('rejects negative, fractional-minor, unsupported-currency and invalid cadence values', async () => {
    const cases = [{ price_amount_minor: -1 }, { price_amount_minor: 10.5 }, { currency: 'EUR' }, { billing_interval: 'weekly' }];
    for (const body of cases) expect((await request('/plans/plan-a', fixture(), { method: 'PATCH', body: JSON.stringify(body) })).status).toBe(400);
  });

  it('catalog access is platform-admin only and preserves stable plan code', async () => {
    const response = await request('/plans/catalog', fixture());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([expect.objectContaining({ code: 'pro', priceAmountMinor: 2500000 })]);
  });
});
