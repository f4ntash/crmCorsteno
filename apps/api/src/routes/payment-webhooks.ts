import { Hono } from 'hono';
import type { Env } from '../index';
import { createMercadoPagoProvider } from '../payments/mercado-pago';
import { renewSubscription } from '../services/commercial-renewal';

type WebhookSubscription = {
  id: string;
  organizationId: string;
  status: 'pending' | 'active' | 'cancelled' | 'expired';
  currentPeriodEnd: string;
  cancelAtPeriodEnd: number;
  billingInterval: 'monthly' | 'yearly' | 'one_time';
  billingIntervalCount: number;
  includedAccessDays: number | null;
};

export const paymentWebhookRoutes = new Hono<{ Bindings: Env }>();

paymentWebhookRoutes.post('/webhooks/mercado-pago', async (c) => {
  const provider = createMercadoPagoProvider(c.env);
  if (!(await provider.verifyWebhook(c.req.raw))) return c.json({ error: { code: 'INVALID_WEBHOOK', message: 'Invalid webhook signature' } }, 401);
  const body = await c.req.json().catch(() => ({})) as { type?: string; data?: { id?: string | number } };
  const type = body.type ?? c.req.query('type');
  const providerPaymentId = String(body.data?.id ?? c.req.query('data.id') ?? '');
  if (type !== 'payment' || !providerPaymentId) return c.json({ received: true });
  let providerPayment;
  try { providerPayment = await provider.getPayment(providerPaymentId); } catch { return c.json({ error: { code: 'PROVIDER_LOOKUP_FAILED', message: 'Payment lookup failed' } }, 502); }
  const payment = await c.env.DB.prepare('SELECT id,organization_id organizationId,subscription_id subscriptionId,provider_payment_id providerPaymentId,status,amount_minor amountMinor,currency FROM commercial_payments WHERE provider=? AND (provider_payment_id=? OR id=?)').bind('mercado_pago', providerPaymentId, providerPayment.externalReference ?? '').first<{ id: string; organizationId: string; subscriptionId: string; providerPaymentId: string | null; status: string; amountMinor: number; currency: string }>();
  if (!payment) return c.json({ received: true });
  if (payment.providerPaymentId && payment.providerPaymentId !== providerPaymentId) return c.json({ received: true });
  if (providerPayment.status !== 'approved') {
    await c.env.DB.prepare('UPDATE commercial_payments SET provider_payment_id=?,provider_status=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status=?').bind(providerPaymentId, providerPayment.providerStatus, providerPayment.status, payment.id, 'pending').run();
    return c.json({ received: true, status: providerPayment.status });
  }
  if (providerPayment.amountMinor !== Number(payment.amountMinor) || providerPayment.currency !== payment.currency) {
    await c.env.DB.prepare("UPDATE commercial_payments SET provider_payment_id=?,provider_status='amount_mismatch',status='rejected',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'").bind(providerPaymentId, payment.id).run();
    return c.json({ received: true, status: 'rejected' });
  }
  const subscription = await c.env.DB.prepare('SELECT s.id,s.organization_id organizationId,s.status,s.current_period_end currentPeriodEnd,s.cancel_at_period_end cancelAtPeriodEnd,s.billing_interval billingInterval,s.billing_interval_count billingIntervalCount,s.included_access_days includedAccessDays FROM subscriptions s WHERE s.id=? AND s.organization_id=?').bind(payment.subscriptionId, payment.organizationId).first<WebhookSubscription>();
  if (!subscription) return c.json({ received: true });
  const experiences = await c.env.DB.prepare('SELECT experience_id id FROM subscription_experiences WHERE subscription_id=? AND organization_id=?').bind(payment.subscriptionId, payment.organizationId).all<{ id: string }>();
  const paymentUpdate = c.env.DB.prepare("UPDATE commercial_payments SET provider_payment_id=?,provider_status=?,status='approved',paid_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'").bind(providerPaymentId, providerPayment.providerStatus, providerPayment.paidAt ?? new Date().toISOString(), payment.id);
  await renewSubscription(c.env.DB, { ...subscription, experiences: experiences.results }, 'mercado-pago-webhook', `payment:${payment.id}`, payment.id, Date.now(), [paymentUpdate]);
  return c.json({ received: true, status: 'approved' });
});
