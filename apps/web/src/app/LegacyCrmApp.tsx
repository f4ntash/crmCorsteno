import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import '../analytics.css';
import '../home.css';
import '../experiences.css';
import '../permission.css';
import { apiRequest } from '../shared/api/client';
import type { Me } from '../features/auth/types';
import { ExperiencesPage } from '../features/experiences/pages/ExperiencesPage';
import { ExperienceDetailPage } from '../features/experiences/pages/ExperienceDetailPage';
import { LoginPage } from '../features/auth/pages/LoginPage';
import { Analytics, Home } from '../features/dashboard/DashboardPages';
import { CommercialPage } from '../features/commercial/pages/CommercialPage';
import { SubscriptionsPage } from '../features/commercial/pages/SubscriptionsPage';
import { isPlatformCommercialAdmin } from '../features/commercial/permissions';
import { ClientOnboardingPage } from '../features/onboarding/pages/ClientOnboardingPage';
import { RedeemPage } from '../features/claims/pages/RedeemPage';
type LegacyJson = ReturnType<JSON['parse']>;
async function get<T = LegacyJson>(path: string, org?: string, init?: RequestInit) {
  return apiRequest<T>(path, org, init);
}
function Shell() {
  const [m, setM] = useState<Me>(),
    [o, setO] = useState(''),
    [navigationOpen, setNavigationOpen] = useState(false);
  const n = useNavigate();
  const location = useLocation();
  useEffect(() => {
    get('/auth/me')
      .then((x: Me) => {
        setM(x);
        setO(x.memberships[0]?.organizationId ?? '');
      })
      .catch(() => n('/login'));
  }, [n]);
  useEffect(() => setNavigationOpen(false), [location.pathname]);
  if (!m) return <main className="app-loading" aria-live="polite"><span className="loading-mark" />Cargando espacio de trabajo…</main>;
  const platformOperator = ['super_admin', 'corsteno_admin'].includes(m.user.platformRole);
  const canManage = m.memberships.find((x) => x.organizationId === o)?.permissions.includes('crm.manage') ?? false;
  const currentOrganization = m.memberships.find((x) => x.organizationId === o);
  const navClass = ({ isActive }: { isActive: boolean }) => isActive ? 'active' : undefined;
  return (
    <div className="shell">
      {navigationOpen && <button className="nav-backdrop" aria-label="Cerrar navegación" onClick={() => setNavigationOpen(false)} />}
      <aside id="app-navigation" className={navigationOpen ? 'open' : undefined}>
        <div className="brand-lockup"><b>CORSTENO</b><small>Operations</small></div>
        <nav aria-label="Navegación principal">
          <p>Espacio de trabajo</p>
          <NavLink end className={navClass} to="/app">Resumen</NavLink>
          <NavLink className={navClass} to="/app/experiences">Experiencias</NavLink>
          <NavLink className={navClass} to="/app/analytics">Resultados</NavLink>
          {canManage && <NavLink className={navClass} to="/app/redeem">Canjear premio</NavLink>}
          {platformOperator && <>
            <p className="nav-section">Administración</p>
            <NavLink className={navClass} to="/app/commercial">Catálogo comercial</NavLink>
            <NavLink className={navClass} to="/app/subscriptions">Suscripciones</NavLink>
          </>}
        </nav>
        {platformOperator && <NavLink className="button button-secondary new-client" to="/app/onboarding">Nuevo cliente</NavLink>}
      </aside>
      <section className="content">
        <header>
          <button className="button button-icon menu-button" type="button" aria-expanded={navigationOpen} aria-controls="app-navigation" onClick={() => setNavigationOpen(true)}>Menú</button>
          <div className="organization-context">
            <span>{platformOperator ? 'Workspace del cliente' : 'Organización actual'}</span>
            <select aria-label="Organización actual" title={currentOrganization?.organizationName} value={o} onChange={(e) => setO(e.target.value)}>
              {m.memberships.map((x) => <option key={x.organizationId} value={x.organizationId}>{x.organizationName}</option>)}
            </select>
          </div>
          <div className="account-context">
            <span><strong>{m.user.name}</strong><small>{platformOperator ? 'Administrador de plataforma' : currentOrganization?.organizationName}</small></span>
            <button
              className="button button-quiet"
              onClick={async () => {
                await get('/auth/logout', undefined, { method: 'POST' });
                n('/login');
              }}
            >
              Salir
            </button>
          </div>
        </header>
        <Routes>
          <Route index element={<Home org={o} />} />
          <Route path="analytics" element={<Analytics org={o} />} />
          <Route path="experiences" element={<ExperiencesPage org={o} canCreate={platformOperator} />} />
          <Route path="experiences/:id" element={<ExperienceDetailPage org={o} permissions={m.memberships.find((x) => x.organizationId === o)?.permissions ?? []} />} />
          <Route path="commercial" element={platformOperator ? <CommercialPage org={o} canManageCatalog={isPlatformCommercialAdmin(m.user.platformRole)} /> : <Navigate to="/app" replace />} />
          <Route path="subscriptions" element={platformOperator ? <SubscriptionsPage org={o} canManage={true} canManageCommercial={isPlatformCommercialAdmin(m.user.platformRole)} /> : <Navigate to="/app" replace />} />
          <Route path="onboarding" element={platformOperator ? <ClientOnboardingPage /> : <Navigate to="/app" replace />} />
          <Route path="redeem" element={canManage ? <RedeemPage org={o} /> : <Navigate to="/app" replace />} />
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
