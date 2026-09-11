import type React from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiDownload, apiRequest } from '../../shared/api/client';
import { downloadCsv } from '../reports/download';
export { OperationsHome as Home } from './OperationsHome';

type Project = { id: string; name: string };
type Application = {
  id: string;
  name: string;
  projectId: string;
  status: string;
  applicationType?: string;
};
type Summary = {
  totals: Record<string, number>;
  rates: { completion: number; prizeConversion: number; rouletteConversion?: number };
  rouletteInsights?: { participants: number; completedSpins: number; winRate: number | null; prizesWon: number; claimsGenerated: number; claimsRedeemed: number; redemptionRate: number | null; blockedParticipation: number; claimsApplicable: boolean };
};
type Point = { timestamp: number; value: number };
type Item = { name: string; value: number };
type RoulettePrizePerformance = Item & { prizeId?: string; wins?: number; shareOfWins?: number | null; claimsGenerated?: number; pending?: number; redeemed?: number; redemptionRate?: number | null; claimsApplicable?: boolean };
function formatMetricValue(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue)
    ? numberValue.toLocaleString('es-AR')
    : '—';
}
function formatDateTime(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '')
    return 'Sin actividad';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Sin actividad'
    : date.toLocaleString('es-AR');
}
function formatPercentage(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return '—';
  return `${(value * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`;
}
type LegacyJson = ReturnType<JSON['parse']>;
async function get<T = LegacyJson>(path: string, org?: string, init?: RequestInit) { return apiRequest<T>(path, org, init); }

