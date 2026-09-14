import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, apiRequest } from '../../../shared/api/client';
import { experiencesApi } from '../api';
import { commercialApi } from '../../commercial/api';
import { experienceEditors } from '../registry';
import { PublicationControls, type PublicationReadinessIssue } from '../../../shared/publication/PublicationControls';
import { SpinHistory } from '../components/SpinHistory';
import { ClaimsPanel } from '../components/ClaimsPanel';
import { AccessPeriodPanel } from '../components/AccessPeriodPanel';
import { RouletteOperationsOverview } from '../components/RouletteOperationsOverview';
import { ExperienceQrModal } from '../components/ExperienceQrModal';
import { previewExperienceUrl, publicExperienceUrl } from '../../../shared/runtime/publicExperienceUrl';
import { channelTypeLabels, channelsApi, type Channel } from '../../channels/api';
type LegacyJson = ReturnType<JSON['parse']>;
type ExperienceDetail = {
  id: string;
  type: string;
  slug: string;
  name: string;
  status: string;
  effective_status: 'draft' | 'published' | 'paused' | 'scheduled' | 'active' | 'expired';
  access_status?: string;
  startsAt: string | null;
  endsAt: string | null;
  draftConfig: unknown;
  publishedConfig: unknown;
  channels?: Channel[];
};

async function get<T = LegacyJson>(
  path: string,
  org?: string,
  init?: RequestInit,
) {
  return apiRequest<T>(path, org, init);
}

