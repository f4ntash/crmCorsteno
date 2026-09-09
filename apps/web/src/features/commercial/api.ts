import { apiRequest } from '../../shared/api/client';

export type Plan = { id: string; code: string; name: string; description: string | null; billingInterval: 'monthly' | 'yearly' | 'one_time'; billingIntervalCount: number; includedAccessDays: number | null; priceAmountMinor: number; currency: string; active: number; availableForSale: number; pricingMode: 'paid' | 'free' | 'unconfigured' };
export type Subscription = { id: string; planId: string; planCode: string; planName: string; planDescription: string | null; status: 'pending' | 'active' | 'cancelled' | 'expired'; effectiveStatus: string; startsAt: string; currentPeriodStart: string; currentPeriodEnd: string; cancelAtPeriodEnd: number; priceAmountMinor: number; currency: string; billingInterval: string; billingIntervalCount: number; experiences: Array<{ id: string; name: string; slug: string }>; periods: Array<{ id: string; startsAt: string; endsAt: string; status: string; idempotencyKey: string | null }> };
export type Payment = { id: string; paymentSource: string; paymentMethod: string | null; provider: string | null; status: string; amountMinor: number; currency: string; reference: string | null; note: string | null; createdAt: string; paidAt: string | null };

export const commercialApi = {
  plans: (organizationId: string) => apiRequest<Plan[]>('/plans', organizationId),
  catalog: (organizationId: string) => apiRequest<Plan[]>('/plans/catalog', organizationId),
  updatePlan: (id: string, organizationId: string, body: unknown) => apiRequest<Plan>(`/plans/${id}`, organizationId, { method: 'PATCH', body: JSON.stringify(body) }),
  offlinePayment: (id: string, organizationId: string, body: unknown, idempotencyKey: string) => apiRequest<Subscription>(`/subscriptions/${id}/offline-payments`, organizationId, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(body) }),
  grant: (id: string, organizationId: string, body: unknown) => apiRequest<{ id: string }>(`/subscriptions/${id}/grants`, organizationId, { method: 'POST', body: JSON.stringify(body) }),
  subscriptions: (organizationId: string) => apiRequest<Subscription[]>('/subscriptions', organizationId),
  createSubscription: (organizationId: string, body: unknown) => apiRequest<Subscription>('/subscriptions', organizationId, { method: 'POST', body: JSON.stringify(body) }),
  renew: (id: string, organizationId: string, key: string) => apiRequest<Subscription>(`/subscriptions/${id}/renew`, organizationId, { method: 'POST', headers: { 'Idempotency-Key': key } }),
  checkout: (id: string, organizationId: string) => apiRequest<{ id: string; checkoutUrl: string; status: string }>(`/subscriptions/${id}/checkout`, organizationId, { method: 'POST' }),
  payments: (id: string, organizationId: string) => apiRequest<Payment[]>(`/subscriptions/${id}/payments`, organizationId),
  cancel: (id: string, organizationId: string) => apiRequest<Subscription>(`/subscriptions/${id}/cancel`, organizationId, { method: 'POST' }),
};
