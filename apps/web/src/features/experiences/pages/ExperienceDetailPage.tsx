import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiRequest } from '../../../shared/api/client';
import { experiencesApi } from '../api';
import { commercialApi } from '../../commercial/api';
import { experienceEditors } from '../registry';
import { ExperienceQrModal } from '../components/ExperienceQrModal';
import { PublishControls } from '../components/PublishControls';
import { SpinHistory } from '../components/SpinHistory';
import { ClaimsPanel } from '../components/ClaimsPanel';
import { AccessPeriodPanel } from '../components/AccessPeriodPanel';
type LegacyJson = ReturnType<JSON['parse']>;
async function get<T = LegacyJson>(
  path: string,
  org?: string,
  init?: RequestInit,
) {
  return apiRequest<T>(path, org, init);
}
const runtime =
  import.meta.env.VITE_RUNTIME_BASE_URL ?? 'http://localhost:5174';
export function ExperienceDetailPage({
  org,
  permissions,
  canManageCommercial,
}: {
  org: string;
  permissions: string[];
  canManageCommercial: boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const id =
    location.pathname.match(/^\/app\/experiences\/([^/]+)$/)?.[1] ?? '';
  const [experience, setExperience] = useState<{
    id: string;
    type: string;
    slug: string;
    name: string;
    status: string;
    draftConfig?: { prizes?: Array<{ id: string; name: string }> };
  }>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [redemptionAvailable, setRedemptionAvailable] = useState(false);
  useEffect(() => {
    if (!id || !org) return;
    setLoading(true);
    setLoadError('');
    get(`/experiences/${id}`, org)
      .then(setExperience)
      .catch((error) => { setExperience(undefined); setLoadError((error as Error).message); })
      .finally(() => setLoading(false));
    commercialApi.subscriptions(org)
      .then((subscriptions) => setRedemptionAvailable(subscriptions.some((subscription) =>
        subscription.experiences.some((attached) => attached.id === id) &&
        subscription.featureEntitlements.features.includes('redemption_claims'),
      )))
      .catch(() => setRedemptionAvailable(false));
  }, [id, org]);
  if (loading) return <main className="page"><div className="loading-state" aria-live="polite"><span className="loading-mark" />Cargando experiencia…</div></main>;
  if (!id || !experience) return <main className="page"><div className="empty"><h2>No se pudo cargar la experiencia.</h2>{loadError && <p className="error">{loadError}</p>}<button className="secondary" onClick={() => navigate('/app/experiences')}>Volver a experiencias</button></div></main>;
  const Editor =
    experienceEditors[experience.type as keyof typeof experienceEditors];
  const prizes = experience.draftConfig?.prizes ?? [];
  async function clone() {
    if (!window.confirm('Se creará una nueva experiencia en estado borrador. Los giros, premios obtenidos y stock no se copiarán. ¿Continuar?')) return;
    try {
      const cloned = await experiencesApi.clone(id, org);
      navigate(`/app/experiences/${cloned.id}`);
    } catch (error) {
      window.alert((error as Error).message);
    }
  }
  const canManage = permissions.includes('crm.manage');
  return <main className="page experience-workspace">
    <header className="experience-workspace-header">
      <div><p className="eyebrow">EXPERIENCIA / OPERACIÓN</p><h1>{experience.name}</h1><p className="page-description">Configuración, disponibilidad y resultados de esta experiencia.</p></div>
      <div className="workspace-actions"><ExperienceQrModal slug={experience.slug} runtimeBaseUrl={runtime} />{canManageCommercial && <button type="button" className="secondary" onClick={() => void clone()}>Duplicar</button>}</div>
    </header>
    <nav className="workspace-nav" aria-label="Secciones de experiencia"><a href="#overview">Resumen</a><a href="#configuration">Configuración</a><a href="#results">Resultados</a></nav>
    <section id="overview" className="workspace-section"><div className="workspace-section-heading"><div><p className="eyebrow">RESUMEN</p><h2>Estado operativo</h2></div><span className={`status status-${experience.status}`}>{experience.status === 'published' ? 'Publicada' : 'Borrador'}</span></div><div className="workspace-overview-grid"><section className="card workspace-summary"><h3>Disponibilidad pública</h3><p>La experiencia se accede desde su enlace público. Publicá una versión guardada para aplicar la configuración al runtime.</p><a className="workspace-link" href={`${runtime}/r/${encodeURIComponent(experience.slug)}`} target="_blank" rel="noreferrer">Abrir enlace público →</a></section><PublishControls organizationId={org} canPublish={canManage} /><AccessPeriodPanel experienceId={id} organizationId={org} canManage={canManageCommercial} /></div></section>
    <section id="configuration" className="workspace-section"><div className="workspace-section-heading"><div><p className="eyebrow">CONFIGURACIÓN</p><h2>Diseño, premios y participación</h2></div></div>{Editor ? <Editor org={org} id={id} redemptionAvailable={redemptionAvailable} canEdit={canManage} canAdjustInventory={canManage} /> : <div className="empty"><p>Esta experiencia todavía no tiene un editor disponible.</p></div>}</section>
    <section id="results" className="workspace-section"><div className="workspace-section-heading"><div><p className="eyebrow">RESULTADOS</p><h2>Giros y canjes</h2></div></div><div className="workspace-results"><SpinHistory experienceId={id} organizationId={org} prizes={prizes} /><ClaimsPanel experienceId={id} organizationId={org} canRedeem={canManage} /></div></section>
  </main>;
}
