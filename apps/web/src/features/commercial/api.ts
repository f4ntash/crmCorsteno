import { apiRequest } from '../../shared/api/client';

export type Plan = { id: string; code: string; name: string; description: string | null; billingInterval: 'monthly' | 'yearly' | 'one_time'; billingIntervalCount: number; includedAccessDays: number | null; priceAmountMinor: number; currency: string; active: number };
export type Subscription = { id: string; planId: string; planCode: string; planName: string; planDescription: string | null; status: 'pending' | 'active' | 'cancelled' | 'expired'; effectiveStatus: string; startsAt: string; currentPeriodStart: string; currentPeriodEnd: string; cancelAtPeriodEnd: number; priceAmountMinor: number; currency: string; billingInterval: string; billingIntervalCount: number; experiences: Array<{ id: string; name: string; slug: string }>; periods: Array<{ id: string; startsAt: string; endsAt: string; status: string; idempotencyKey: string | null }> };

export const commercialApi = {
  plans: (organizationId: string) => apiRequest<Plan[]>('/plans', organizationId),
  subscriptions: (organizationId: string) => apiRequest<Subscription[]>('/subscriptions', organizationId),
  createSubscription: (organizationId: string, body: unknown) => apiRequest<Subscription>('/subscriptions', organizationId, { method: 'POST', body: JSON.stringify(body) }),
  renew: (id: string, organizationId: string, key: string) => apiRequest<Subscription>(`/subscriptions/${id}/renew`, organizationId, { method: 'POST', headers: { 'Idempotency-Key': key } }),
  cancel: (id: string, organizationId: string) => apiRequest<Subscription>(`/subscriptions/${id}/cancel`, organizationId, { method: 'POST' }),
};
