import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../../shared/api/client';
import type { AttentionResponse } from '../../shared/attention/types';
import type { Experience } from '../experiences/types';
import { activeWorkspaceApplications, type WorkspaceApplication } from '../../app/navigation';

type Application = WorkspaceApplication & { projectId: string };
type Project = { id: string; name: string };
type Summary = { totals: { uniqueUsers?: number; sessions?: number; appOpens?: number; totalEvents?: number; lastActivityAt?: number | null; [key: string]: number | null | undefined } };
type Operations = { items: Array<{ experienceId: string; recentUsers: number; lastActivityAt: number | null; claimsGenerated: number; pendingClaims: number; soldOutLimitedPrizes: number }> };
const statusLabels: Record<string, string> = { draft: 'Borrador', active: 'Activa', scheduled: 'Programada', expired: 'Vencida', paused: 'Pausada' };
const typeLabels: Record<string, string> = { roulette: 'Ruleta', website: 'Web', ar: 'AR', 'product-catalog': 'Catálogo de productos', game: 'Juego', webar: 'AR', generic: 'Experiencia' };

function get<T>(path: string, org: string, init?: RequestInit) { return apiRequest<T>(path, org, init); }
function number(value: number | null | undefined) { return value === null || value === undefined ? '—' : value.toLocaleString('es-AR'); }
function date(value: number | string | null | undefined) { if (value === null || value === undefined) return 'Sin actividad'; const result = new Date(value); return Number.isNaN(result.getTime()) ? 'Sin actividad' : result.toLocaleString('es-AR'); }

function AttentionBlock({ attentionError, attention }: { attentionError: boolean; attention?: AttentionResponse }) {
  if (attentionError) return <section className="home-attention home-attention-error" aria-label="Atención"><div><p className="eyebrow">ATENCIÓN</p><h2>No pudimos cargar la atención</h2><p>Podés reintentar desde el centro de atención.</p><Link to="/app/attention">Abrir atención →</Link></div></section>;
  if (!attention || attention.items.length === 0) return null;
  return <section className="home-attention" aria-label="Requiere atención"><div><p className="eyebrow">ATENCIÓN</p><h2>Requiere atención <small>{attention.total}</small></h2></div>{attention.items.map((item) => <Link key={item.id} to={item.actionHref ?? `/app/experiences/${item.resourceId}#overview`}><div><strong>{item.title}</strong>{item.description && <small>{item.description}</small>}</div><span>{item.actionLabel ?? 'Revisar'} →</span></Link>)}{attention.total - attention.items.length > 0 && <Link className="home-attention-more" to="/app/attention">Ver todas las situaciones →</Link>}</section>;
}

