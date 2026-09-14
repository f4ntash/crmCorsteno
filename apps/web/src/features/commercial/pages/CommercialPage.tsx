import { useEffect, useState } from 'react';
import { formatMoneyFromMinor, parseMoneyToMinor } from '@corsteno/types';
import {
  COMMERCIAL_FEATURE_LABELS,
  COMMERCIAL_PLAN_DEFINITIONS,
  type CommercialPlanCode,
} from '@corsteno/types';
import { commercialApi, type Plan } from '../api';

function price(plan: Plan) {
  return plan.priceAmountMinor === 0
    ? 'Precio pendiente'
    : formatMoneyFromMinor(plan.priceAmountMinor, plan.currency);
}
function interval(plan: Plan) {
  return plan.billingInterval === 'one_time'
    ? `Pago único · ${plan.includedAccessDays ?? 0} días`
    : `${plan.billingInterval === 'monthly' ? 'Mensual' : 'Anual'}${plan.billingIntervalCount > 1 ? ` · ${plan.billingIntervalCount} períodos` : ''}`;
}

export function CommercialPage({
  org,
  canManageCatalog = false,
}: {
  org: string;
  canManageCatalog?: boolean;
}) {
  const [plans, setPlans] = useState<Plan[]>([]),
    [error, setError] = useState(''),
    [editing, setEditing] = useState<string | null>(null),
    [saving, setSaving] = useState(false),
    [creating, setCreating] = useState(false);
  async function load() {
    try {
      setPlans(
        await (canManageCatalog
          ? commercialApi.catalog(org)
          : commercialApi.plans(org)),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (org || canManageCatalog) void load();
  }, [org, canManageCatalog]);
  async function save(plan: Plan, form: HTMLFormElement) {
    const data = new FormData(form);
    const pricingMode = String(data.get('pricingMode') ?? 'unconfigured');
    const amount =
      pricingMode === 'free'
        ? 0
        : parseMoneyToMinor(String(data.get('amount') ?? ''));
    if (amount === null) {
      setError('Ingresá un importe válido con hasta dos decimales.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await commercialApi.updatePlan(plan.id, org, {
        name: String(data.get('name') ?? ''),
        description: String(data.get('description') ?? ''),
        price_amount_minor: amount,
        pricing_mode: pricingMode,
        currency: String(data.get('currency') ?? ''),
        available_for_sale: data.get('available') === 'on' ? 1 : 0,
        active: data.get('active') === 'on' ? 1 : 0,
      });
      setEditing(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function create(form: HTMLFormElement) {
    const data = new FormData(form);
    const pricingMode = String(data.get('pricingMode') ?? 'unconfigured');
    const amount = pricingMode === 'free' ? 0 : parseMoneyToMinor(String(data.get('amount') ?? ''));
    if (amount === null) { setError('Ingresá un importe válido con hasta dos decimales.'); return; }
    setCreating(true); setError('');
    try {
      await commercialApi.createPlan(org, { code: String(data.get('code') ?? ''), name: String(data.get('name') ?? ''), description: String(data.get('description') ?? ''), billing_interval: String(data.get('interval') ?? 'monthly'), billing_interval_count: Number(data.get('intervalCount') ?? 1), included_access_days: data.get('includedDays') ? Number(data.get('includedDays')) : null, price_amount_minor: amount, pricing_mode: pricingMode, currency: String(data.get('currency') ?? 'ARS'), active: data.get('active') === 'on' ? 1 : 0, available_for_sale: data.get('available') === 'on' ? 1 : 0 });
      setEditing(null); await load();
    } catch (e) { setError((e as Error).message); } finally { setCreating(false); }
  }
  return (
    <main className="page commercial-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMINISTRACIÓN / CATÁLOGO GLOBAL</p>
          <h1>Planes comerciales</h1>
          <p className="page-description">Configurá precios y disponibilidad para todas las organizaciones.</p>
        </div>
        <div className="scope-summary">
          <small>ÁMBITO ACTUAL</small>
          <strong>Catálogo global</strong>
          <span>Operaciones de plataforma</span>
        </div>
        {canManageCatalog && <button type="button" onClick={() => { setError(''); setEditing('new'); }}>Crear plan</button>}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="experience-list commercial-list">
        {editing === 'new' && <form className="card commercial-create-form" onSubmit={(event) => { event.preventDefault(); void create(event.currentTarget); }}>
          <h2>Nuevo plan comercial</h2>
          <label>Código<input name="code" required pattern="[a-z0-9][a-z0-9_-]{1,79}" placeholder="starter-plus" /></label>
          <label>Nombre<input name="name" required maxLength={120} /></label>
          <label>Descripción<textarea name="description" /></label>
          <label>Modalidad<select name="interval" defaultValue="monthly"><option value="monthly">Mensual</option><option value="yearly">Anual</option><option value="one_time">Pago único</option></select></label>
          <label>Períodos<input name="intervalCount" type="number" min="1" defaultValue="1" required /></label>
          <label>Días incluidos (pago único)<input name="includedDays" type="number" min="1" /></label>
          <label>Tipo de precio<select name="pricingMode"><option value="unconfigured">Precio pendiente</option><option value="paid">Pagado</option><option value="free">Gratis</option></select></label>
          <label>Precio<input name="amount" inputMode="decimal" placeholder="25000" /></label>
          <label>Moneda<select name="currency"><option>ARS</option><option>USD</option></select></label>
          <label><input type="checkbox" name="active" defaultChecked /> Activo</label>
          <label><input type="checkbox" name="available" defaultChecked /> Disponible para venta</label>
          <div className="modal-actions"><button type="button" className="secondary" onClick={() => setEditing(null)}>Cancelar</button><button disabled={creating}>{creating ? 'Creando…' : 'Crear plan'}</button></div>
        </form>}
        {plans.length === 0 ? (
          <div className="empty" role="status">
            <h2>No hay planes comerciales configurados.</h2>
            <p>El catálogo global todavía no tiene planes disponibles para configurar.</p>
          </div>
        ) : plans.map((plan) => {
          const definition =
            COMMERCIAL_PLAN_DEFINITIONS[plan.code as CommercialPlanCode];
          return (
            <article className="experience-card" key={plan.id}>
              <div>
                <h2>{plan.name}</h2>
                <p>{definition?.description ?? plan.description}</p>
              </div>
              <span>{interval(plan)}</span>
              <strong>
                {plan.pricingMode === 'free' ? 'Gratis' : price(plan)}
              </strong>
              <span
                className={`status status-${plan.active && plan.availableForSale && plan.pricingMode !== 'unconfigured' ? 'active' : 'paused'}`}
              >
                {plan.active &&
                plan.availableForSale &&
                plan.pricingMode !== 'unconfigured'
                  ? 'Disponible'
                  : plan.active
                    ? 'No disponible'
                    : 'Inactivo'}
              </span>
              {definition && (
                <div>
                  <small>Incluye</small>
                  <ul>
                    {definition.features.map((feature) => (
                      <li key={feature}>
                        {COMMERCIAL_FEATURE_LABELS[feature]}
                      </li>
                    ))}
                  </ul>
                  <small>
                    {definition.maxActiveExperiences === null
                      ? 'Experiencias activas: sin límite definido'
                      : `Experiencias activas: hasta ${definition.maxActiveExperiences}`}
                  </small>
                  {definition.serviceNotes.map((note) => (
                    <p key={note}>
                      <small>{note}</small>
                    </p>
                  ))}
                </div>
              )}
              {canManageCatalog &&
                (editing === plan.id ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void save(plan, event.currentTarget);
                    }}
                  >
                    <label>
                      Nombre
                      <input name="name" defaultValue={plan.name} />
                    </label>
                    <label>
                      Descripción
                      <textarea
                        name="description"
                        defaultValue={plan.description ?? ''}
                      />
                    </label>
                    <label>
                      Modalidad
                      <select
                        name="pricingMode"
                        defaultValue={plan.pricingMode}
                      >
                        <option value="unconfigured">Precio pendiente</option>
                        <option value="paid">Pagado</option>
                        <option value="free">Gratis</option>
                      </select>
                    </label>
                    <label>
                      Precio
                      <input
                        name="amount"
                        inputMode="decimal"
                        defaultValue={
                          plan.priceAmountMinor
                            ? String(plan.priceAmountMinor / 100)
                            : ''
                        }
                        placeholder="25000"
                        disabled={plan.pricingMode === 'free'}
                      />
                    </label>
                    <label>
                      Moneda
                      <select name="currency" defaultValue={plan.currency}>
                        <option>ARS</option>
                        <option>USD</option>
                      </select>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        name="active"
                        defaultChecked={plan.active === 1}
                      />{' '}
                      Activo
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        name="available"
                        defaultChecked={plan.availableForSale === 1}
                      />{' '}
                      Disponible para venta
                    </label>
                    <div className="modal-actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setEditing(null)}
                      >
                        Cancelar
                      </button>
                      <button disabled={saving}>
                        {saving ? 'Guardando…' : 'Guardar'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <button type="button" onClick={() => setEditing(plan.id)}>
                    Editar precio y disponibilidad
                  </button>
                ))}
            </article>
          );
        })}
      </div>
    </main>
  );
}
