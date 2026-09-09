import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { requireAuth, requireOrganization, requireOrganizationPermission } from '../auth/middleware';
import type { Env } from '../index';
import { addBillingInterval, getEffectiveSubscriptionStatus, type BillingInterval } from '../services/subscription-periods';
import { renewSubscription } from '../services/commercial-renewal';
import { createMercadoPagoProvider } from '../payments/mercado-pago';
import { grantPeriod, grantSubscriptionPeriod, type GrantType } from '../services/commercial-grants';
import { entitlementsForPlan, parseSubscriptionEntitlements } from '../services/commercial-entitlements';

type Variables = {
  user: { id: string; email: string; name: string; platformRole: string };
  organization: { id: string; name: string; slug: string; role: string };
};
type Plan = { id: string; code: string; name: string; description: string | null; billingInterval: BillingInterval; billingIntervalCount: number; includedAccessDays: number | null; priceAmountMinor: number; currency: string; active: number; availableForSale: number; pricingMode: 'paid' | 'free' | 'unconfigured' };
type SubscriptionPeriod = { id: string; subscriptionId: string; organizationId: string; startsAt: string; endsAt: string; status: string; idempotencyKey: string | null; createdAt: string };
type Subscription = { id: string; organizationId: string; planId: string; status: 'pending' | 'active' | 'cancelled' | 'expired'; startsAt: string; currentPeriodStart: string; currentPeriodEnd: string; cancelAtPeriodEnd: number; priceAmountMinor: number; currency: string; billingInterval: BillingInterval; billingIntervalCount: number; includedAccessDays: number | null; planCode: string; planName: string; planDescription: string | null; pricingMode: 'paid' | 'free' | 'unconfigured'; featureEntitlementsJson: string | null };

export const commercialRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
function isCommercialPath(path: string) { return path === '/plans' || path.startsWith('/plans/') || path.startsWith('/subscriptions'); }
commercialRoutes.use('*', async (c, next) => {
  if (!isCommercialPath(c.req.path)) return next();
  const auth = requireAuth as unknown as MiddlewareHandler<{ Bindings: Env; Variables: Variables }>;
  const organization = requireOrganization as unknown as MiddlewareHandler<{ Bindings: Env; Variables: Variables }>;
  return auth(c, async () => { await organization(c, next); });
});
commercialRoutes.use('*', async (c, next) => {
  if (!isCommercialPath(c.req.path)) return next();
  if (c.req.path.startsWith('/subscriptions') && !isPlatformOperator(c.get('user').platformRole)) return c.json({ error: { code: 'FORBIDDEN', message: 'Platform administrator required' } }, 403);
  const permission = (c.req.method === 'GET' ? requireOrganizationPermission('crm.read') : requireOrganizationPermission('crm.manage')) as unknown as MiddlewareHandler<{ Bindings: Env; Variables: Variables }>;
  return permission(c, next);
});

function bad(message: string) { return { error: { code: 'BAD_REQUEST', message } }; }
function presentPlan(row: Record<string, unknown>): Plan { return { id: String(row.id), code: String(row.code), name: String(row.name), description: row.description as string | null, billingInterval: row.billingInterval as BillingInterval, billingIntervalCount: Number(row.billingIntervalCount), includedAccessDays: row.includedAccessDays === null ? null : Number(row.includedAccessDays), priceAmountMinor: Number(row.priceAmountMinor), currency: String(row.currency), active: Number(row.active), availableForSale: Number(row.availableForSale ?? 1), pricingMode: (row.pricingMode ?? 'unconfigured') as Plan['pricingMode'] }; }
function isPlatformOperator(platformRole: string) { return ['super_admin', 'corsteno_admin'].includes(platformRole); }
function presentPeriod(row: Record<string, unknown>): SubscriptionPeriod { return { id: String(row.id), subscriptionId: String(row.subscriptionId), organizationId: String(row.organizationId), startsAt: String(row.startsAt), endsAt: String(row.endsAt), status: String(row.status), idempotencyKey: row.idempotencyKey as string | null, createdAt: String(row.createdAt) }; }

