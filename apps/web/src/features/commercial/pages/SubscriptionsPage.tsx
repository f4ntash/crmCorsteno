import type React from 'react';
import { useEffect, useState } from 'react';
import {
  commercialApi,
  type Payment,
  type Plan,
  type Subscription,
} from '../api';
import { COMMERCIAL_FEATURE_LABELS } from '@corsteno/types';

function displayDate(value: string) {
  return new Date(value).toLocaleString('es-AR');
}
function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function dateInputValue(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function statusLabel(status: Subscription['effectiveStatus']) {
  return ({ pending: 'Pendiente', active: 'Activo', suspended: 'Suspendido', expired: 'Vencido', cancelled: 'Cancelado' })[status];
}
export function SubscriptionsPage({
  org,
  canManage,
  canManageCommercial = false,
}: {
  org: string;
  canManage: boolean;
  canManageCommercial?: boolean;
}) {
  const [plans, setPlans] = useState<Plan[]>([]),
    [experiences, setExperiences] = useState<
      Array<{ id: string; name: string }>
    >([]),
    [items, setItems] = useState<Subscription[]>([]),
    [payments, setPayments] = useState<Record<string, Payment[]>>({}),
    [modal, setModal] = useState(false),
    [planId, setPlanId] = useState(''),
    [selected, setSelected] = useState<string[]>([]),
    [startsAt, setStartsAt] = useState(''),
    [error, setError] = useState(''),
    [saving, setSaving] = useState(false),
    [offlineSaving, setOfflineSaving] = useState<string | null>(null);
  async function load() {
    try {
      const [nextPlans, subscriptions, nextExperiences] = await Promise.all([
        commercialApi.plans(org),
        commercialApi.subscriptions(org),
        import('../../experiences/api').then(({ experiencesApi }) =>
          experiencesApi.list(org),
        ),
      ]);
      setPlans(nextPlans);
      setItems(subscriptions);
      setExperiences(nextExperiences);
      const paymentEntries = await Promise.all(
        subscriptions.map(
          async (item) =>
            [item.id, await commercialApi.payments(item.id, org)] as const,
        ),
      );
      setPayments(Object.fromEntries(paymentEntries));
      if (!planId) setPlanId(nextPlans[0]?.id ?? '');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (org) void load();
  }, [org]);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!planId || !selected.length || !startsAt || saving) return;
    setSaving(true);
    setError('');
    try {
      await commercialApi.createSubscription(org, {
        plan_id: planId,
        experience_ids: selected,
        starts_at: new Date(startsAt).toISOString(),
      });
      setModal(false);
      setSelected([]);
      setStartsAt('');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function renew(item: Subscription) {
    setError('');
    try {
      await commercialApi.renew(item.id, org, crypto.randomUUID());
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function offline(item: Subscription) {
    if (offlineSaving) return;
    const paymentMethod = window.prompt(
      'Método: cash, bank_transfer u other',
      'bank_transfer',
    );
    if (
      !paymentMethod ||
      !['cash', 'bank_transfer', 'other'].includes(paymentMethod)
    )
      return;
    const note = window.prompt('Nota o comprobante');
    if (!note) return;
    setError('');
    setOfflineSaving(item.id);
    try {
      await commercialApi.offlinePayment(
        item.id,
        org,
        { payment_method: paymentMethod, note },
        crypto.randomUUID(),
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOfflineSaving(null);
    }
  }
  async function extend(item: Subscription) {
    const endDate = window.prompt('Nuevo vencimiento (AAAA-MM-DD)', dateInputValue(item.currentPeriodEnd));
    const note = window.prompt('Motivo');
    if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || !note) return;
    const endsAt = new Date(`${endDate}T23:59:59.999`);
    if (!Number.isFinite(endsAt.getTime()) || endsAt <= new Date(item.currentPeriodEnd)) {
      setError('El nuevo vencimiento debe ser posterior al vencimiento actual.');
      return;
    }
    setError('');
    try {
      await commercialApi.grant(item.id, org, {
        grant_type: 'support_extension',
        starts_at: new Date(Math.max(Date.now(), new Date(item.currentPeriodEnd).getTime())).toISOString(),
        ends_at: endsAt.toISOString(),
        note,
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function cancel(item: Subscription) {
    if (
      !window.confirm(
        'La suscripción seguirá vigente hasta el fin del período actual. ¿Cancelar renovación?',
      )
    )
      return;
    try {
      await commercialApi.cancel(item.id, org);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function suspend(item: Subscription) {
    if (!window.confirm('El acceso de las experiencias asociadas se bloqueará inmediatamente. ¿Suspender esta suscripción?')) return;
    setError('');
    try {
      await commercialApi.suspend(item.id, org);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function reactivate(item: Subscription) {
    setError('');
    try {
      await commercialApi.reactivate(item.id, org);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!org) {
    return (
      <main className="page subscriptions-page">
        <div className="empty">
          <h2>Seleccioná un workspace cliente</h2>
          <p>Las suscripciones pertenecen a una organización cliente. Elegí un workspace para consultarlas o administrarlas.</p>
        </div>
      </main>
    );
  }
  return (
    <main className="page subscriptions-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">COMERCIAL</p>
          <h1>Suscripciones</h1>
          <p className="page-description">Accesos y períodos de la organización seleccionada.</p>
        </div>
        {canManage && (
          <button
            onClick={() => {
              setError('');
              setModal(true);
            }}
          >
            Nueva suscripción
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {items.length ? (
        <div className="experience-list subscription-list">
          {items.map((item) => (
            <article className="experience-card" key={item.id}>
              <div>
                <h2>{item.planName}</h2>
                <p>
                  {item.experiences
                    .map((experience) => experience.name)
                    .join(', ')}
                </p>
              </div>
              <span className={`status status-${item.effectiveStatus}`}>
                {statusLabel(item.effectiveStatus)}
              </span>
              <div>
                <small>Inicio del plan</small>
                <br />
                {displayDate(item.startsAt)}
                <br />
                <small>Inicio del período actual</small>
                <br />
                {displayDate(item.currentPeriodStart)}
                <br />
                <small>Próximo vencimiento</small>
                <br />
                {displayDate(item.currentPeriodEnd)}
              </div>
              <div>
                <small>Capacidades de tu suscripción</small>
                <ul>
                  {item.featureEntitlements.features.map((feature) => (
                    <li key={feature}>{COMMERCIAL_FEATURE_LABELS[feature]}</li>
                  ))}
                </ul>
                <small>
                  {item.featureEntitlements.maxActiveExperiences === null
                    ? 'Experiencias activas: sin límite definido'
                    : `Experiencias activas: hasta ${item.featureEntitlements.maxActiveExperiences}`}
                </small>
              </div>
              {canManage && (
                <div className="modal-actions">
                  {canManageCommercial && (
                    <>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => void offline(item)}
                        disabled={offlineSaving === item.id}
                      >
                        {offlineSaving === item.id ? 'Registrando…' : 'Registrar pago externo'}
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => void extend(item)}
                      >
                        Extender vencimiento
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => void renew(item)}
                      >
                        Renovación manual
                      </button>
                      {item.effectiveStatus !== 'suspended' && item.effectiveStatus !== 'cancelled' && item.effectiveStatus !== 'expired' && (
                        <button type="button" className="secondary" onClick={() => void suspend(item)}>
                          Suspender
                        </button>
                      )}
                      {(item.effectiveStatus === 'suspended' || item.effectiveStatus === 'cancelled' || !!item.cancelAtPeriodEnd) && (
                        <button type="button" className="secondary" onClick={() => void reactivate(item)}>
                          Reactivar
                        </button>
                      )}
                    </>
                  )}
                  {!item.cancelAtPeriodEnd && item.effectiveStatus !== 'cancelled' && item.effectiveStatus !== 'expired' && item.effectiveStatus !== 'suspended' && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => void cancel(item)}
                    >
                      Cancelar al finalizar
                    </button>
                  )}
                </div>
              )}{' '}
              {!!payments[item.id]?.length && (
                <div>
                  <small>Historial de pagos</small>
                  {payments[item.id].map((payment) => (
                    <p key={payment.id}>
                      <small>
                        {displayDate(payment.createdAt)} ·{' '}
                        {payment.paymentSource === 'offline'
                          ? payment.paymentMethod
                          : payment.provider}{' '}
                        ·{' '}
                        {(payment.amountMinor / 100).toLocaleString('es-AR', {
                          style: 'currency',
                          currency: payment.currency,
                        })}{' '}
                        · {payment.status}
                      </small>
                    </p>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="empty">
          <h2>No hay suscripciones.</h2>
          {canManage && (
            <button onClick={() => setModal(true)}>Crear suscripción</button>
          )}
        </div>
      )}
      {modal && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="subscription-dialog-title">
            <h2 id="subscription-dialog-title">Nueva suscripción</h2>
            <form onSubmit={create}>
              <label>
                Plan
                <select
                  value={planId}
                  onChange={(e) => setPlanId(e.target.value)}
                >
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Fecha de inicio
                <input
                  type="date"
                  min={localToday()}
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
                <small className="field-help">Se interpreta según tu zona horaria local (Argentina).</small>
              </label>
              <fieldset>
                <legend>Experiencias</legend>
                {experiences.map((experience) => (
                  <label key={experience.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(experience.id)}
                      onChange={(e) =>
                        setSelected((current) =>
                          e.target.checked
                            ? [...current, experience.id]
                            : current.filter((id) => id !== experience.id),
                        )
                      }
                    />
                    {experience.name}
                  </label>
                ))}
              </fieldset>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setModal(false)}
                >
                  Cancelar
                </button>
                <button
                  disabled={saving || !planId || !selected.length || !startsAt}
                >
                  {saving ? 'Creando…' : 'Crear suscripción'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
