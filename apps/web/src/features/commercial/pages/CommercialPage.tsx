import { useEffect, useState } from 'react';
import { commercialApi, type Plan } from '../api';

function price(plan: Plan) { return plan.priceAmountMinor === 0 ? 'Precio pendiente' : `${(plan.priceAmountMinor / 100).toLocaleString('es-AR')} ${plan.currency}`; }
function interval(plan: Plan) { return plan.billingInterval === 'one_time' ? `Fijo · ${plan.includedAccessDays ?? 0} días` : `${plan.billingInterval === 'monthly' ? 'Mensual' : 'Anual'}${plan.billingIntervalCount > 1 ? ` · ${plan.billingIntervalCount} períodos` : ''}`; }

export function CommercialPage({ org }: { org: string }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { if (!org) return; commercialApi.plans(org).then(setPlans).catch((e) => setError((e as Error).message)); }, [org]);
  return <main className="page"><div className="page-heading"><div><p className="eyebrow">COMERCIAL</p><h1>Planes</h1></div></div><p>Catálogo de referencia para asignar acceso comercial. Los precios mostrados como pendientes no son precios de producción.</p>{error && <p className="error">{error}</p>}<div className="experience-list">{plans.map((plan) => <article className="experience-card" key={plan.id}><div><h2>{plan.name}</h2><p>{plan.description}</p></div><span>{interval(plan)}</span><strong>{price(plan)}</strong><span className="status status-active">Activo</span></article>)}</div></main>;
}