async function getSubscription(db: D1Database, id: string, organizationId: string) {
  const row = await db.prepare(`SELECT s.id,s.organization_id organizationId,s.plan_id planId,s.status,s.starts_at startsAt,s.current_period_start currentPeriodStart,s.current_period_end currentPeriodEnd,s.cancel_at_period_end cancelAtPeriodEnd,s.price_amount_minor priceAmountMinor,s.currency,s.billing_interval billingInterval,s.billing_interval_count billingIntervalCount,s.included_access_days includedAccessDays,s.feature_entitlements_json featureEntitlementsJson,p.code planCode,p.name planName,p.description planDescription,p.pricing_mode pricingMode FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.id=? AND s.organization_id=?`).bind(id, organizationId).first<Subscription>();
  if (!row) return null;
  const periods = await db.prepare('SELECT id,subscription_id subscriptionId,organization_id organizationId,starts_at startsAt,ends_at endsAt,status,idempotency_key idempotencyKey,created_at createdAt FROM subscription_periods WHERE subscription_id=? AND organization_id=? ORDER BY starts_at DESC, id DESC').bind(id, organizationId).all<Record<string, unknown>>();
  const experiences = await db.prepare('SELECT e.id,e.name,e.slug FROM subscription_experiences se JOIN experiences e ON e.id=se.experience_id WHERE se.subscription_id=? AND se.organization_id=? ORDER BY e.created_at DESC').bind(id, organizationId).all<{ id: string; name: string; slug: string }>();
  const { featureEntitlementsJson, ...subscription } = row;
  return { ...subscription, featureEntitlements: parseSubscriptionEntitlements(featureEntitlementsJson), effectiveStatus: getEffectiveSubscriptionStatus(row.status, row.currentPeriodEnd), periods: periods.results.map(presentPeriod), experiences: experiences.results };
}

commercialRoutes.get('/plans', async (c) => {
  const rows = await c.env.DB.prepare("SELECT id,code,name,description,billing_interval billingInterval,billing_interval_count billingIntervalCount,included_access_days includedAccessDays,price_amount_minor priceAmountMinor,currency,active,available_for_sale availableForSale,pricing_mode pricingMode FROM plans WHERE active=1 AND available_for_sale=1 AND pricing_mode IN ('paid','free') AND (pricing_mode='free' OR price_amount_minor>0) ORDER BY price_amount_minor ASC, name ASC").bind().all<Record<string, unknown>>();
  return c.json(rows.results.map(presentPlan));
});

commercialRoutes.get('/plans/catalog', async (c) => {
  if (!isPlatformOperator(c.get('user').platformRole)) return c.json({ error: { code: 'FORBIDDEN', message: 'Platform administrator required' } }, 403);
  const rows = await c.env.DB.prepare('SELECT id,code,name,description,billing_interval billingInterval,billing_interval_count billingIntervalCount,included_access_days includedAccessDays,price_amount_minor priceAmountMinor,currency,active,available_for_sale availableForSale,pricing_mode pricingMode FROM plans ORDER BY active DESC, available_for_sale DESC, price_amount_minor ASC, name ASC').bind().all<Record<string, unknown>>();
  return c.json(rows.results.map(presentPlan));
});

