import type { CheckoutInput, PaymentProvider, ProviderPayment } from './types';

type MercadoPagoEnv = { MERCADO_PAGO_ACCESS_TOKEN?: string; MERCADO_PAGO_WEBHOOK_SECRET?: string; MERCADO_PAGO_API_URL?: string; PUBLIC_WEBHOOK_URL?: string; PAYMENT_SUCCESS_URL?: string; PAYMENT_FAILURE_URL?: string; PAYMENT_PENDING_URL?: string };
const apiRoot = (env: MercadoPagoEnv) => (env.MERCADO_PAGO_API_URL ?? 'https://api.mercadopago.com').replace(/\/$/, '');

function internalStatus(status: string) {
  if (status === 'approved') return 'approved' as const;
  if (status === 'rejected') return 'rejected' as const;
  if (status === 'cancelled' || status === 'cancelled_by_user') return 'cancelled' as const;
  if (status === 'refunded' || status === 'charged_back') return 'refunded' as const;
  return 'pending' as const;
}

async function mpFetch(env: MercadoPagoEnv, path: string, init?: RequestInit) {
  if (!env.MERCADO_PAGO_ACCESS_TOKEN) throw new Error('Mercado Pago is not configured');
  const response = await fetch(`${apiRoot(env)}${path}`, { ...init, headers: { Authorization: `Bearer ${env.MERCADO_PAGO_ACCESS_TOKEN}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error(`Mercado Pago request failed (${response.status})`);
  return response.json() as Promise<Record<string, unknown>>;
}

export function createMercadoPagoProvider(env: MercadoPagoEnv): PaymentProvider {
  return {
    name: 'mercado_pago',
    async createCheckout(input: CheckoutInput) {
      const body: Record<string, unknown> = {
        items: [{ id: input.subscriptionId, title: input.title, quantity: 1, currency_id: input.currency, unit_price: input.amountMinor / 100 }],
        external_reference: input.paymentId,
      };
      const backUrls = Object.fromEntries(Object.entries({ success: env.PAYMENT_SUCCESS_URL, failure: env.PAYMENT_FAILURE_URL, pending: env.PAYMENT_PENDING_URL }).filter(([, value]) => Boolean(value)));
      if (Object.keys(backUrls).length) body.back_urls = backUrls;
      if (env.PUBLIC_WEBHOOK_URL) body.notification_url = env.PUBLIC_WEBHOOK_URL;
      const result = await mpFetch(env, '/checkout/preferences', { method: 'POST', body: JSON.stringify(body) });
      const checkoutId = typeof result.id === 'string' ? result.id : '';
      const checkoutUrl = typeof result.init_point === 'string' ? result.init_point : typeof result.sandbox_init_point === 'string' ? result.sandbox_init_point : '';
      if (!checkoutId || !checkoutUrl) throw new Error('Mercado Pago returned an invalid checkout');
      return { checkoutId, checkoutUrl };
    },
    async getPayment(providerPaymentId: string): Promise<ProviderPayment> {
      const result = await mpFetch(env, `/v1/payments/${encodeURIComponent(providerPaymentId)}`);
      return { providerPaymentId, providerStatus: String(result.status ?? 'unknown'), status: internalStatus(String(result.status ?? 'pending')), amountMinor: Math.round(Number(result.transaction_amount ?? 0) * 100), currency: String(result.currency_id ?? ''), externalReference: typeof result.external_reference === 'string' ? result.external_reference : null, paidAt: typeof result.date_approved === 'string' ? result.date_approved : null };
    },
    async verifyWebhook(request: Request) {
      const secret = env.MERCADO_PAGO_WEBHOOK_SECRET;
      if (!secret) return false;
      const signature = request.headers.get('x-signature') ?? '';
      const requestId = request.headers.get('x-request-id') ?? '';
      const dataId = new URL(request.url).searchParams.get('data.id') ?? '';
      const parts = Object.fromEntries(signature.split(',').map((part) => part.split('=').map((value) => value.trim())).filter((part): part is [string, string] => part.length === 2));
      const ts = parts.ts;
      const v1 = parts.v1;
      if (!ts || !v1 || !dataId) return false;
      const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
      const bytes = await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), new TextEncoder().encode(manifest));
      const expected = [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
      return expected.length === v1.length && expected === v1;
    },
  };
}
