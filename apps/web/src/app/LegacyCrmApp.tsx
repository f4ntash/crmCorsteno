import { useEffect, useRef, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import '../analytics.css';
import '../activity.css';
import '../attention.css';
import '../assets.css';
import '../config-fields.css';
import '../publication-controls.css';
import '../commercial.css';
import '../home.css';
import '../experiences.css';
import '../permission.css';
import '../team.css';
import '../reports.css';
import '../channels.css';
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
import { TeamPage } from '../features/team/TeamPage';
import { ActivityPage } from '../features/activity/ActivityPage';
import { AttentionPage } from '../features/attention/AttentionPage';
import { AssetLibraryPage } from '../features/assets/AssetLibraryPage';
import { ReportsPage } from '../features/reports/ReportsPage';
import { ChannelsPage } from '../features/channels/ChannelsPage';
import { ChannelDetailPage } from '../features/channels/ChannelDetailPage';
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
  const organizationInitializedRef = useRef(false);
  const navigationTriggerRef = useRef<HTMLButtonElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (organizationInitializedRef.current) return;
    organizationInitializedRef.current = true;
    get('/auth/me')
      .then((x: Me) => {
        setM(x);
        setO(x.memberships[0]?.organizationId ?? '');
      })
      .catch(() => {
        organizationInitializedRef.current = false;
        n('/login');
      });
  }, [n]);
  useEffect(() => setNavigationOpen(false), [location.pathname]);
  useEffect(() => {
    if (!navigationOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const firstFocusable = navigationRef.current?.querySelector<HTMLElement>('nav a, .new-client');
    requestAnimationFrame(() => firstFocusable?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setNavigationOpen(false);
      requestAnimationFrame(() => navigationTriggerRef.current?.focus());
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [navigationOpen]);
  if (!m) return <main className="app-loading" aria-live="polite"><span className="loading-mark" />Cargando espacio de trabajo…</main>;
  const platformOperator = ['super_admin', 'corsteno_admin'].includes(m.user.platformRole);
  const currentOrganization = m.memberships.find((x) => x.organizationId === o);
  const hasOrganizationAccess = m.memberships.length > 0;
  const showOrganizationSelector = m.memberships.length > 1;
  const currentPermissions = currentOrganization?.permissions ?? [];
  const canManage = currentPermissions.includes('crm.manage');
  const canRedeem = currentPermissions.includes('claims.redeem');
  const isRedemptionOperator = canRedeem && !canManage;
  const navClass = ({ isActive }: { isActive: boolean }) => isActive ? 'active' : undefined;
  const closeNavigation = () => {
    setNavigationOpen(false);
    requestAnimationFrame(() => navigationTriggerRef.current?.focus());
  };
  return (
    <div className="shell">
      {navigationOpen && <button className="nav-backdrop" type="button" aria-label="Cerrar navegación" onClick={closeNavigation} />}
      <aside ref={navigationRef} id="app-navigation" className={navigationOpen ? 'open' : undefined}>
        <div className="brand-lockup"><b>CORSTENO</b><small>Operations</small></div>
        <nav aria-label="Navegación principal">
          <p>Espacio de trabajo</p>
          <NavLink end className={navClass} to="/app" onClick={closeNavigation}>Resumen</NavLink>
          {!isRedemptionOperator && <NavLink className={navClass} to="/app/experiences" onClick={closeNavigation}>Experiencias</NavLink>}
          {!isRedemptionOperator && <NavLink className={navClass} to="/app/analytics" onClick={closeNavigation}>Resultados</NavLink>}
          {!isRedemptionOperator && currentPermissions.includes('crm.read') && <NavLink className={navClass} to="/app/channels" onClick={closeNavigation}>Sitios y canales</NavLink>}
          {currentPermissions.includes('analytics.read') && <NavLink className={navClass} to="/app/reports" onClick={closeNavigation}>Reportes</NavLink>}
          {canRedeem && <NavLink className={navClass} to="/app/redeem" onClick={closeNavigation}>Canjear premio</NavLink>}
          {currentPermissions.includes('activity.read') && <NavLink className={navClass} to="/app/activity" onClick={closeNavigation}>Actividad</NavLink>}
          {currentPermissions.includes('crm.read') && <NavLink className={navClass} to="/app/attention" onClick={closeNavigation}>Atención</NavLink>}
          {currentPermissions.includes('assets.read') && <NavLink className={navClass} to="/app/assets" onClick={closeNavigation}>Archivos</NavLink>}
          {currentOrganization && !isRedemptionOperator && <NavLink className={navClass} to="/app/team" onClick={closeNavigation}>Equipo</NavLink>}
          {platformOperator && <>
            <p className="nav-section">Administración</p>
            <NavLink className={navClass} to="/app/commercial" onClick={closeNavigation}>Catálogo comercial</NavLink>
            <NavLink className={navClass} to="/app/subscriptions" onClick={closeNavigation}>Suscripciones</NavLink>
          </>}
          <div className="nav-upcoming" aria-label="Próximamente">
            <p className="nav-section">Próximamente</p>
            <NavLink className={navClass} to="/app/projects" onClick={closeNavigation}>Proyectos</NavLink>
            <NavLink className={navClass} to="/app/crm" onClick={closeNavigation}>CRM</NavLink>
            <NavLink className={navClass} to="/app/settings" onClick={closeNavigation}>Configuración</NavLink>
          </div>
        </nav>
        {platformOperator && <NavLink className="button button-secondary new-client" to="/app/onboarding" onClick={closeNavigation}>Nuevo cliente</NavLink>}
      </aside>
      <section className="content">
        <header>
          <button ref={navigationTriggerRef} className="button button-icon menu-button" type="button" aria-label="Abrir navegación principal" aria-expanded={navigationOpen} aria-controls="app-navigation" onClick={() => setNavigationOpen(true)}>Menú</button>
          <div className="organization-context">
            <span>{platformOperator ? 'Workspace del cliente' : 'Organización actual'}</span>
            {showOrganizationSelector ? <select aria-label="Organización actual" title={currentOrganization?.organizationName} value={o} onChange={(e) => setO(e.target.value)}>
              {m.memberships.map((x) => <option key={x.organizationId} value={x.organizationId}>{x.organizationName}</option>)}
            </select> : <strong className="organization-name">{currentOrganization?.organizationName ?? 'Sin organización asignada'}</strong>}
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
        {!hasOrganizationAccess ? <main className="page access-state">
          <p className="eyebrow">ACCESO / ORGANIZACIÓN</p>
          <h1>No tenés una organización asignada</h1>
          <p className="page-description">Tu cuenta todavía no tiene acceso a un espacio de trabajo. Pedile a un administrador que te incorpore a una organización activa.</p>
        </main> : <Routes key={o}>
          <Route index element={<Home org={o} isPlatformAdmin={platformOperator} canViewWorkspace={!isRedemptionOperator} />} />
          <Route path="analytics" element={isRedemptionOperator ? <Navigate to="/app/redeem" replace /> : <Analytics org={o} />} />
          <Route path="reports" element={currentPermissions.includes('analytics.read') ? <ReportsPage org={o} /> : <Navigate to="/app" replace />} />
          <Route path="experiences" element={isRedemptionOperator ? <Navigate to="/app/redeem" replace /> : <ExperiencesPage org={o} canCreate={platformOperator} />} />
          <Route path="experiences/:id" element={isRedemptionOperator ? <Navigate to="/app/redeem" replace /> : <ExperienceDetailPage org={o} permissions={m.memberships.find((x) => x.organizationId === o)?.permissions ?? []} canManageCommercial={isPlatformCommercialAdmin(m.user.platformRole)} />} />
          <Route path="commercial" element={platformOperator ? <CommercialPage org={o} canManageCatalog={isPlatformCommercialAdmin(m.user.platformRole)} /> : <Navigate to="/app" replace />} />
          <Route path="subscriptions" element={platformOperator ? <SubscriptionsPage org={o} canManage={true} canManageCommercial={isPlatformCommercialAdmin(m.user.platformRole)} /> : <Navigate to="/app" replace />} />
          <Route path="onboarding" element={platformOperator ? <ClientOnboardingPage /> : <Navigate to="/app" replace />} />
          <Route path="redeem" element={canRedeem ? <RedeemPage org={o} canRedeem /> : <Navigate to="/app" replace />} />
          <Route path="activity" element={currentPermissions.includes('activity.read') ? <ActivityPage org={o} /> : <Navigate to="/app" replace />} />
          <Route path="attention" element={currentPermissions.includes('crm.read') ? <AttentionPage org={o} /> : <Navigate to="/app" replace />} />
          <Route path="assets" element={currentPermissions.includes('assets.read') ? <AssetLibraryPage org={o} canManage={currentPermissions.includes('assets.manage')} /> : <Navigate to="/app" replace />} />
          <Route path="channels" element={currentPermissions.includes('crm.read') ? <ChannelsPage org={o} canManage={canManage} /> : <Navigate to="/app" replace />} />
          <Route path="channels/:id" element={currentPermissions.includes('crm.read') ? <ChannelDetailPage org={o} canManage={canManage} /> : <Navigate to="/app" replace />} />
          <Route path="team" element={isRedemptionOperator ? <Navigate to="/app/redeem" replace /> : currentOrganization ? <TeamPage org={o} role={currentOrganization.role} canManage={platformOperator || ['owner', 'admin'].includes(currentOrganization.role)} canAssignAdmin={platformOperator || currentOrganization.role === 'owner'} /> : <Navigate to="/app" replace />} />
          <Route
            path="*"
            element={
              <main className="page">
                <h1>Próximamente</h1>
                <p>Esta sección estará disponible en una próxima etapa.</p>
              </main>
            }
          />
        </Routes>}
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