commercialRoutes.patch('/plans/:id', async (c) => {
  if (!isPlatformOperator(c.get('user').platformRole)) return c.json({ error: { code: 'FORBIDDEN', message: 'Platform administrator required' } }, 403);
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json(bad('Invalid JSON body'), 400); }
  const existing = await c.env.DB.prepare('SELECT id,code,name,description,billing_interval billingInterval,billing_interval_count billingIntervalCount,included_access_days includedAccessDays,price_amount_minor priceAmountMinor,currency,active,available_for_sale availableForSale FROM plans WHERE id=?').bind(c.req.param('id')).first<Record<string, unknown>>();
  if (!existing) return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
  const name = typeof body.name === 'string' ? body.name.trim() : String(existing.name);
  const description = body.description === null || typeof body.description === 'string' ? body.description : existing.description;
  const price = body.price_amount_minor === undefined ? Number(existing.priceAmountMinor) : body.price_amount_minor;
  const currency = typeof body.currency === 'string' ? body.currency.toUpperCase() : String(existing.currency);
  const interval = body.billing_interval === undefined ? existing.billingInterval : body.billing_interval;
  const count = body.billing_interval_count === undefined ? Number(existing.billingIntervalCount) : body.billing_interval_count;
  const includedDays = body.included_access_days === undefined ? (existing.includedAccessDays === null ? null : Number(existing.includedAccessDays)) : body.included_access_days;
  const active = body.active === undefined ? Number(existing.active) : body.active;
  const available = body.available_for_sale === undefined ? Number(existing.availableForSale ?? 1) : body.available_for_sale;
  const pricingMode = body.pricing_mode === undefined ? String(existing.pricingMode ?? 'unconfigured') : body.pricing_mode;
  if (!name || !Number.isSafeInteger(price) || Number(price) < 0 || !['ARS', 'USD'].includes(currency) || !['monthly', 'yearly', 'one_time'].includes(String(interval)) || !Number.isInteger(count) || Number(count) < 1 || (interval === 'one_time' && (!Number.isInteger(includedDays) || Number(includedDays) < 1)) || ![0, 1].includes(Number(active)) || ![0, 1].includes(Number(available)) || !['paid', 'free', 'unconfigured'].includes(String(pricingMode)) || (pricingMode === 'paid' && Number(price) <= 0) || (pricingMode === 'free' && Number(price) !== 0)) return c.json(bad('Invalid plan commercial fields'), 400);
  await c.env.DB.prepare('UPDATE plans SET name=?,description=?,billing_interval=?,billing_interval_count=?,included_access_days=?,price_amount_minor=?,currency=?,active=?,available_for_sale=?,pricing_mode=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(name, description, interval, count, includedDays, price, currency, active, available, pricingMode, c.req.param('id')).run();
  return c.json(presentPlan({ ...existing, name, description, billingInterval: interval, billingIntervalCount: count, includedAccessDays: includedDays, priceAmountMinor: price, currency, active, availableForSale: available, pricingMode }));
});

commercialRoutes.get('/subscriptions', async (c) => {
  const rows = await c.env.DB.prepare('SELECT id FROM subscriptions WHERE organization_id=? ORDER BY created_at DESC, id DESC').bind(c.get('organization').id).all<{ id: string }>();
  return c.json(await Promise.all(rows.results.map((row) => getSubscription(c.env.DB, row.id, c.get('organization').id))));
});

commercialRoutes.get('/subscriptions/:id', async (c) => {
  const subscription = await getSubscription(c.env.DB, c.req.param('id'), c.get('organization').id);
  if (!subscription) return c.json({ error: { code: 'NOT_FOUND', message: 'Subscription not found' } }, 404);
  return c.json(subscription);
});