function readinessFrom(error: unknown) {
  if (!(error instanceof ApiError) || !Array.isArray(error.details)) return [];
  return error.details.filter((issue): issue is PublicationReadinessIssue => !!issue && typeof issue === 'object' && typeof (issue as { message?: unknown }).message === 'string');
}

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
  const [experience, setExperience] = useState<ExperienceDetail>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [redemptionAvailable, setRedemptionAvailable] = useState(false);
  const [brandingAvailable, setBrandingAvailable] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [catalogDirty, setCatalogDirty] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [publicationMessage, setPublicationMessage] = useState('');
  const [publicationError, setPublicationError] = useState('');
  const [readinessIssues, setReadinessIssues] = useState<PublicationReadinessIssue[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [organizationChannels, setOrganizationChannels] = useState<Channel[]>([]);
  const [channelSaving, setChannelSaving] = useState(false);
  useEffect(() => {
    if (!id || !org) return;
    setLoading(true);
    setLoadError('');
    setChannels([]);
    setOrganizationChannels([]);
    get(`/experiences/${id}`, org)
      .then(setExperience)
      .catch((error) => { setExperience(undefined); setLoadError((error as Error).message); })
      .finally(() => setLoading(false));
    get<{ items: Channel[] }>(`/experiences/${id}/channels`, org)
      .then((result) => setChannels(result.items))
      .catch(() => setChannels([]));
    channelsApi.list(org)
      .then(setOrganizationChannels)
      .catch(() => setOrganizationChannels([]));
    commercialApi.subscriptions(org)
      .then((subscriptions) => {
        setRedemptionAvailable(subscriptions.some((subscription) =>
        subscription.experiences.some((attached) => attached.id === id) &&
        subscription.featureEntitlements.features.includes('redemption_claims'),
        ));
        setBrandingAvailable(subscriptions.some((subscription) =>
          subscription.experiences.some((attached) => attached.id === id) &&
          subscription.featureEntitlements.features.includes('custom_branding'),
        ));
      })
      .catch(() => setRedemptionAvailable(false));
  }, [id, org]);
  useEffect(() => {
    if (!dirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const warnBeforeSpaNavigation = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('a') : null;
      if (!target || target.target === '_blank' || !target.href) return;
      const next = new URL(target.href, window.location.href);
      if (next.origin !== window.location.origin || (next.pathname === window.location.pathname && next.search === window.location.search)) return;
      if (!window.confirm('Hay cambios sin guardar. ¿Querés salir de esta experiencia?')) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    document.addEventListener('click', warnBeforeSpaNavigation, true);
    return () => {
      window.removeEventListener('beforeunload', warnBeforeUnload);
      document.removeEventListener('click', warnBeforeSpaNavigation, true);
    };
  }, [dirty]);
  if (loading) return <main className="page"><div className="loading-state" aria-live="polite"><span className="loading-mark" />Cargando experiencia…</div></main>;
  if (!id || !experience) return <main className="page"><div className="empty"><h2>No se pudo cargar la experiencia.</h2>{loadError && <p className="error">{loadError}</p>}<button className="secondary" onClick={() => navigate('/app/experiences')}>Volver a experiencias</button></div></main>;
  const Editor =
    experienceEditors[experience.type as keyof typeof experienceEditors];
  const prizes = experience.draftConfig && typeof experience.draftConfig === 'object' && !Array.isArray(experience.draftConfig) && Array.isArray((experience.draftConfig as { prizes?: unknown }).prizes)
    ? (experience.draftConfig as { prizes: Array<{ id: string; name: string }> }).prizes
    : [];
  async function clone() {
    if (!window.confirm('Se creará una nueva experiencia en estado borrador. Los giros, premios obtenidos y stock no se copiarán. ¿Continuar?')) return;
    try {
      const cloned = await experiencesApi.clone(id, org);
      navigate(`/app/experiences/${cloned.id}`, { state: { cloneNotice: 'Copia independiente creada como borrador. Revisá fechas, configuración y stock antes de publicar.' } });
    } catch (error) {
      window.alert((error as Error).message);
    }
  }
  const canManage = permissions.includes('crm.manage');
  const hostedChannel = channels.find((channel) => channel.type === 'hosted_runtime');
  const availableHostedChannel = organizationChannels.find((channel) => channel.type === 'hosted_runtime' && !channels.some((connected) => connected.id === channel.id));
  const hostedRuntimeAvailable = hostedChannel?.status === 'active' &&
    experience.effective_status === 'active' &&
    !['no_access', 'expired'].includes(experience.access_status ?? '');
  const publicUrl = hostedRuntimeAvailable ? publicExperienceUrl(experience.slug) : null;
  async function connectHosted() {
    if (!canManage || channelSaving || hostedChannel || !availableHostedChannel) return;
    setChannelSaving(true);
    try {
      const connected = await channelsApi.linkExperience(availableHostedChannel.id, org, id);
      setChannels((current) => [...current, connected]);
    } catch (error) {
      window.alert((error as Error).message);
    } finally {
      setChannelSaving(false);
    }
  }
  async function disconnectHosted() {
    if (!canManage || channelSaving || !hostedChannel) return;
    if (!window.confirm('¿Desconectar el canal alojado? El enlace público dejará de estar disponible hasta volver a conectarlo.')) return;
    setChannelSaving(true);
    try {
      await channelsApi.unlinkExperience(hostedChannel.id, org, id);
      setChannels((current) => current.filter((channel) => channel.id !== hostedChannel.id));
    } catch (error) {
      window.alert((error as Error).message);
    } finally {
      setChannelSaving(false);
    }
  }
  const previewUrl = previewExperienceUrl(id, org, window.location.href);
  const openPreview = () => {
    if (dirty) { window.alert('Guardá el borrador para probar los últimos cambios.'); return; }
    window.open(previewUrl, '_blank', 'noopener,noreferrer');
  };
  const hasUnpublishedChanges = JSON.stringify(experience.draftConfig) !== JSON.stringify(experience.publishedConfig) || catalogDirty;
  async function publish() {
    if (publishing) return;
    setPublishing(true);
    setPublicationMessage('');
    setPublicationError('');
    setReadinessIssues([]);
    try {
      const updated = await get<ExperienceDetail>(`/experiences/${id}/publish`, org, { method: 'POST' });
      setCatalogDirty(false);
      setExperience((current) => current ? { ...current, ...updated, access_status: current.access_status } : updated);
      setPublicationMessage('Publicado correctamente.');
    } catch (error) {
      const issues = readinessFrom(error);
      setReadinessIssues(issues);
      if (!issues.length) setPublicationError((error as Error).message);
    } finally {
      setPublishing(false);
    }
  }
  async function saveAvailability(startsAt: string | null, endsAt: string | null) {
    if (availabilitySaving) return;
    setAvailabilitySaving(true);
    try {
      const updated = await get<ExperienceDetail>(`/experiences/${id}`, org, {
        method: 'PATCH',
        body: JSON.stringify({ starts_at: startsAt, ends_at: endsAt }),
      });
      setExperience((current) => current ? { ...current, ...updated, access_status: current.access_status } : updated);
    } finally {
      setAvailabilitySaving(false);
    }
  }
  const isRoulette = experience.type === 'roulette';
  return <main className="page experience-workspace">
    <header className="experience-workspace-header">
      <div><p className="eyebrow">EXPERIENCIA / OPERACIÓN</p><h1>{experience.name}</h1><p className="page-description">Configuración, disponibilidad y resultados de esta experiencia.</p></div>
      <div className="workspace-actions">{canManage && <button type="button" className="secondary" onClick={() => void clone()}>Duplicar experiencia</button>}</div>
    </header>
    {location.state && typeof location.state === 'object' && 'cloneNotice' in location.state && <p className="clone-notice" role="status">{String((location.state as { cloneNotice?: unknown }).cloneNotice)}</p>}
    <nav className="workspace-nav" aria-label="Secciones de experiencia"><a href="#overview">Resumen</a><a href="#configuration">Configuración</a>{isRoulette && <a href="#results">Resultados</a>}</nav>
    {isRoulette && <RouletteOperationsOverview id={id} org={org} slug={experience.slug} status={experience.effective_status} accessStatus={experience.access_status} startsAt={experience.startsAt} endsAt={experience.endsAt} publicUrl={publicUrl} onTest={openPreview} />}
     <section id="overview" className="workspace-section"><div className="workspace-section-heading"><div><p className="eyebrow">RESUMEN</p><h2>Estado operativo</h2></div><span className={`status status-${experience.status}`}>{experience.status === 'published' ? 'Publicada' : 'Borrador'}</span></div><div className="workspace-overview-grid"><section className="card workspace-summary"><h3>Canales de publicación</h3><p>La experiencia puede publicarse en un sitio externo o alojarse opcionalmente por Corsteno.</p>{channels.length ? <ul className="workspace-channel-list">{channels.map((channel) => <li key={channel.id}><div><strong>{channel.name}</strong><small>{channelTypeLabels[channel.type]} · {channel.status === 'active' ? 'Activo' : 'Inactivo'}</small></div><div>{channel.type === 'hosted_runtime' ? publicUrl ? <a className="workspace-link" href={publicUrl} target="_blank" rel="noreferrer">Abrir enlace público →</a> : <span className="field-help">{channel.status !== 'active' ? 'Canal inactivo.' : experience.effective_status !== 'active' ? 'Disponible al publicar y activar la experiencia.' : 'No disponible por el acceso actual.'}</span> : <span>{channel.url ?? 'Sin dominio registrado'}</span>}<small>{channel.type === 'hosted_runtime' ? 'Entrega opcional alojada por Corsteno' : 'Registrado · Integración pendiente'}</small></div>{channel.type === 'hosted_runtime' && publicUrl && !isRoulette && <ExperienceQrModal slug={experience.slug} label="Ver QR" />}{channel.type === 'hosted_runtime' && canManage && <button type="button" className="button button-quiet" onClick={() => void disconnectHosted()} disabled={channelSaving}>{channelSaving ? 'Guardando…' : 'Desconectar'}</button>}</li>)}</ul> : <p className="field-help">No hay canales conectados a esta experiencia.</p>}{canManage && !hostedChannel && (availableHostedChannel ? <button type="button" className="button button-secondary workspace-channel-action" onClick={() => void connectHosted()} disabled={channelSaving}>{channelSaving ? 'Conectando…' : 'Conectar alojamiento de Corsteno'}</button> : <Link className="workspace-link workspace-channel-action" to="/app/channels">Crear canal alojado en Sitios y canales →</Link>)}{!canManage && !hostedChannel && <p className="field-help">Esta experiencia no tiene un canal alojado conectado.</p>}</section><PublicationControls status={experience.effective_status} accessStatus={experience.access_status} hasUnpublishedChanges={hasUnpublishedChanges} canPublish={canManage} onPublish={publish} publishing={publishing} readinessIssues={readinessIssues} startsAt={experience.startsAt} endsAt={experience.endsAt} canEditAvailability={canManage} availabilitySaving={availabilitySaving} onSaveAvailability={saveAvailability} showStatus={false} readOnly={!canManage} message={publicationMessage} error={publicationError} /><AccessPeriodPanel experienceId={id} organizationId={org} canManage={canManageCommercial} /></div></section>
    <section id="configuration" className="workspace-section"><div className="workspace-section-heading"><div><p className="eyebrow">CONFIGURACIÓN</p><h2>{isRoulette ? 'Diseño, premios y participación' : 'Contenido y productos'}</h2></div></div>{Editor ? <Editor org={org} id={id} redemptionAvailable={redemptionAvailable} brandingAvailable={brandingAvailable} canEdit={canManage} canAdjustInventory={canManage} canManageAssets={permissions.includes('assets.manage')} onDirtyChange={setDirty} onUnpublishedChange={setCatalogDirty} publication={isRoulette ? { status: experience.effective_status, accessStatus: experience.access_status, hasUnpublishedChanges, readinessIssues, canPublish: canManage, publishing, message: publicationMessage, error: publicationError } : undefined} onPublish={isRoulette ? () => void publish() : undefined} onDraftSaved={(draft) => { setExperience((current) => current ? { ...current, draftConfig: draft } : current); setReadinessIssues([]); setPublicationError(''); }} /> : <div className="empty"><p>Esta experiencia todavía no tiene un editor disponible.</p></div>}</section>
    {isRoulette && <section id="results" className="workspace-section"><div className="workspace-section-heading"><div><p className="eyebrow">RESULTADOS</p><h2>Giros y canjes</h2></div></div><div className="workspace-results"><SpinHistory experienceId={id} organizationId={org} prizes={prizes} /><ClaimsPanel experienceId={id} organizationId={org} canRedeem={canManage} /></div></section>}
  </main>;
}
