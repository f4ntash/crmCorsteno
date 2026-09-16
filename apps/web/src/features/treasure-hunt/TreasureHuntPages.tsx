import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { formatPublicationDate } from '../../shared/publication/status';
import { treasureHuntApi, type TreasureHuntDetail, type TreasureHuntSummary } from './api';
import './treasure-hunt.css';

const statusLabels: Record<string, string> = {
  ACTIVE: 'Activa',
  PAUSED: 'Pausada',
  ARCHIVED: 'Archivada',
  DRAFT: 'Borrador',
  PUBLISHED: 'Publicada',
};
const progressionLabels: Record<string, string> = { SEQUENTIAL: 'Secuencial', FREEFORM: 'Libre' };
const rewardTypeLabels: Record<string, string> = {
  COUPON: 'Cupón',
  TEXT: 'Texto',
  QR_REWARD: 'Premio QR',
  DIGITAL_ITEM: 'Producto digital',
};

function date(value: string | null | undefined) {
  return formatPublicationDate(value) || '—';
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError && error.code === 'UNAUTHORIZED') return 'Tu sesión ya no es válida. Volvé a iniciar sesión.';
  if (error instanceof ApiError && error.code === 'NOT_FOUND') return 'No encontramos esta campaña en la organización actual.';
  return 'No pudimos cargar Búsqueda del Tesoro. Intentá nuevamente.';
}

type TreasureHuntPageProps = { org: string; organizationName?: string; canManage?: boolean };

export function TreasureHuntListPage({ org, canManage = false }: TreasureHuntPageProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<TreasureHuntSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = () => {
    if (!org) return;
    setLoading(true);
    setError('');
    void treasureHuntApi.list(org)
      .then((result) => setItems(result.items))
      .catch((caught) => setError(errorMessage(caught)))
      .finally(() => setLoading(false));
  };
  useEffect(() => { setItems([]); load(); }, [org]);

  return <main className="page treasure-hunt-page">
    <div className="page-heading">
      <div>
        <p className="eyebrow">EXPERIENCIAS · BÚSQUEDA DEL TESORO</p>
        <h1>Búsqueda del Tesoro</h1>
        <p className="page-description">Consultá las campañas y sus versiones publicadas de forma segura.</p>
      </div>
      <div className="treasure-hunt-heading-actions"><span className="read-only-badge">{canManage ? 'Edición de borradores' : 'Solo lectura'}</span>{canManage && <button type="button" className="button" onClick={() => navigate('/app/treasure-hunt/new')}>Nueva búsqueda del tesoro</button>}</div>
    </div>
    {loading ? <div className="loading-state" aria-live="polite"><span className="loading-mark" />Cargando campañas…</div>
      : error ? <div className="empty"><h2>{error}</h2><button className="button button-secondary" onClick={load}>Reintentar</button></div>
        : items.length === 0 ? <div className="empty"><h2>No hay campañas para esta organización.</h2><p>Cuando se asigne una campaña de Búsqueda del Tesoro, va a aparecer acá.</p></div>
          : <div className="treasure-hunt-list">{items.map((item) => <article className="treasure-hunt-card" key={item.campaignId}>
            <div className="treasure-hunt-card-main">
              <p className="eyebrow">CAMPAÑA</p>
              <h2>{item.name}</h2>
              <p className="treasure-hunt-secondary">{item.slug}</p>
            </div>
            <div className="treasure-hunt-card-status"><span className={`status status-${item.status.toLowerCase()}`}>{item.publishedVersion ? `${statusLabels[item.status] ?? item.status} · v${item.publishedVersion}` : `${item.draftStatus ?? 'Borrador · Sin publicar'}${item.draftIncomplete ? ' · incompleto' : ''}`}</span>{item.draftStatus && item.publishedVersion && <small>{item.draftStatus}{item.draftIncomplete ? ' · incompleto' : ''}</small>}</div>
            <div className="treasure-hunt-card-meta">
              <span><small>Versión publicada</small><strong>{item.publishedVersion ? `v${item.publishedVersion}` : 'Sin publicar'}</strong></span>
              <span><small>Recorrido</small><strong>{item.stepCount} {item.stepCount === 1 ? 'paso' : 'pasos'}</strong></span>
              <span><small>Premio</small><strong>{item.rewardName ?? 'Sin premio'}</strong></span>
              <span><small>Actualizada</small><strong>{date(item.updatedAt)}</strong></span>
            </div>
            <div className="treasure-hunt-card-actions"><button className="button button-secondary" onClick={() => navigate(`/app/treasure-hunt/${item.campaignId}`)}>Ver campaña</button>{canManage && <button className="button button-quiet" onClick={() => navigate(`/app/treasure-hunt/${item.campaignId}/draft`)}>Editar borrador</button>}</div>
          </article>)}</div>}
  </main>;
}

