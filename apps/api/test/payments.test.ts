/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import app from '../src';
import { createMercadoPagoProvider } from '../src/payments/mercado-pago';

function subscription(overrides: Record<string, unknown> = {}) {
  return { id: 'sub-a', organizationId: 'org-a', planId: 'plan-a', status: 'active', startsAt: '2026-01-01T00:00:00.000Z', currentPeriodStart: '2026-01-01T00:00:00.000Z', currentPeriodEnd: '2026-10-01T00:00:00.000Z', cancelAtPeriodEnd: 0, priceAmountMinor: 125000, currency: 'ARS', billingInterval: 'monthly', billingIntervalCount: 1, includedAccessDays: null, planCode: 'pro', planName: 'Pro', planDescription: null, pricingMode: 'paid', ...overrides };
}

function fixture(row = subscription()) {
  const payments: any[] = [];
  const db = { prepare(sql: string) { return { bind(...args: any[]) { const statement: any = { __sql: sql, __args: args };
    statement.first = async () => {
      if (sql.includes('auth_sessions')) return { session_id: 'session', id: 'user', email: 'u@example.com', name: 'User', platformRole: 'user', expires_at: Date.now() + 60000 };
      if (sql.includes('FROM organizations')) return { id: 'org-a', name: 'A', slug: 'a', role: 'owner' };
      if (sql.includes('FROM subscriptions s')) return row.id === args[0] && row.organizationId === args[1] ? row : null;
      return null;
    };
    statement.all = async () => sql.includes('subscription_experiences') ? { results: [{ id: 'exp-a' }] } : { results: [] };
    statement.run = async () => { if (sql.includes('commercial_payments')) payments.push({ id: args[0], organizationId: args[1], subscriptionId: args[2], provider: args[3], checkoutId: args[4], status: args[5], amountMinor: args[6], currency: args[7] }); return { meta: { changes: 1 } }; };
    return statement; } }; }, async batch() { return []; } };
  return { DB: db, ENVIRONMENT: 'test', APP_VERSION: 'test', __payments: payments };
}

function request(path: string, env: any, init: RequestInit = {}) { return app.fetch(new Request(`http://localhost${path}`, { ...init, headers: { Cookie: 'corsteno_session=x', 'X-Organization-Id': 'org-a', 'Content-Type': 'application/json', ...(init.headers ?? {}) } }), env); }

describe('Mercado Pago payment foundation', () => {
  it('creates a provider checkout from server-side amount and opaque reference', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'pref-1', init_point: 'https://mp.example/checkout' }), { status: 201 }));
    const provider = createMercadoPagoProvider({ MERCADO_PAGO_ACCESS_TOKEN: 'token', MERCADO_PAGO_API_URL: 'https://mp.example' });
    const result = await provider.createCheckout({ paymentId: 'payment-1', subscriptionId: 'sub-1', title: 'Pro - renovación', amountMinor: 125000, currency: 'ARS' });
    expect(result.checkoutUrl).toBe('https://mp.example/checkout');
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.external_reference).toBe('payment-1');
    expect(body.items[0]).toMatchObject({ currency_id: 'ARS', unit_price: 1250, quantity: 1 });
    fetchMock.mockRestore();
  });

  it('creates a pending payment for a tenant-owned paid subscription', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'pref-1', init_point: 'https://mp.example/checkout' }), { status: 201 }));
    const env = fixture() as any; env.MERCADO_PAGO_ACCESS_TOKEN = 'token'; env.MERCADO_PAGO_API_URL = 'https://mp.example';
    const response = await request('/subscriptions/sub-a/checkout', env, { method: 'POST', body: JSON.stringify({ amount: 1, currency: 'USD', organization_id: 'org-b' }) });
    expect(response.status).toBe(201);
    expect(env.__payments[0]).toMatchObject({ subscriptionId: 'sub-a', amountMinor: 125000, currency: 'ARS', status: 'pending' });
    vi.restoreAllMocks();
  });

  it('rejects zero-price checkout and cross-tenant subscriptions', async () => {
    const zero = await request('/subscriptions/sub-a/checkout', fixture(subscription({ priceAmountMinor: 0 })), { method: 'POST' });
    expect(zero.status).toBe(400);
    const foreign = await request('/subscriptions/sub-b/checkout', fixture(), { method: 'POST' });
    expect(foreign.status).toBe(404);
  });

  it('validates Mercado Pago x-signature using the documented manifest', async () => {
    const secret = 'webhook-secret'; const ts = '1700000000'; const dataId = '123'; const requestId = 'request-1';
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`id:${dataId};request-id:${requestId};ts:${ts};`));
    const signature = [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
    const provider = createMercadoPagoProvider({ MERCADO_PAGO_WEBHOOK_SECRET: secret });
    const request = new Request(`https://api.example/webhooks/mercado-pago?type=payment&data.id=${dataId}`, { headers: { 'x-signature': `ts=${ts},v1=${signature}`, 'x-request-id': requestId } });
    expect(await provider.verifyWebhook(request)).toBe(true);
    expect(await provider.verifyWebhook(new Request(request.url, { headers: { 'x-signature': 'ts=1,v1=bad', 'x-request-id': requestId } }))).toBe(false);
  });
});
