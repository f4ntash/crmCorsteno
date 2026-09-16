import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { treasureHuntApi, type TreasureHuntDetail, type TreasureHuntSummary } from './api';
import './treasure-hunt.css';

const statusLabels: Record<string, string> = { ACTIVE: 'Activa', PAUSED: 'Pausada', ARCHIVED: 'Archivada', DRAFT: 'Borrador', PUBLISHED: 'Publicada' };
function date(value: string | null | undefined) { return value ? new Date(value).toLocaleString('es-AR') : '—'; }
function errorMessage(error: unknown) {
  if (error instanceof ApiError && error.code === 'UNAUTHORIZED') return 'Tu sesión ya no es válida. Volvé a iniciar sesión.';
  if (error instanceof ApiError && error.code === 'NOT_FOUND') return 'No encontramos esta campaña en la organización actual.';
  return 'No pudimos cargar Treasure Hunt. Intentá nuevamente.';
}

export function TreasureHuntListPage({ org }: { org: string }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<TreasureHuntSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = () => {
    if (!org) return;
    setLoading(true); setError('');
    void treasureHuntApi.list(org).then((result) => setItems(result.items)).catch((caught) => setError(errorMessage(caught))).finally(() => setLoading(false));
  };
  useEffect(() => { setItems([]); load(); }, [org]);
  return <main className="page treasure-hunt-page">
    <div className="page-heading"><div><p className="eyebrow">EXPERIENCIAS · TREASURE HUNT</p><h1>Búsqueda del Tesoro</h1><p className="page-description">Consultá las campañas y sus versiones publicadas de forma segura.</p></div><span className="read-only-badge">Solo lectura</span></div>
    {loading ? <div className="loading-state" aria-live="polite"><span className="loading-mark" />Cargando campañas…</div> : error ? <div className="empty"><h2>{error}</h2><button className="button button-secondary" onClick={load}>Reintentar</button></div> : items.length === 0 ? <div className="empty"><h2>No hay campañas para esta organización.</h2><p>Cuando se asigne una campaña de Treasure Hunt, va a aparecer acá.</p></div> : <div className="treasure-hunt-list">{items.map((item) => <article className="treasure-hunt-card" key={item.campaignId}><div className="treasure-hunt-card-main"><p className="eyebrow">CAMPAÑA</p><h2>{item.name}</h2><p className="muted">{item.slug}</p></div><span className={`status status-${item.status.toLowerCase()}`}>{statusLabels[item.status] ?? item.status}</span><div className="treasure-hunt-card-meta"><span><small>Versión publicada</small>{item.publishedVersion ? `v${item.publishedVersion}` : 'Sin publicar'}</span><span><small>Recorrido</small>{item.stepCount} {item.stepCount === 1 ? 'step' : 'steps'}</span><span><small>Reward</small>{item.rewardName ?? 'Sin reward'}</span><span><small>Actualizada</small>{date(item.updatedAt)}</span></div><button className="button button-secondary" onClick={() => navigate(`/app/treasure-hunt/${item.campaignId}`)}>Ver campaña</button></article>)}</div>}
  </main>;
}

export function TreasureHuntDetailPage({ org }: { org: string }) {
  const { id = '' } = useParams();
  const [campaign, setCampaign] = useState<TreasureHuntDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = () => { if (!org || !id) return; setLoading(true); setError(''); void treasureHuntApi.get(org, id).then((result) => setCampaign(result.campaign)).catch((caught) => setError(errorMessage(caught))).finally(() => setLoading(false)); };
  useEffect(() => { setCampaign(null); load(); }, [org, id]);
  if (loading) return <main className="page access-state"><span className="loading-mark" />Cargando campaña…</main>;
  if (error || !campaign) return <main className="page empty"><h1>{error || 'Campaña no encontrada.'}</h1><Link className="button button-secondary" to="/app/treasure-hunt">Volver a campañas</Link></main>;
  const published = campaign.versions.find((version) => version.version === campaign.publishedVersion);
  return <main className="page treasure-hunt-page">
    <div className="page-heading"><div><Link className="back-link" to="/app/treasure-hunt">← Búsqueda del Tesoro</Link><p className="eyebrow">CAMPAÑA</p><h1>{campaign.name}</h1><p className="page-description">{campaign.slug}</p></div><span className="read-only-badge">Solo lectura</span></div>
    <div className="treasure-hunt-detail-grid">
      <section className="card treasure-hunt-section"><div className="workspace-section-heading"><div><p className="eyebrow">GENERAL</p><h2>Información de la campaña</h2></div><span className={`status status-${campaign.status.toLowerCase()}`}>{statusLabels[campaign.status] ?? campaign.status}</span></div><dl className="treasure-hunt-facts"><div><dt>Organización</dt><dd>{campaign.organizationId}</dd></div><div><dt>Versión publicada</dt><dd>{published ? `v${published.version} · ${published.name}` : 'Sin publicar'}</dd></div><div><dt>Progresión</dt><dd>{campaign.progressionMode ?? '—'}</dd></div><div><dt>Última actualización</dt><dd>{date(campaign.updatedAt)}</dd></div></dl>{campaign.description && <p className="field-help">{campaign.description}</p>}</section>
      <section className="card treasure-hunt-section"><div className="workspace-section-heading"><div><p className="eyebrow">RECORRIDO</p><h2>{campaign.steps.length} {campaign.steps.length === 1 ? 'step' : 'steps'}</h2></div></div><ol className="treasure-hunt-steps">{campaign.steps.map((step) => <li key={step.stepId}><div><strong>{step.title}</strong><p>{step.clue}</p></div><small>{step.triggerId}</small></li>)}</ol></section>
      <section className="card treasure-hunt-section"><div className="workspace-section-heading"><div><p className="eyebrow">REWARD</p><h2>Premio configurado</h2></div></div>{campaign.reward ? <dl className="treasure-hunt-facts"><div><dt>Nombre</dt><dd>{campaign.reward.name}</dd></div><div><dt>Valor</dt><dd>{campaign.reward.displayValue}</dd></div><div><dt>Tipo</dt><dd>{campaign.reward.type}</dd></div><div><dt>Expiración</dt><dd>{campaign.reward.expiresInSeconds ? `${Math.round(campaign.reward.expiresInSeconds / 3600)} h` : 'Sin expiración'}</dd></div></dl> : <p className="muted">No hay reward configurado.</p>}</section>
      <section className="card treasure-hunt-section"><div className="workspace-section-heading"><div><p className="eyebrow">VERSIONES</p><h2>Historial de versiones</h2></div></div><div className="treasure-hunt-versions">{campaign.versions.map((version) => <div className="treasure-hunt-version" key={version.id}><div><strong>v{version.version} · {version.name}</strong><p>{version.description}</p></div><span className={`status status-${version.publicationStatus.toLowerCase()}`}>{version.version === campaign.publishedVersion ? 'Publicada' : statusLabels[version.publicationStatus] ?? version.publicationStatus}</span></div>)}</div></section>
    </div>
  </main>;
}