export function TreasureHuntDetailPage({ org, organizationName, canManage = false }: TreasureHuntPageProps) {
  const { id = '' } = useParams();
  const [campaign, setCampaign] = useState<TreasureHuntDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = () => {
    if (!org || !id) return;
    setLoading(true);
    setError('');
    void treasureHuntApi.get(org, id)
      .then((result) => setCampaign(result.campaign))
      .catch((caught) => setError(errorMessage(caught)))
      .finally(() => setLoading(false));
  };
  useEffect(() => { setCampaign(null); load(); }, [org, id]);
  if (loading) return <main className="page access-state"><span className="loading-mark" />Cargando campaña…</main>;
  if (error || !campaign) return <main className="page empty"><h1>{error || 'Campaña no encontrada.'}</h1><Link className="button button-secondary" to="/app/treasure-hunt">Volver a campañas</Link></main>;
  const published = campaign.versions.find((version) => version.version === campaign.publishedVersion);
  return <main className="page treasure-hunt-page">
    <div className="page-heading">
      <div>
        <Link className="back-link" to="/app/treasure-hunt">← Búsqueda del Tesoro</Link>
        <p className="eyebrow">CAMPAÑA</p>
        <h1>{campaign.name}</h1>
        <p className="page-description">{campaign.slug}</p>
      </div>
      <div className="treasure-hunt-heading-actions"><span className="read-only-badge">{canManage ? 'Edición de borradores' : 'Solo lectura'}</span>{canManage && <Link className="button" to={`/app/treasure-hunt/${campaign.campaignId}/draft`}>Editar borrador</Link>}</div>
    </div>
    <div className="treasure-hunt-detail-grid">
      <section className="card treasure-hunt-section">
        <div className="workspace-section-heading"><div><p className="eyebrow">GENERAL</p><h2>Información de la campaña</h2></div><span className={`status status-${campaign.status.toLowerCase()}`}>{statusLabels[campaign.status] ?? campaign.status}</span></div>
        <dl className="treasure-hunt-facts">
          <div><dt>Organización</dt><dd>{organizationName ?? 'Organización actual'}</dd></div>
          <div><dt>Versión publicada</dt><dd>{published ? `v${published.version} · ${published.name}` : 'Sin publicar'}</dd></div>
          <div><dt>Progresión</dt><dd>{campaign.progressionMode ? progressionLabels[campaign.progressionMode] ?? campaign.progressionMode : '—'}</dd></div>
          <div><dt>Última actualización</dt><dd>{date(campaign.updatedAt)}</dd></div>
        </dl>
        {campaign.description && <p className="field-help">{campaign.description}</p>}
      </section>
      {campaign.draft && <section className="card treasure-hunt-section treasure-hunt-draft-summary"><div className="workspace-section-heading"><div><p className="eyebrow">BORRADOR</p><h2>{campaign.draft.draftStatus}</h2></div><span className={campaign.draft.draftIncomplete ? 'status status-paused' : 'status status-published'}>{campaign.draft.draftIncomplete ? 'Incompleto' : 'Guardado'}</span></div><p className="field-help">Revisión {campaign.draft.draftRevision} · {campaign.draft.draftIssueCount ? `${campaign.draft.draftIssueCount} observaciones pendientes.` : 'Sin observaciones pendientes.'}</p></section>}
      <section className="card treasure-hunt-section">
        <div className="workspace-section-heading"><div><p className="eyebrow">RECORRIDO</p><h2>{campaign.steps.length} {campaign.steps.length === 1 ? 'paso' : 'pasos'}</h2></div></div>
        <ol className="treasure-hunt-steps">{campaign.steps.map((step) => <li key={step.stepId}>
          <div><strong>{step.title}</strong><p>{step.clue}</p></div>
          <div className="treasure-hunt-step-trigger"><span>Imagen objetivo</span><small>{step.triggerId}</small></div>
        </li>)}</ol>
      </section>
      <section className="card treasure-hunt-section">
        <div className="workspace-section-heading"><div><p className="eyebrow">PREMIO</p><h2>Premio configurado</h2></div></div>
        {campaign.reward ? <dl className="treasure-hunt-facts">
          <div><dt>Nombre</dt><dd>{campaign.reward.name}</dd></div>
          <div><dt>Valor</dt><dd>{campaign.reward.displayValue}</dd></div>
          <div><dt>Tipo</dt><dd>{rewardTypeLabels[campaign.reward.type] ?? campaign.reward.type}</dd></div>
          <div><dt>Expiración</dt><dd>{campaign.reward.expiresInSeconds ? `${Math.round(campaign.reward.expiresInSeconds / 3600)} h` : 'Sin expiración'}</dd></div>
        </dl> : <p className="treasure-hunt-secondary">No hay premio configurado.</p>}
      </section>
      <section className="card treasure-hunt-section">
        <div className="workspace-section-heading"><div><p className="eyebrow">VERSIONES</p><h2>Historial de versiones</h2></div></div>
        <div className="treasure-hunt-versions">{campaign.versions.map((version) => <div className="treasure-hunt-version" key={version.id}>
          <div><strong>v{version.version} · {version.name}</strong><p>{version.description}</p></div>
          <span className={`status status-${version.publicationStatus.toLowerCase()}`}>{version.version === campaign.publishedVersion ? 'Publicada' : statusLabels[version.publicationStatus] ?? version.publicationStatus}</span>
        </div>)}</div>
      </section>
    </div>
  </main>;
}
