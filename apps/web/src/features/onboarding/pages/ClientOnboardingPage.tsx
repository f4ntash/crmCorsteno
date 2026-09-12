import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../../../shared/api/client';
import { commercialApi, type Plan } from '../../commercial/api';
import { experiencesApi } from '../../experiences/api';
import type { ExperienceTemplate } from '../../experiences/types';
import { publicExperienceUrl } from '../../../shared/runtime/publicExperienceUrl';

type Mode = 'later' | 'offline' | 'free' | 'courtesy' | 'configure';
type Created = {
  organizationId: string;
  experienceId: string;
  slug: string;
  access?: string;
};

export function ClientOnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1),
    [organizationName, setOrganizationName] = useState(''),
    [customerEmail, setCustomerEmail] = useState(''),
    [customerName, setCustomerName] = useState(''),
    [customerPassword, setCustomerPassword] = useState(''),
    [planId, setPlanId] = useState(''),
    [mode, setMode] = useState<Mode>('configure'),
    [templates, setTemplates] = useState<ExperienceTemplate[]>([]),
    [templateId, setTemplateId] = useState(''),
    [experienceName, setExperienceName] = useState(''),
    [segmentCount, setSegmentCount] = useState(6),
    [delivery, setDelivery] = useState<'none' | 'hosted'>('none'),
    [plans, setPlans] = useState<Plan[]>([]),
    [org, setOrg] = useState<{ id: string; name: string }>(),
    [created, setCreated] = useState<Created>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function loadTemplates(id: string) {
    try {
      const available = await experiencesApi.templates(id);
      setTemplates(available);
      setTemplateId(available.find((item) => item.type === 'roulette')?.id ?? '');
    } catch {
      setTemplates([]);
      setTemplateId('');
    }
  }
  async function createOrganization() {
    if (
      !organizationName.trim() ||
      !customerEmail.trim() ||
      !customerName.trim() ||
      customerPassword.length < 8 ||
      busy
    )
      return;
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest<{ id: string; name: string }>(
        '/admin/organizations',
        undefined,
        {
          method: 'POST',
          body: JSON.stringify({ name: organizationName.trim() }),
        },
      );
      await apiRequest('/admin/users', undefined, {
        method: 'POST',
        body: JSON.stringify({
          organizationId: result.id,
          email: customerEmail.trim(),
          name: customerName.trim(),
          password: customerPassword,
          role: 'admin',
        }),
      });
      setOrg(result);
      setCustomerPassword('');
      await loadPlans(result.id);
      await loadTemplates(result.id);
      setStep(2);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function loadPlans(id: string) {
    try {
      setPlans(await apiRequest<Plan[]>('/plans', id));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function createExperience() {
    if (!org || !experienceName.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const experience = (await experiencesApi.create(org.id, {
        name: experienceName.trim(),
        type: 'roulette',
        delivery,
        ...(templateId ? { template_id: templateId, segment_count: segmentCount } : {}),
      })) as { id: string; slug: string };
      setCreated({
        organizationId: org.id,
        experienceId: experience.id,
        slug: experience.slug,
      });
      setStep(4);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createAccess() {
    if (!org || !created || !planId || mode === 'configure' || busy) return;
    setBusy(true);
    try {
      const subscription = await commercialApi.createSubscription(org.id, {
        plan_id: planId,
        experience_ids: [created.experienceId],
        starts_at: new Date().toISOString(),
      });
      setCreated((current) => ({
        ...current!,
        access: subscription.effectiveStatus,
      }));
      if (mode === 'courtesy')
        await commercialApi.grant(subscription.id, org.id, {
          grant_type: 'courtesy',
          duration_days: 30,
          note: 'Cortesía creada desde onboarding',
        });
      setStep(5);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (!org || !created || busy) return;
    setBusy(true);
    try {
      await experiencesApi.publish(created.experienceId, org.id);
      setStep(6);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selectedPlan = plans.find((plan) => plan.id === planId);
  const publicUrl = created ? publicExperienceUrl(created.slug) : '';
  return (
    <main className="page onboarding-page">
      <div className="page-heading onboarding-heading">
        <div>
          <p className="eyebrow">ADMINISTRACIÓN / ONBOARDING</p>
          <h1>Nueva activación</h1>
        </div>
        <span className="onboarding-step">Paso {step} de 6</span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <section className="onboarding-card">
        {step === 1 && (
          <>
            <header className="onboarding-card-heading">
              <h2>1. Nuevo cliente</h2>
              <p>
                Se crea una cuenta administradora para la organización. La
                contraseña se usa para generar el hash y no se guarda en
                texto plano.
              </p>
            </header>
            <div className="onboarding-fields onboarding-fields-two">
              <label>
                Organización
                <input
                  autoFocus
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  placeholder="Cliente Evento Norte"
                />
              </label>
              <label>
                Email del cliente
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="customer@test.local"
                />
              </label>
              <label>
                Nombre del cliente
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Operador Cliente"
                />
              </label>
              <label>
                Contraseña temporal local
                <input
                  type="password"
                  minLength={8}
                  value={customerPassword}
                  onChange={(e) => setCustomerPassword(e.target.value)}
                  placeholder="password"
                />
              </label>
            </div>
            <p className="onboarding-support">No hay envío de email automático disponible. Entregá el acceso al cliente por un canal seguro.</p>
            <div className="onboarding-actions">
              <button
                disabled={
                  busy ||
                  organizationName.trim().length < 2 ||
                  !customerEmail.trim() ||
                  !customerName.trim() ||
                  customerPassword.length < 8
                }
                onClick={() => void createOrganization()}
              >
                {busy ? 'Creando…' : 'Continuar'}
              </button>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <header className="onboarding-card-heading">
              <h2>2. Plan y modalidad</h2>
              <p>Cuenta administradora creada para {customerEmail}.</p>
            </header>
            <p className="onboarding-support">La contraseña inicial no vuelve a mostrarse y no se envió por email automáticamente.</p>
            <div className="onboarding-fields onboarding-fields-two">
              <label>
                Plan
                <select
                  value={planId}
                  onChange={(e) => setPlanId(e.target.value)}
                >
                  <option value="">Elegí un plan</option>
                  {plans
                    .filter((plan) => plan.pricingMode !== 'unconfigured')
                    .map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Modalidad
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as Mode)}
                >
                  <option value="configure">Solo configurar ahora</option>
                  <option value="later">Mercado Pago más adelante</option>
                  <option value="offline">
                    Efectivo / transferencia más adelante
                  </option>
                  <option value="free">FREE</option>
                  <option value="courtesy">Cortesía</option>
                </select>
              </label>
            </div>
            {selectedPlan && (
              <p className="onboarding-support">
                Capacidades: {selectedPlan.name}
              </p>
            )}
            <div className="onboarding-actions">
              <button
                disabled={!planId && mode !== 'configure'}
                onClick={() => setStep(3)}
              >
                Continuar
              </button>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <header className="onboarding-card-heading">
              <h2>3. Configuración básica</h2>
            </header>
            <div className="onboarding-fields onboarding-fields-two">
              <label>
                Plantilla
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                >
                  <option value="">Desde cero</option>
                  {templates.filter((item) => item.type === 'roulette').map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Nombre
                <input
                  value={experienceName}
                  onChange={(e) => setExperienceName(e.target.value)}
                  placeholder="Ruleta Acceptance"
                />
              </label>
              <label>
                Segmentos
                <select
                  value={segmentCount}
                  onChange={(e) => setSegmentCount(Number(e.target.value))}
                >
                  {[6, 8, 10].map((count) => (
                    <option key={count}>{count}</option>
                  ))}
                </select>
              </label>
              <label>
                Canal de publicación
                <select value={delivery} onChange={(e) => setDelivery(e.target.value as 'none' | 'hosted')}>
                  <option value="none">Sin canal por ahora</option>
                  <option value="hosted">Alojada por Corsteno</option>
                </select>
                <small className="field-help">La experiencia se crea como borrador. Podés conectarla después.</small>
              </label>
            </div>
            <div className="onboarding-actions">
              <button
                disabled={busy || !experienceName.trim()}
                onClick={() => void createExperience()}
              >
                Crear experiencia
              </button>
            </div>
          </>
        )}
        {step === 4 && (
          <>
            <header className="onboarding-card-heading">
              <h2>4. Acceso comercial</h2>
              <p>
                {org?.name} · {experienceName}
              </p>
            </header>
            {mode === 'configure' ? (
              <p className="onboarding-support">
                Acceso pendiente de configuración.
              </p>
            ) : null}
            <div className="onboarding-actions">
              {mode !== 'configure' && (
                <button disabled={busy} onClick={() => void createAccess()}>
                  Crear acceso
                </button>
              )}
              <button className="secondary" onClick={() => setStep(5)}>
                Continuar sin acceso
              </button>
            </div>
          </>
        )}
        {step === 5 && (
          <>
            <header className="onboarding-card-heading">
              <h2>5. Publicar</h2>
            </header>
            <div className="onboarding-actions">
              <button disabled={busy} onClick={() => void publish()}>
                Publicar
              </button>
              <button
                className="secondary"
                onClick={() =>
                  navigate(`/app/experiences/${created?.experienceId}`)
                }
              >
                Editar avanzado
              </button>
            </div>
          </>
        )}
        {step === 6 && created && (
          <>
            <header className="onboarding-card-heading">
              <h2>{delivery === 'hosted' ? '6. QR listo' : '6. Experiencia creada'}</h2>
              {delivery === 'hosted' ? <p className="onboarding-url">{publicUrl}</p> : <p className="onboarding-support">La experiencia quedó publicada sin canal de publicación. Conectá un canal alojado desde su espacio cuando quieras.</p>}
            </header>
            <div className="onboarding-actions">
              {delivery === 'hosted' && <a className="button" href={publicUrl} target="_blank" rel="noreferrer">Abrir experiencia →</a>}
              {delivery !== 'hosted' && <button className="button" onClick={() => navigate(`/app/experiences/${created.experienceId}`)}>Abrir espacio →</button>}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