export function OperationsHome({ org, organizationName, isPlatformAdmin = false, canViewWorkspace = true, canViewAnalytics = false, showProductOperations = true }: { org: string; organizationName?: string; isPlatformAdmin?: boolean; canViewWorkspace?: boolean; canViewAnalytics?: boolean; showProductOperations?: boolean }) {
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [summary, setSummary] = useState<Summary>();
  const [operations, setOperations] = useState<Operations>();
  const [attention, setAttention] = useState<AttentionResponse>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attentionError, setAttentionError] = useState(false);

  useEffect(() => {
    if (!org || !canViewWorkspace) { setLoading(false); return; }
    setLoading(true);
    setError(false);
    setAttentionError(false);
    setExperiences([]);
    setApplications([]);
    setProjects([]);
    setSummary(undefined);
    setOperations(undefined);
    setAttention(undefined);
    void Promise.allSettled([
      get<Experience[]>('/experiences', org),
      get<Application[]>('/applications', org, { cache: 'no-store' }),
      get<Project[]>('/projects', org),
      get<Summary>('/analytics/summary?range=7d', org),
      get<Operations>('/experiences/operations-summary', org),
      get<AttentionResponse>('/attention?limit=4', org),
    ]).then(([experienceResult, applicationResult, projectResult, summaryResult, operationsResult, attentionResult]) => {
      if (experienceResult.status === 'fulfilled') setExperiences(experienceResult.value); else setError(true);
      if (applicationResult.status === 'fulfilled') setApplications(applicationResult.value);
      if (projectResult.status === 'fulfilled') setProjects(projectResult.value);
      if (summaryResult.status === 'fulfilled') setSummary(summaryResult.value);
      if (operationsResult.status === 'fulfilled') setOperations(operationsResult.value);
      if (attentionResult.status === 'fulfilled') setAttention(attentionResult.value); else setAttentionError(true);
    }).finally(() => setLoading(false));
  }, [org, canViewWorkspace]);

  const operationsById = new Map((operations?.items ?? []).map((item) => [item.experienceId, item]));
  const appById = new Map(applications.map((item) => [item.id, item]));
  const projectById = new Map(projects.map((item) => [item.id, item]));
  const activeApplications = activeWorkspaceApplications(applications);
  const analyticsApplicationName = activeApplications.map((item) => item.name).join(', ');
  const showAnalyticsSummary = canViewAnalytics && activeApplications.length > 0;
  const activeCount = experiences.filter((item) => item.effective_status === 'active').length;
  const claimsGenerated = operations?.items.reduce((total, item) => total + item.claimsGenerated, 0) ?? 0;
  const pendingClaims = operations?.items.reduce((total, item) => total + item.pendingClaims, 0) ?? 0;

  if (!canViewWorkspace && isPlatformAdmin) return <main className="page operations-home"><div className="home-heading"><div><p className="eyebrow">CORSTENO / ADMINISTRACIÓN</p><h1>Administración global</h1><p className="page-description">Gestioná el catálogo comercial, las suscripciones y los clientes desde las herramientas de plataforma.</p></div></div></main>;
  if (!canViewWorkspace) return <main className="page operations-home"><div className="home-heading"><div><p className="eyebrow">CORSTENO / OPERACIÓN</p><h1>Operación de canjes</h1><p className="page-description">Accedé al flujo de búsqueda y canje de premios.</p></div></div><Link className="button button-primary" to="/app/redeem">Canjear premio</Link></main>;
  if (!loading && !error && experiences.length === 0 && !showAnalyticsSummary) return <main className="page operations-home"><div className="empty"><h2>Este workspace todavía no tiene productos configurados.</h2></div></main>;
  return <main className="page operations-home">
    <div className="home-heading"><div><p className="eyebrow">{organizationName ?? (isPlatformAdmin ? 'CORSTENO / ADMINISTRACIÓN' : 'ESPACIO DE TRABAJO')}</p><h1>Centro de operaciones</h1><p className="page-description">Tus experiencias, actividad reciente y próximos pasos.</p></div>{showProductOperations && experiences.length > 0 && <Link className="button button-secondary" to="/app/experiences">Ver experiencias</Link>}</div>
    {loading ? <div className="loading-state" aria-live="polite"><span className="loading-mark" />Cargando operaciones…</div> : <>
      {showAnalyticsSummary && <section className="home-analytics-summary" aria-label="Resumen de Analytics"><div className="section-heading"><div><p className="eyebrow">ANALYTICS · ÚLTIMOS 7 DÍAS</p><h2>{analyticsApplicationName}</h2><p>Resumen de actividad de las aplicaciones activas.</p></div><Link className="button button-secondary" to="/app/analytics">Ver Analytics →</Link></div><div className="home-summary"><Metric label="Usuarios" value={summary?.totals.uniqueUsers} /><Metric label="Sesiones" value={summary?.totals.sessions} /><Metric label="Aperturas" value={summary?.totals.appOpens} /><Metric label="Eventos" value={summary?.totals.totalEvents} /></div></section>}
      {showProductOperations && <section className="home-summary" aria-label="Resumen de operaciones"><Metric label="Experiencias activas" value={activeCount} /><Metric label="Usuarios recientes · 7 días" value={summary?.totals.uniqueUsers} /><Metric label="Última actividad" value={date(summary?.totals.lastActivityAt)} /><Metric label="Pendientes de canje" value={claimsGenerated > 0 ? pendingClaims : null} /></section>}
      {showProductOperations && <AttentionBlock attentionError={attentionError} attention={attention} />}
      {(showProductOperations || !showAnalyticsSummary) && <section className="home-experiences"><div className="section-heading"><div><p className="eyebrow">EXPERIENCIAS</p><h2>Tu espacio de trabajo</h2></div><span>{experiences.length} {experiences.length === 1 ? 'experiencia' : 'experiencias'}</span></div>{error && <p className="error" role="alert">No se pudieron cargar todas las experiencias.</p>}{experiences.length === 0 ? <div className="empty"><h3>Este workspace todavía no tiene productos configurados.</h3><p>Cuando se asigne una experiencia, sus módulos van a aparecer acá.</p></div> : <div className="home-experience-list">{experiences.map((experience) => { const app = appById.get(experience.applicationId ?? ''); const project = app ? projectById.get(app.projectId) : undefined; const op = operationsById.get(experience.id); const type = experience.type; return <article className="home-experience-row" key={experience.id}><div className="home-experience-main"><h2>{experience.name}</h2><p>{typeLabels[type] ?? type}{project ? ` · ${project.name}` : ''}</p></div><span className={`status status-${experience.effective_status}`}>{statusLabels[experience.effective_status] ?? experience.effective_status}</span><div className="home-experience-activity"><span>{op?.recentUsers ? `${number(op.recentUsers)} usuarios · ` : ''}{date(op?.lastActivityAt)}</span>{type === 'roulette' && op && <small>{op.pendingClaims > 0 ? `${op.pendingClaims} pendientes de canje` : op.soldOutLimitedPrizes > 0 ? `${op.soldOutLimitedPrizes} premios agotados` : 'Sin alertas operativas'}</small>}</div><Link className="button button-secondary" to={`/app/experiences/${experience.id}`}>Abrir espacio</Link></article>; })}</div>}</section>}
    </>}
  </main>;
}

function Metric({ label, value }: { label: string; value: number | string | null | undefined }) { return <div className="home-summary-metric"><small>{label}</small><strong>{value === null || value === undefined ? '—' : typeof value === 'number' ? number(value) : value}</strong></div>; }