const metricLabels: Record<string, string> = {
  uniqueUsers: 'Usuarios únicos', sessions: 'Sesiones', appOpens: 'Aperturas', totalEvents: 'Eventos totales',
  experiencesStarted: 'Experiencias iniciadas', experiencesFinished: 'Experiencias completadas', targetsDetected: 'Targets detectados', favoritesAdded: 'Favoritos agregados',
  navigationsStarted: 'Navegaciones iniciadas', schedulesViewed: 'Agenda consultada', cameraPermissionsGranted: 'Permisos de cámara concedidos', cameraPermissionsDenied: 'Permisos de cámara denegados',
  gamesStarted: 'Juegos iniciados', gamesFinished: 'Juegos completados', prizesWon: 'Premios otorgados', prizesClaimed: 'Premios reclamados',
};
const displayLabels: Record<string, string> = {
  experience_view: 'Vista de experiencia', roulette_spin_click: 'Clic en girar', roulette_spin_started: 'Giro iniciado', roulette_spin_completed: 'Giro completado', roulette_spin_blocked: 'Giro bloqueado', roulette_prize_won: 'Premio otorgado',
  roulette_result_cta_click: 'Clic en CTA del resultado', roulette_ar_open_click: 'AR abierto', roulette_ar_session_started: 'Sesión AR iniciada', roulette_ar_placed: 'Ruleta colocada', roulette_ar_session_ended: 'Sesión AR finalizada',
  cooldown: 'En período de espera', device_limit: 'Límite por dispositivo', session_limit: 'Límite por sesión', already_participated: 'Ya participó', identity_required: 'Identidad requerida',
};
function readableLabel(value: string) { const key = value.trim().toLowerCase().replaceAll(' ', '_'); return displayLabels[value] ?? displayLabels[key] ?? value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function typeLabel(type?: string) { return type === 'webar' ? 'WebAR' : type === 'game' ? 'Juego' : type === 'roulette' ? 'Ruleta' : type === 'product-catalog' ? 'Catálogo de productos' : 'General'; }
function MetricCard({ label, value }: { label: string; value: number | string | null | undefined }) { return <div className="analytics-kpi"><small>{label}</small><b>{formatMetricValue(value)}</b></div>; }
function SectionHeading({ eyebrow, title, detail }: { eyebrow?: string; title: string; detail?: string }) { return <div className="analytics-section-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2>{detail && <p>{detail}</p>}</div></div>; }
function StatusPanel({ kind, children }: { kind: 'loading' | 'empty' | 'error'; children: React.ReactNode }) { return <div className={`analytics-state analytics-state-${kind}`} role={kind === 'error' ? 'alert' : undefined}>{kind === 'loading' && <span className="loading-mark" />}{children}</div>; }
function Funnel({ insight }: { insight: NonNullable<Summary['rouletteInsights']> }) {
  const steps = [{ label: 'Participaron', value: insight.participants }, { label: 'Giro completado', value: insight.completedSpins }, { label: 'Premio ganado', value: insight.prizesWon }, ...(insight.claimsApplicable ? [{ label: 'Claim generado', value: insight.claimsGenerated }, { label: 'Canjeado', value: insight.claimsRedeemed }] : [])];
  return <div className="roulette-funnel">{steps.map((step, index) => <div className="roulette-funnel-step" key={step.label}><strong>{formatMetricValue(step.value)}</strong><span>{step.label}</span>{index > 0 && <small>{steps[index - 1]!.value ? formatPercentage(step.value / steps[index - 1]!.value) : '—'} desde anterior</small>}</div>)}</div>;
}
function RouletteCampaignInsights({ summary, prizes, blocked, events, ar }: { summary: NonNullable<Summary['rouletteInsights']>; prizes: RoulettePrizePerformance[]; blocked: Item[]; events: Point[]; ar: { open: number; sessions: number; placed: number } }) {
  return <>
    <section className="analytics-section"><SectionHeading eyebrow="CAMPAÑA" title="Resultados de la ruleta" detail="Qué ocurrió en el período seleccionado." /><div className="grid analytics-kpi-grid roulette-kpis"><MetricCard label="Participantes / usuarios únicos" value={summary.participants} /><MetricCard label="Giros completados" value={summary.completedSpins} /><MetricCard label="Tasa de premios" value={formatPercentage(summary.winRate)} /><MetricCard label="Premios ganados" value={summary.prizesWon} /><MetricCard label="Claims generados" value={summary.claimsApplicable ? summary.claimsGenerated : null} /><MetricCard label="Claims canjeados" value={summary.claimsApplicable ? summary.claimsRedeemed : null} /><MetricCard label="Tasa de canje" value={summary.claimsApplicable ? formatPercentage(summary.redemptionRate) : null} /><MetricCard label="Participaciones bloqueadas" value={summary.blockedParticipation} /></div><Funnel insight={summary} /></section>
    <section className="analytics-section"><SectionHeading eyebrow="PREMIOS" title="Rendimiento por premio" detail="Resultados reales del período; no son probabilidades configuradas." />{prizes.length ? <div className="roulette-prize-table" role="table"><div className="roulette-prize-row roulette-prize-head" role="row"><span>Premio</span><span>Ganados</span><span>Parte de premios</span><span>Claims / canjes</span></div>{prizes.map((prize) => <div className="roulette-prize-row" role="row" key={prize.prizeId ?? prize.name}><span>{prize.name}</span><strong>{prize.wins ?? prize.value}</strong><span>{formatPercentage(prize.shareOfWins)}</span><span>{prize.claimsApplicable ? `${prize.claimsGenerated ?? 0} · ${prize.pending ?? 0} pendientes · ${prize.redeemed ?? 0} canjeados` : 'Sin datos de claims'}</span></div>)}</div> : <StatusPanel kind="empty">Todavía no hay premios ganados en este período.</StatusPanel>}</section>
    <section className="analytics-section"><SectionHeading eyebrow="ACTIVIDAD" title="Actividad de la campaña" detail="Actividad por hora o día según el período seleccionado." /><div className="chart-grid"><ChartBox title="Eventos de la ruleta" data={events} /><Rank title="Participaciones bloqueadas" items={blocked} /></div>{(ar.open || ar.sessions || ar.placed) > 0 && <div className="chart-grid"><Rank title="Actividad AR" items={[{ name: 'AR abierto', value: ar.open }, { name: 'Sesiones AR', value: ar.sessions }, { name: 'Ruleta colocada', value: ar.placed }]} /></div>}</section>
  </>;
}

export function ChartBox({
  title,
  data,
  color = '#79a7d3',
}: {
  title: string;
  data: Point[];
  color?: string;
}) {
  return (
    <section className="card chart">
      <div className="chart-heading"><h3>{title}</h3><span>{data.length ? `${data.length} puntos` : 'Sin datos'}</span></div>
      {data.length ? (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data}>
            <CartesianGrid stroke="#263341" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={(v) => new Date(v).toLocaleDateString('es-AR')}
            />
            <YAxis />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <StatusPanel kind="empty">Todavía no hay actividad registrada para este período.</StatusPanel>
      )}
    </section>
  );
}
export function Analytics({ org }: { org: string }) {
  const [range, setRange] = useState('7d'),
    [project, setProject] = useState(''),
    [application, setApplication] = useState(''),
    [projects, setProjects] = useState<Project[]>([]),
    [apps, setApps] = useState<Application[]>([]),
    [s, setS] = useState<Summary>(),
    [users, setUsers] = useState<Point[]>([]),
    [events, setEvents] = useState<Point[]>([]),
    [rec, setRec] = useState<Record<string, number>>({}),
    [games, setGames] = useState<Item[]>([]),
    [prizes, setPrizes] = useState<Item[]>([]),
    [results, setResults] = useState<Item[]>([]),
    [topEvents, setTopEvents] = useState<Item[]>([]),
    [blocked, setBlocked] = useState<Item[]>([]),
    [error, setError] = useState(false),
    [exporting, setExporting] = useState(false),
    [exportError, setExportError] = useState('');
  useEffect(() => {
    setProject('');
    setApplication('');
    setS(undefined);
    if (org)
      get('/projects', org)
        .then(setProjects)
        .catch(() => setError(true));
  }, [org]);
  useEffect(() => {
    if (org)
      get(`/applications${project ? `?projectId=${project}` : ''}`, org)
        .then((x: Application[]) => {
          setApps(x);
          if (!x.some((a) => a.id === application)) setApplication('');
        })
        .catch(() => setError(true));
  }, [org, project, application]);
  useEffect(() => {
    if (!org) return;
    setS(undefined);
    setError(false);
    const q = `range=${range}${project ? `&projectId=${project}` : ''}${application ? `&applicationId=${application}` : ''}`;
    Promise.all([
      get(`/analytics/summary?${q}`, org),
      get(`/analytics/timeseries?${q}&metric=users`, org),
      get(`/analytics/timeseries?${q}&metric=events`, org),
      get(`/analytics/recurrence?${q}`, org),
      get(`/analytics/breakdown?${q}&dimension=game`, org),
      get(`/analytics/breakdown?${q}&dimension=prize`, org),
      get(`/analytics/breakdown?${q}&dimension=result`, org),
      get(`/analytics/breakdown?${q}&dimension=event`, org),
      get(`/analytics/breakdown?${q}&dimension=reason`, org),
    ])
      .then(([a, b, c, d, e, f, g, h, i]) => {
        setS(a);
        setUsers(b.points);
        setEvents(c.points);
        setRec(d);
        setGames(e.items);
        setPrizes(f.items);
        setResults(g.items);
        setTopEvents(h.items);
        setBlocked(i.items);
      })
      .catch(() => setError(true));
  }, [org, range, project, application]);
  const selectedApp = apps.find((app) => app.id === application);
  const scopeType = selectedApp?.applicationType ?? 'generic';
  const scopeName = selectedApp?.name ?? (project ? projects.find((item) => item.id === project)?.name ?? 'Proyecto seleccionado' : 'Todas las aplicaciones');
  async function exportRoulette() {
    if (!application || scopeType !== 'roulette' || exporting) return;
    setExporting(true);
    setExportError('');
    try {
      const query = new URLSearchParams({ range, applicationId: application, ...(project ? { projectId: project } : {}) });
      const blob = await apiDownload(`/analytics/roulette-export?${query.toString()}`, org);
      downloadCsv(blob, scopeName, 'resultados');
    } catch (exportFailure) {
      setExportError((exportFailure as Error).message);
    } finally {
      setExporting(false);
    }
  }
  if (error)
    return (
      <main className="page analytics-page">
        <p className="eyebrow">RESULTADOS / DATOS REALES</p><h1>Resultados</h1>
        <StatusPanel kind="error"><strong>No se pudieron cargar los resultados.</strong><span>Probá de nuevo o revisá los filtros seleccionados.</span></StatusPanel>
      </main>
    );
  return (
    <main className="page analytics-page">
      <div className="analytics-header"><div><p className="eyebrow">RESULTADOS / DATOS REALES</p><h1>Resultados</h1><p className="page-description">Una lectura clara de la actividad de tus experiencias.</p></div><div className="analytics-header-actions"><div className="scope-summary"><small>ALCANCE ACTUAL</small><strong>{scopeName}</strong><span>{typeLabel(scopeType)} · {range === '24h' ? 'Últimas 24 horas' : range === '7d' ? 'Últimos 7 días' : range === '30d' ? 'Últimos 30 días' : 'Todo el período'}</span></div>{application && scopeType === 'roulette' && <button type="button" className="secondary" onClick={() => void exportRoulette()} disabled={exporting}>{exporting ? 'Exportando…' : 'Exportar CSV'}</button>}</div></div>
      <section className="analytics-toolbar" aria-label="Filtros de resultados"><div className="toolbar-heading"><strong>Filtrar resultados</strong><span>Los datos se actualizan al cambiar un filtro.</span></div><div className="filters">
        <label>
          Período
          <select value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="24h">24 horas</option>
            <option value="7d">7 días</option>
            <option value="30d">30 días</option>
            <option value="all">Todo</option>
          </select>
        </label>
        <label>
          Proyecto
          <select value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">Todos los proyectos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Aplicación
          <select
            value={application}
            onChange={(e) => { setApplication(e.target.value); setExportError(''); }}
          >
            <option value="">Todas las aplicaciones</option>
            {apps.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div></section>
      {exportError && <p className="analytics-export-error" role="alert">No se pudo exportar el CSV: {exportError}</p>}
      {!s ? (
        <StatusPanel kind="loading">Cargando resultados…</StatusPanel>
      ) : (
        <>
          <section className="analytics-section"><SectionHeading eyebrow="RESUMEN" title={scopeType === 'generic' ? 'Actividad general' : `Indicadores de ${typeLabel(scopeType)}`} detail="Indicadores principales del alcance seleccionado." /><div className="grid analytics-kpi-grid">
            {Object.entries(s.totals)
              .filter(([k]) => {
                const selectedType = apps.find(
                  (a) => a.id === application,
                )?.applicationType;
                const types = [
                  ...new Set(apps.map((a) => a.applicationType ?? 'generic')),
                ];
                const type =
                  selectedType ?? (types.length === 1 ? types[0] : 'generic');
                const generic = [
                  'uniqueUsers',
                  'sessions',
                  'appOpens',
                  'totalEvents',
                ];
                const webar = [
                  'experiencesStarted',
                  'experiencesFinished',
                  'targetsDetected',
                  'favoritesAdded',
                  'navigationsStarted',
                  'schedulesViewed',
                  'cameraPermissionsGranted',
                  'cameraPermissionsDenied',
                ];
                const game = [
                  'gamesStarted',
                  'gamesFinished',
                  'prizesWon',
                  'prizesClaimed',
                ];
                return [
                  ...generic,
                  ...(type === 'webar' ? webar : type === 'game' ? game : []),
                ].includes(k);
              })
              .map(([k, v]) => (
                <MetricCard key={k} label={metricLabels[k] ?? readableLabel(k)} value={k === 'lastActivityAt' ? formatDateTime(v) : v} />
              ))}
            {(apps.find((a) => a.id === application)?.applicationType ??
              'generic') === 'game' && (
              <>
                <MetricCard label="Finalización" value={formatPercentage(s.rates.completion)} />
              </>
            )}
            {(apps.find((a) => a.id === application)?.applicationType ??
              'generic') === 'game' && (
              <MetricCard label="Conversión" value={formatPercentage(s.rates.prizeConversion)} />
            )}
          </div></section>
          {scopeType === 'roulette' && s.rouletteInsights && <RouletteCampaignInsights summary={s.rouletteInsights} prizes={prizes as RoulettePrizePerformance[]} blocked={blocked} events={events} ar={{ open: s.totals.rouletteArOpen, sessions: s.totals.rouletteArSessions, placed: s.totals.rouletteArPlaced }} />}
          <section className="analytics-section"><SectionHeading eyebrow="TENDENCIA" title="Actividad en el tiempo" detail="Usuarios y eventos del mismo alcance y período." /><div className="chart-grid">
            <ChartBox title="Usuarios en el tiempo" data={users} />
            <ChartBox
              title="Eventos en el tiempo"
              data={events}
              color="#9bc47d"
            />
          </div></section>
          {(apps.find((a) => a.id === application)?.applicationType ??
            'generic') === 'game' && (
            <div className="chart-grid">
              <div className="card">
                <h3>Juegos iniciados vs completados</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={[
                      {
                        name: 'Juegos',
                        iniciados: s.totals.gamesStarted,
                        completados: s.totals.gamesFinished,
                      },
                    ]}
                  >
                    <CartesianGrid stroke="#263341" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="iniciados" fill="#79a7d3" />
                    <Bar dataKey="completados" fill="#9bc47d" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="card">
                <h3>Recurrencia</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={[
                      { name: '1 vez', value: rec.once ?? 0 },
                      { name: '2 veces', value: rec.twice ?? 0 },
                      { name: '3+', value: rec.threeOrMore ?? 0 },
                    ]}
                  >
                    <CartesianGrid stroke="#263341" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#c0a1d8" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          <Rank title="Top eventos" items={topEvents} />
          {(apps.find((a) => a.id === application)?.applicationType ??
            'generic') === 'game' && (
            <div className="chart-grid">
              <Rank title="Top juegos" items={games} />
              <Rank title="Premios" items={prizes} />
              <Rank title="Resultados" items={results} />
            </div>
          )}
        </>
      )}
    </main>
  );
}
export function Rank({ title, items }: { title: string; items: Item[] }) {
  return (
    <section className="card breakdown-card">
      <div className="breakdown-heading"><h3>{title}</h3><span>{items.length ? `${items.length} categorías` : 'Sin datos'}</span></div>
      {items.length ? (
        items.map((i) => (
          <p className="rank" key={i.name}>
            <span>{readableLabel(i.name)}</span>
            <strong>{formatMetricValue(i.value)}</strong>
          </p>
        ))
      ) : (
        <StatusPanel kind="empty">Todavía no hay datos para este alcance.</StatusPanel>
      )}
    </section>
  );
}
export function LegacyHome({ org }: { org: string }) {
  const [apps, setApps] = useState<Application[]>([]),
    [app, setApp] = useState<Application>(),
    [summary, setSummary] = useState<Summary>(),
    [points, setPoints] = useState<Point[]>([]),
    [top, setTop] = useState<Item>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false);
  useEffect(() => {
    setLoading(true);
    setError(false);
    setApps([]);
    setApp(undefined);
    setSummary(undefined);
    setPoints([]);
    setTop(undefined);
    if (!org) return;
    Promise.all([
      get('/applications', org),
      get('/analytics/summary?range=24h', org),
      get('/analytics/timeseries?range=24h&metric=users', org),
      get('/analytics/breakdown?range=24h&dimension=game', org),
    ])
      .then(([a, s, t, b]) => {
        const list = a as Application[];
        setApps(list);
        setApp(list[0]);
        setSummary(s);
        setPoints(t.points);
        setTop(b.items[0]);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [org]);
  if (error)
    return (
      <main className="page">
        <h1>Centro de control</h1>
        <p>No se pudo cargar la información.</p>
      </main>
    );
  return (
    <main className="page home-grid">
      <section className="home-app">
        <p className="eyebrow">APLICACIÓN PRINCIPAL</p>
        <h1>{app?.name ?? 'Aplicación principal'}</h1>
        {loading ? (
          <p>Cargando aplicación…</p>
        ) : app ? (
          <>
            <div className="phone">
              <div className="phone-screen">
                <span>CORSTENO</span>
                <strong>{app.name}</strong>
                <small>Experiencia digital</small>
              </div>
            </div>
            <div className="app-meta">
              <p>
                <small>Proyecto</small>
                <strong>{app.projectId}</strong>
              </p>
              <p>
                <small>Estado</small>
                <strong>{app.status === 'active' ? 'Activa' : app.status}</strong>
              </p>
            </div>
            <div className="triggers">
              <h3>Activadores</h3>
              <span>
                QR activos <b>—</b>
              </span>
              <span>
                Objetivos de imagen <b>—</b>
              </span>
            </div>
            <Link className="row" to={`/app/projects/${app.projectId}`}>
              Ver proyecto
            </Link>
            {apps.length > 1 && (
              <label>
                Aplicación
                <select
                  value={app.id}
                  onChange={(e) =>
                    setApp(apps.find((x) => x.id === e.target.value))
                  }
                >
                  {apps.map((x) => (
                    <option value={x.id} key={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        ) : (
          <div className="empty">
            <h3>No hay una aplicación configurada</h3>
            <p>
              Esta organización todavía no tiene una aplicación disponible.
            </p>
          </div>
        )}
      </section>
      <section className="home-analytics">
        <p className="eyebrow">RESUMEN 24 HORAS</p>
        <h2>Actividad reciente</h2>
        {loading ? (
          <p>Cargando métricas…</p>
        ) : (
          <>
            <div className="grid mini-kpis">
              {[
                ['Usuarios únicos', summary?.totals.uniqueUsers],
                ['Sesiones', summary?.totals.sessions],
                ['Juegos completados', summary?.totals.gamesFinished],
                ['Premios ganados', summary?.totals.prizesWon],
              ].map(([k, v]) => (
                <div className="card" key={String(k)}>
                  <small>{k}</small>
                  <b>{formatMetricValue(v)}</b>
                </div>
              ))}
            </div>
            <div className="card mini-chart">
              <h3>Actividad</h3>
              <ChartBox title="" data={points} />
            </div>
            <div className="quick-row">
              <div className="card">
                <small>Top juego</small>
                <b>{top?.name ?? '—'}</b>
                <span>{top ? `${top.value} partidas` : 'Sin datos'}</span>
              </div>
              <div className="card">
                <small>Tasa de finalización</small>
                <b>
                  {summary ? formatPercentage(summary.rates.completion) : '—'}
                </b>
              </div>
            </div>
            <Link className="row" to="/app/analytics">
              Ver resultados
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