commercialRoutes.post('/subscriptions', async (c) => {
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return c.json(bad('Invalid JSON body'), 400); }
  const organizationId = c.get('organization').id;
  const planId = typeof body.plan_id === 'string' ? body.plan_id : '';
  const experienceIds = Array.isArray(body.experience_ids) ? body.experience_ids.filter((value): value is string => typeof value === 'string' && !!value) : [];
  const uniqueExperienceIds = [...new Set(experienceIds)];
  if (!planId) return c.json(bad('plan_id is required'), 400);
  if (!uniqueExperienceIds.length) return c.json(bad('At least one experience is required'), 400);
  if (uniqueExperienceIds.length !== experienceIds.length) return c.json(bad('Duplicate experience attachments are not allowed'), 400);
  const planRow = await c.env.DB.prepare('SELECT id,code,name,description,billing_interval billingInterval,billing_interval_count billingIntervalCount,included_access_days includedAccessDays,price_amount_minor priceAmountMinor,currency,active,available_for_sale availableForSale,pricing_mode pricingMode FROM plans WHERE id=?').bind(planId).first<Record<string, unknown>>();
  if (!planRow) return c.json({ error: { code: 'NOT_FOUND', message: 'Plan not found' } }, 404);
  const plan = presentPlan(planRow);
  if (!plan.active || !plan.availableForSale || plan.pricingMode === 'unconfigured' || (plan.pricingMode === 'paid' && plan.priceAmountMinor <= 0) || (plan.pricingMode === 'free' && plan.priceAmountMinor !== 0)) return c.json(bad('Plan is not available for sale'), 400);
  const planEntitlements = entitlementsForPlan(plan.code);
  if (planEntitlements?.maxActiveExperiences !== null && planEntitlements && uniqueExperienceIds.length > planEntitlements.maxActiveExperiences) return c.json(bad(`This plan allows up to ${planEntitlements.maxActiveExperiences} experiences`), 400);
  const startValue = body.starts_at;
  if (typeof startValue !== 'string' || !Number.isFinite(new Date(startValue).getTime())) return c.json(bad('A valid starts_at is required'), 400);
  const startsAt = new Date(startValue);
  const endsAt = addBillingInterval(startsAt, plan.billingInterval, plan.billingIntervalCount, plan.includedAccessDays);
  const placeholders = uniqueExperienceIds.map(() => '?').join(',');
  const experiences = await c.env.DB.prepare(`SELECT id FROM experiences WHERE organization_id=? AND id IN (${placeholders})`).bind(organizationId, ...uniqueExperienceIds).all<{ id: string }>();
  if (experiences.results.length !== uniqueExperienceIds.length) return c.json({ error: { code: 'NOT_FOUND', message: 'One or more experiences not found' } }, 404);
  const subscriptionId = crypto.randomUUID();
  const periodId = crypto.randomUUID();
  const featureEntitlements = planEntitlements;
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare('INSERT INTO subscriptions (id,organization_id,plan_id,status,starts_at,current_period_start,current_period_end,cancel_at_period_end,price_amount_minor,currency,billing_interval,billing_interval_count,included_access_days,feature_entitlements_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(subscriptionId, organizationId, plan.id, 'active', startsAt.toISOString(), startsAt.toISOString(), endsAt.toISOString(), 0, plan.priceAmountMinor, plan.currency, plan.billingInterval, plan.billingIntervalCount, plan.includedAccessDays, featureEntitlements ? JSON.stringify(featureEntitlements) : null),
    c.env.DB.prepare('INSERT INTO subscription_periods (id,subscription_id,organization_id,starts_at,ends_at,status) VALUES (?,?,?,?,?,?)').bind(periodId, subscriptionId, organizationId, startsAt.toISOString(), endsAt.toISOString(), 'active'),
  ];
  for (const experienceId of uniqueExperienceIds) {
    statements.push(c.env.DB.prepare('INSERT INTO subscription_experiences (subscription_id,experience_id,organization_id) VALUES (?,?,?)').bind(subscriptionId, experienceId, organizationId));
    statements.push(c.env.DB.prepare('INSERT INTO experience_access_periods (id,experience_id,organization_id,starts_at,ends_at,source,created_by,note,subscription_period_id) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), experienceId, organizationId, startsAt.toISOString(), endsAt.toISOString(), 'subscription', c.get('user').id, `Subscription ${subscriptionId}`, periodId));
  }
  await c.env.DB.batch(statements);
  return c.json(await getSubscription(c.env.DB, subscriptionId, organizationId), 201);
});

commercialRoutes.post('/subscriptions/:id/renew', async (c) => {
  if (!isPlatformOperator(c.get('user').platformRole)) return c.json({ error: { code: 'FORBIDDEN', message: 'Platform commercial operator required' } }, 403);
  const organizationId = c.get('organization').id;
  const subscription = await getSubscription(c.env.DB, c.req.param('id'), organizationId);
  if (!subscription) return c.json({ error: { code: 'NOT_FOUND', message: 'Subscription not found' } }, 404);
  if (subscription.status === 'cancelled' || subscription.cancelAtPeriodEnd) return c.json({ error: { code: 'CONFLICT', message: 'Cancelled subscriptions cannot be renewed' } }, 409);
  const key = c.req.header('Idempotency-Key')?.trim();
  if (!key || key.length > 200) return c.json(bad('Idempotency-Key is required for renewal'), 400);
  await renewSubscription(c.env.DB, subscription, c.get('user').id, key);
  return c.json(await getSubscription(c.env.DB, subscription.id, organizationId));
});

commercialRoutes.post('/subscriptions/:id/checkout', async (c) => {
  const organizationId = c.get('organization').id;
  const subscription = await getSubscription(c.env.DB, c.req.param('id'), organizationId);
  if (!subscription) return c.json({ error: { code: 'NOT_FOUND', message: 'Subscription not found' } }, 404);
  if (subscription.status === 'cancelled' || subscription.cancelAtPeriodEnd) return c.json({ error: { code: 'CONFLICT', message: 'Cancelled subscriptions cannot be renewed' } }, 409);
  if (subscription.pricingMode === 'free') return c.json({ error: { code: 'FREE_PLAN', message: 'Los planes gratuitos se activan sin Mercado Pago.' } }, 400);
  if (subscription.pricingMode !== 'paid' || !Number.isInteger(subscription.priceAmountMinor) || subscription.priceAmountMinor <= 0) return c.json({ error: { code: 'PRICE_NOT_CONFIGURED', message: 'Este plan todavía no tiene un precio comercial configurado.' } }, 400);
  const paymentId = crypto.randomUUID();
  try {
    const checkout = await createMercadoPagoProvider(c.env).createCheckout({ paymentId, subscriptionId: subscription.id, title: `${subscription.planName} - renovación`, amountMinor: subscription.priceAmountMinor, currency: subscription.currency });
    await c.env.DB.prepare('INSERT INTO commercial_payments (id,organization_id,subscription_id,provider,provider_checkout_id,status,amount_minor,currency) VALUES (?,?,?,?,?,?,?,?)').bind(paymentId, organizationId, subscription.id, 'mercado_pago', checkout.checkoutId, 'pending', subscription.priceAmountMinor, subscription.currency).run();
    return c.json({ id: paymentId, provider: 'mercado_pago', checkoutId: checkout.checkoutId, checkoutUrl: checkout.checkoutUrl, status: 'pending' }, 201);
  } catch (error) {
    return c.json({ error: { code: 'PAYMENT_PROVIDER_UNAVAILABLE', message: error instanceof Error ? error.message : 'Payment provider unavailable' } }, 502);
  }
});

commercialRoutes.post('/subscriptions/:id/offline-payments', async (c) => {
  if (!isPlatformOperator(c.get('user').platformRole)) return c.json({ error: { code: 'FORBIDDEN', message: 'Platform commercial operator required' } }, 403);
  const organizationId = c.get('organization').id;
  const subscription = await getSubscription(c.env.DB, c.req.param('id'), organizationId);
  if (!subscription) return c.json({ error: { code: 'NOT_FOUND', message: 'Subscription not found' } }, 404);
  if (subscription.pricingMode !== 'paid' || subscription.priceAmountMinor <= 0) return c.json({ error: { code: 'INVALID_SUBSCRIPTION_PRICE', message: 'Offline payment requires a configured paid subscription.' } }, 400);
  const method = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const paymentMethod = method.payment_method;
  if (!['cash', 'bank_transfer', 'other'].includes(String(paymentMethod))) return c.json(bad('payment_method must be cash, bank_transfer or other'), 400);
  const key = c.req.header('Idempotency-Key')?.trim();
  if (!key || key.length > 200) return c.json(bad('Idempotency-Key is required'), 400);
  const existing = await c.env.DB.prepare('SELECT id FROM commercial_payments WHERE idempotency_key=? AND organization_id=?').bind(key, organizationId).first<{ id: string }>();
  if (existing) return c.json(await getSubscription(c.env.DB, subscription.id, organizationId));
  const paidAtValue = method.paid_at === undefined ? new Date().toISOString() : method.paid_at;
  if (typeof paidAtValue !== 'string' || !Number.isFinite(new Date(paidAtValue).getTime())) return c.json(bad('paid_at must be a valid date'), 400);
  const reference = method.reference === undefined || method.reference === null ? null : typeof method.reference === 'string' && method.reference.length <= 200 ? method.reference.trim() : undefined;
  const note = method.note === undefined || method.note === null ? null : typeof method.note === 'string' && method.note.length <= 500 ? method.note.trim() : undefined;
  if (reference === undefined || note === undefined) return c.json(bad('reference and note must be valid strings'), 400);
  const paymentId = crypto.randomUUID();
  const insert = c.env.DB.prepare('INSERT INTO commercial_payments (id,organization_id,subscription_id,payment_source,payment_method,status,amount_minor,currency,reference,note,created_by,idempotency_key,paid_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(paymentId, organizationId, subscription.id, 'offline', paymentMethod, 'approved', subscription.priceAmountMinor, subscription.currency, reference, note, c.get('user').id, key, new Date(paidAtValue).toISOString());
  await renewSubscription(c.env.DB, subscription, c.get('user').id, `offline:${paymentId}`, paymentId, Date.now(), [insert]);
  return c.json(await getSubscription(c.env.DB, subscription.id, organizationId), 201);
});

commercialRoutes.post('/subscriptions/:id/grants', async (c) => {
  if (!isPlatformOperator(c.get('user').platformRole)) return c.json({ error: { code: 'FORBIDDEN', message: 'Platform commercial operator required' } }, 403);
  const organizationId = c.get('organization').id;
  const subscription = await getSubscription(c.env.DB, c.req.param('id'), organizationId);
  if (!subscription) return c.json({ error: { code: 'NOT_FOUND', message: 'Subscription not found' } }, 404);
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const grantType = body.grant_type ?? 'courtesy';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (!['free', 'promotion', 'courtesy', 'trial', 'support_extension'].includes(String(grantType)) || !note || note.length > 500) return c.json(bad('grant_type and note are required'), 400);
  let startsAt: Date; let endsAt: Date;
  if (typeof body.starts_at === 'string' || typeof body.ends_at === 'string') {
    if (typeof body.starts_at !== 'string' || typeof body.ends_at !== 'string') return c.json(bad('starts_at and ends_at are required together'), 400);
    startsAt = new Date(body.starts_at); endsAt = new Date(body.ends_at);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || startsAt >= endsAt) return c.json(bad('starts_at must be before ends_at'), 400);
  } else {
    startsAt = new Date(Math.max(Date.now(), new Date(subscription.currentPeriodEnd).getTime()));
    try { endsAt = grantPeriod(subscription, startsAt, typeof body.duration_days === 'number' ? body.duration_days : undefined); } catch { return c.json(bad('A valid duration_days is required'), 400); }
  }
  const grantId = await grantSubscriptionPeriod(c.env.DB, subscription, grantType as GrantType, startsAt, endsAt, note, c.get('user').id);
  return c.json({ id: grantId, subscriptionId: subscription.id, grantType, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), note }, 201);
});

