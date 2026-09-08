import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import '../analytics.css';
import '../home.css';
import '../experiences.css';
import { apiRequest } from '../shared/api/client';
import type { Me } from '../features/auth/types';
import { ExperiencesPage } from '../features/experiences/pages/ExperiencesPage';
import { ExperienceDetailPage } from '../features/experiences/pages/ExperienceDetailPage';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { Analytics, Home } from '../features/dashboard/DashboardPages';
type LegacyJson = ReturnType<JSON['parse']>;
async function get<T = LegacyJson>(path: string, org?: string, init?: RequestInit) {
  return apiRequest<T>(path, org, init);
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
          <Link to="/app/experiences">Experiencias</Link>
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
          <Route path="experiences" element={<ExperiencesPage org={o} />} />
          <Route path="experiences/:id" element={<ExperienceDetailPage org={o} />} />
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
      <Route path="/login" element={<LoginPage />} />
      <Route path="/app/*" element={<Shell />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
