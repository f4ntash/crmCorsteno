import type React from 'react';
import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import './analytics.css';
import './home.css';
const api = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';
type Me = {
  user: { name: string; platformRole: string };
  memberships: {
    organizationId: string;
    organizationName: string;
    role: string;
  }[];
};
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
  rates: { completion: number; prizeConversion: number };
};
type Point = { timestamp: number; value: number };
type Item = { name: string; value: number };
async function get(path: string, org?: string, init?: RequestInit) {
  const r = await fetch(api + path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(org ? { 'X-Organization-Id': org } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!r.ok) throw new Error('No se pudo cargar la información');
  return r.json();
}
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
function Login() {
  const n = useNavigate();
  const [e, se] = useState('admin@corsteno.local'),
    [p, sp] = useState('ChangeMe123!'),
    [x, sx] = useState('');
  return (
    <main className="center">
      <p className="eyebrow">CORSTENO / ACCESS</p>
      <h1>Bienvenido</h1>
      <form
        onSubmit={async (v) => {
          v.preventDefault();
          try {
            await get('/auth/login', undefined, {
              method: 'POST',
              body: JSON.stringify({ email: e, password: p }),
            });
            n('/app');
          } catch (z) {
            sx((z as Error).message);
          }
        }}
      >
        <label>
          Email
          <input type="email" value={e} onChange={(v) => se(v.target.value)} />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={p}
            onChange={(v) => sp(v.target.value)}
          />
        </label>
        {x && <p className="error">{x}</p>}
        <button>Ingresar</button>
      </form>
    </main>
  );
}
function ChartBox({
  title,
  data,
  color = '#79a7d3',
}: {
  title: string;
  data: Point[];
  color?: string;
}) {
  return (
    <div className="card chart">
      <h3>{title}</h3>
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
        <p>Todavía no hay actividad registrada para este período.</p>
      )}
    </div>
  );
}
function Analytics({ org }: { org: string }) {
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
    [error, setError] = useState(false);
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
    ])
      .then(([a, b, c, d, e, f, g, h]) => {
        setS(a);
        setUsers(b.points);
        setEvents(c.points);
        setRec(d);
        setGames(e.items);
        setPrizes(f.items);
        setResults(g.items);
        setTopEvents(h.items);
      })
      .catch(() => setError(true));
  }, [org, range, project, application]);
  if (error)
    return (
      <main className="page">
        <h1>Analytics</h1>
        <p>No se pudieron cargar los datos.</p>
      </main>
    );
  return (
    <main className="page">
      <p className="eyebrow">ANALYTICS / DATOS REALES</p>
      <h1>Actividad real</h1>
      <div className="filters">
        <label>
          Rango
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
            onChange={(e) => setApplication(e.target.value)}
          >
            <option value="">Todas las aplicaciones</option>
            {apps.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!s ? (
        <p>Cargando analytics…</p>
      ) : (
        <>
          <div className="grid">
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
                <div className="card" key={k}>
                  <small>
                    {{
                      uniqueUsers: 'Usuarios',
                      sessions: 'Sesiones',
                      appOpens: 'Aperturas',
                      totalEvents: 'Eventos totales',
                      experiencesStarted: 'Experiencias iniciadas',
                      experiencesFinished: 'Experiencias completadas',
                      targetsDetected: 'Targets detectados',
                      favoritesAdded: 'Favoritos agregados',
                      navigationsStarted: 'Navegaciones iniciadas',
                      schedulesViewed: 'Agenda consultada',
                      cameraPermissionsGranted: 'Permisos cámara concedidos',
                      cameraPermissionsDenied: 'Permisos cámara denegados',
                      gamesStarted: 'Juegos iniciados',
                      gamesFinished: 'Juegos completados',
                      prizesWon: 'Premios ganados',
                      prizesClaimed: 'Premios reclamados',
                    }[k] ?? k}
                  </small>
                  <b>
                    {k === 'lastActivityAt'
                      ? formatDateTime(v)
                      : formatMetricValue(v)}
                  </b>
                </div>
              ))}
            {(apps.find((a) => a.id === application)?.applicationType ??
              'generic') === 'game' && (
              <>
                <div className="card">
                  <small>Finalización</small>
                  <b>{formatPercentage(s.rates.completion)}</b>
                </div>
              </>
            )}
            {(apps.find((a) => a.id === application)?.applicationType ??
              'generic') === 'game' && (
              <div className="card">
                <small>Conversión</small>
                <b>{formatPercentage(s.rates.prizeConversion)}</b>
              </div>
            )}
          </div>
          <div className="chart-grid">
            <ChartBox title="Usuarios en el tiempo" data={users} />
            <ChartBox
              title="Eventos en el tiempo"
              data={events}
              color="#9bc47d"
            />
          </div>
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
function Rank({ title, items }: { title: string; items: Item[] }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      {items.length ? (
        items.map((i) => (
          <p className="rank" key={i.name}>
            <span>{i.name}</span>
            <strong>{formatMetricValue(i.value)}</strong>
          </p>
        ))
      ) : (
        <p>Todavía no hay datos.</p>
      )}
    </div>
  );
}
function Home({ org }: { org: string }) {
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
        <p className="eyebrow">TU APP</p>
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
                <strong>{app.status}</strong>
              </p>
            </div>
            <div className="triggers">
              <h3>Activadores</h3>
              <span>
                QR activos <b>—</b>
              </span>
              <span>
                Image Targets <b>—</b>
              </span>
            </div>
            <Link className="row" to={`/app/projects/${app.projectId}`}>
              Ver proyecto →
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
              Esta organización todavía no tiene una application disponible.
            </p>
          </div>
        )}
      </section>
      <section className="home-analytics">
        <p className="eyebrow">RESUMEN 24 HORAS</p>
        <h2>Analytics rápidas</h2>
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
              Ver Analytics completas →
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
function Shell() {
  const [m, setM] = useState<Me>(),
    [o, setO] = useState('');
  const n = useNavigate();
  useEffect(() => {
    get('/auth/me')
      .then((x: Me) => {
        setM(x);
        setO(x.memberships[0]?.organizationId ?? '');
      })
      .catch(() => n('/login'));
  }, [n]);
  if (!m) return <main>Loading…</main>;
  return (
    <div className="shell">
      <aside>
        <b>CORSTENO</b>
        <small>CRM Platform</small>
        <nav>
          <Link to="/app">Inicio</Link>
          <Link to="/app/projects">Proyectos</Link>
          <Link to="/app/analytics">Analytics</Link>
          <Link to="/app/crm">CRM</Link>
          <Link to="/app/settings">Configuración</Link>
        </nav>
      </aside>
      <section className="content">
        <header>
          <strong>Corsteno CRM</strong>
          <select value={o} onChange={(e) => setO(e.target.value)}>
            {m.memberships.map((x) => (
              <option key={x.organizationId} value={x.organizationId}>
                {x.organizationName}
              </option>
            ))}
          </select>
          <span>
            {m.user.name}{' '}
            <button
              className="link"
              onClick={async () => {
                await get('/auth/logout', undefined, { method: 'POST' });
                n('/login');
              }}
            >
              Salir
            </button>
          </span>
        </header>
        <Routes>
          <Route index element={<Home org={o} />} />
          <Route path="analytics" element={<Analytics org={o} />} />
          <Route
            path="*"
            element={
              <main className="page">
                <h1>Próximamente</h1>
                <p>Esta sección estará disponible en una próxima etapa.</p>
              </main>
            }
          />
        </Routes>
      </section>
    </div>
  );
}
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/app/*" element={<Shell />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