commercialRoutes.get('/subscriptions/:id/payments', async (c) => {
  const subscription = await getSubscription(c.env.DB, c.req.param('id'), c.get('organization').id);
  if (!subscription) return c.json({ error: { code: 'NOT_FOUND', message: 'Subscription not found' } }, 404);
  const rows = await c.env.DB.prepare('SELECT id,payment_source paymentSource,payment_method paymentMethod,provider,status,amount_minor amountMinor,currency,reference,note,created_at createdAt,paid_at paidAt FROM commercial_payments WHERE subscription_id=? AND organization_id=? ORDER BY created_at DESC, id DESC').bind(subscription.id, c.get('organization').id).all<Record<string, unknown>>();
  return c.json(rows.results.map((row) => ({ id: String(row.id), paymentSource: String(row.paymentSource), paymentMethod: row.paymentMethod as string | null, provider: row.provider as string | null, status: String(row.status), amountMinor: Number(row.amountMinor), currency: String(row.currency), reference: row.reference as string | null, note: row.note as string | null, createdAt: String(row.createdAt), paidAt: row.paidAt as string | null })));
});

commercialRoutes.get('/subscriptions/:id/grants', async (c) => {
  const subscription = await getSubscription(c.env.DB, c.req.param('id'), c.get('organization').id);
  if (!subscription) return c.json({ error: { code: 'NOT_FOUND', message: 'Subscription not found' } }, 404);
  const rows = await c.env.DB.prepare('SELECT id,grant_type grantType,starts_at startsAt,ends_at endsAt,note,created_at createdAt FROM commercial_grants WHERE subscription_id=? AND organization_id=? ORDER BY created_at DESC, id DESC').bind(subscription.id, c.get('organization').id).all<Record<string, unknown>>();
  return c.json(rows.results);
});

commercialRoutes.post('/subscriptions/:id/cancel', async (c) => {
  const organizationId = c.get('organization').id;
  const subscription = await getSubscription(c.env.DB, c.req.param('id'), organizationId);
  if (!subscription) return c.json({ error: { code: 'NOT_FOUND', message: 'Subscription not found' } }, 404);
  await c.env.DB.prepare("UPDATE subscriptions SET cancel_at_period_end=1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?").bind(subscription.id, organizationId).run();
  return c.json(await getSubscription(c.env.DB, subscription.id, organizationId));
});
