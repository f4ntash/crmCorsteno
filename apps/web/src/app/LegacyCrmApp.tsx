import { useEffect, useRef, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
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
import '../site-content.css';
import '../features/products/products.css';
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
import { ReportsPage } from '../features/reports/ReportsPage';
import { ChannelsPage } from '../features/channels/ChannelsPage';
import { ChannelDetailPage } from '../features/channels/ChannelDetailPage';
import { ProductsPage } from '../features/products/ProductsPage';
import { LeadsPage } from '../features/leads/LeadsPage';
import { TeamPage } from '../features/team/TeamPage';
import { TreasureHuntDetailPage, TreasureHuntListPage } from '../features/treasure-hunt/TreasureHuntPages';
import { TreasureHuntDraftPage } from '../features/treasure-hunt/TreasureHuntDraftPage';
import { activeWorkspaceApplications, buildNavigation, canAccessTreasureHuntRoute, isExperienceAssignedToWorkspace, isWorkspaceProductAssigned, navigationHasKey } from './navigation';
import type { Experience } from '../features/experiences/types';
type LegacyJson = ReturnType<JSON['parse']>;
import type { WorkspaceApplication } from './navigation';
async function get<T = LegacyJson>(path: string, org?: string, init?: RequestInit) {
  return apiRequest<T>(path, org, init);
}
function WorkspaceProductsLoading() {
  return <main className="page access-state" aria-live="polite"><span className="loading-mark" />Cargando los productos asignados…</main>;
}
function TreasureHuntDraftRoute({ org, organizationName }: { org: string; organizationName?: string }) {
  const { id } = useParams();
  return <TreasureHuntDraftPage org={org} organizationName={organizationName} campaignId={id} />;
}
function Shell() {
  const [m, setM] = useState<Me>(),
    [authLoading, setAuthLoading] = useState(true),
    [o, setO] = useState(''),
    [workspaceMode, setWorkspaceMode] = useState(false),
    [workspaceExperiences, setWorkspaceExperiences] = useState<Experience[]>([]),
    [workspaceApplications, setWorkspaceApplications] = useState<WorkspaceApplication[]>([]),
    [workspaceProductsLoading, setWorkspaceProductsLoading] = useState(false),
    [workspaceProductsOrganizationId, setWorkspaceProductsOrganizationId] = useState(''),
    [treasureHuntAvailable, setTreasureHuntAvailable] = useState(false),
    [navigationOpen, setNavigationOpen] = useState(false);
  const n = useNavigate();
  const location = useLocation();
  const organizationInitializedRef = useRef(false);
  const navigationTriggerRef = useRef<HTMLButtonElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (organizationInitializedRef.current) return;
    organizationInitializedRef.current = true;
    get('/auth/me', undefined, { cache: 'no-store' })
      .then((x: Me) => {
        setM(x);
        const isPlatformOperator = ['super_admin', 'corsteno_admin'].includes(x.user.platformRole);
        setO(isPlatformOperator ? '' : x.memberships[0]?.organizationId ?? '');
        setWorkspaceMode(!isPlatformOperator);
        setAuthLoading(false);
      })
      .catch(() => {
        organizationInitializedRef.current = false;
        n('/login');
      });
  }, [n]);
  useEffect(() => {
    const platformOperator = ['super_admin', 'corsteno_admin'].includes(m?.user.platformRole ?? '');
    const shouldLoadWorkspaceProducts = Boolean(m && o && (!platformOperator || workspaceMode));
    setWorkspaceExperiences([]);
    setWorkspaceApplications([]);
    setWorkspaceProductsLoading(shouldLoadWorkspaceProducts);
    setWorkspaceProductsOrganizationId('');
    setTreasureHuntAvailable(false);
    if (!shouldLoadWorkspaceProducts) return;

    let active = true;
    void Promise.allSettled([
      get<Experience[]>('/experiences', o),
      get<WorkspaceApplication[]>('/applications', o, { cache: 'no-store' }),
    ])
      .then(([experiencesResult, applicationsResult]) => {
        if (!active) return;
        if (experiencesResult.status === 'fulfilled') setWorkspaceExperiences(experiencesResult.value);
        if (applicationsResult.status === 'fulfilled') setWorkspaceApplications(applicationsResult.value);
        setWorkspaceProductsOrganizationId(o);
      })
      .finally(() => {
        if (active) setWorkspaceProductsLoading(false);
      });
    void get<{ items: unknown[] }>('/admin/treasure-hunt/campaigns', o)
      .then(() => {
        if (active) setTreasureHuntAvailable(true);
      })
      .catch(() => {
        if (active) setTreasureHuntAvailable(false);
      });
    return () => { active = false; };
  }, [m, o, workspaceMode]);
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
  if (!m || authLoading) return <main className="app-loading" aria-live="polite"><span className="loading-mark" />Cargando espacio de trabajo…</main>;
  const platformOperator = ['super_admin', 'corsteno_admin'].includes(m.user.platformRole);
  const currentOrganization = m.memberships.find((x) => x.organizationId === o);
  const adminMode = platformOperator && !workspaceMode;
  const hasOrganizationAccess = adminMode || Boolean(currentOrganization);
  const showOrganizationSelector = platformOperator ? m.memberships.length > 0 : m.memberships.length > 1;
  const currentPermissions = currentOrganization?.permissions ?? [];
  const canManage = currentPermissions.includes('crm.manage');
  const canRedeem = currentPermissions.includes('claims.redeem');
  const isRedemptionOperator = canRedeem && !canManage;
  const workspaceProductTypes = new Set(workspaceExperiences.map((experience) => experience.type));
  const activeApplications = activeWorkspaceApplications(workspaceApplications);
  const workspaceApplicationTypes = new Set(activeApplications.map((application) => application.applicationType ?? 'generic'));
  const workspaceProductsReady = !workspaceProductsLoading && (!o || workspaceProductsOrganizationId === o);
  const visibleWorkspaceProductTypes = workspaceProductsReady ? workspaceProductTypes : new Set<string>();
  const visibleWorkspaceApplicationTypes = workspaceProductsReady ? workspaceApplicationTypes : new Set<string>();
  const visibleActiveApplications = workspaceProductsReady ? activeApplications : [];
  const workspaceDataLoading = !adminMode && Boolean(o) && !workspaceProductsReady;
  const canReadTreasureHunt = canAccessTreasureHuntRoute({ workspace: Boolean(currentOrganization), permissions: currentPermissions, treasureHuntAvailable });
  const navigationItems = buildNavigation({
    mode: adminMode ? 'admin' : 'workspace',
    platformRole: m.user.platformRole,
    permissions: currentPermissions,
    workspace: Boolean(currentOrganization),
    productTypes: visibleWorkspaceProductTypes,
    applicationTypes: visibleWorkspaceApplicationTypes,
    activeApplications: visibleActiveApplications,
    treasureHuntAvailable,
  });
  const canUseWorkspaceProduct = (type?: string) => workspaceProductsReady && isWorkspaceProductAssigned(workspaceProductTypes, type);
  const currentExperienceId = location.pathname.match(/^\/app\/experiences\/([^/]+)$/)?.[1] ?? '';
  const currentExperienceAssigned = isExperienceAssignedToWorkspace(workspaceExperiences, currentExperienceId);
  const canAccess = (key: Parameters<typeof navigationHasKey>[1]) => navigationHasKey(navigationItems, key);
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
          <p>{adminMode ? 'Administración Corsteno' : 'Espacio de trabajo'}</p>
          {navigationItems.map((item) => <NavLink key={item.key} end={item.key === 'summary'} className={navClass} to={item.to} onClick={closeNavigation}>{item.label}</NavLink>)}
        </nav>
        {platformOperator && !workspaceMode && <NavLink className="button button-secondary new-client" to="/app/onboarding" onClick={closeNavigation}>Nuevo cliente</NavLink>}
      </aside>
      <section className="content">
        <header>
          <button ref={navigationTriggerRef} className="button button-icon menu-button" type="button" aria-label="Abrir navegación principal" aria-expanded={navigationOpen} aria-controls="app-navigation" onClick={() => setNavigationOpen(true)}>Menú</button>
          <div className="organization-context">
            <span>{adminMode ? 'Modo administración' : platformOperator ? 'Workspace del cliente' : 'Organización actual'}</span>
            {showOrganizationSelector ? <select aria-label="Organización actual" title={currentOrganization?.organizationName} value={o} onChange={(e) => { setO(e.target.value); if (platformOperator) setWorkspaceMode(Boolean(e.target.value)); }}>
              {adminMode && <option value="">Elegí un workspace cliente</option>}
              {m.memberships.map((x) => <option key={x.organizationId} value={x.organizationId}>{x.organizationName}{x.ownerEmail ? ` · ${x.ownerEmail}` : ''}</option>)}
            </select> : <strong className="organization-name">{adminMode ? 'Sin workspace cliente seleccionado' : currentOrganization?.organizationName ?? 'Sin organización asignada'}</strong>}
          </div>
          {platformOperator && (workspaceMode || m.memberships.length > 0) && <button className="button button-secondary context-toggle" type="button" onClick={() => { if (workspaceMode) { setO(''); setWorkspaceMode(false); } else if (m.memberships[0]) { setO(m.memberships[0].organizationId); setWorkspaceMode(true); } closeNavigation(); }}>{workspaceMode ? 'Volver a administración' : 'Ver workspace'}</button>}
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
        </main> : workspaceDataLoading ? <WorkspaceProductsLoading /> : <Routes key={o || 'admin'}>
           <Route index element={<Home org={o} organizationName={currentOrganization?.organizationName} isPlatformAdmin={platformOperator} canViewWorkspace={!isRedemptionOperator && (!platformOperator || workspaceMode)} canViewAnalytics={currentPermissions.includes('analytics.read')} showProductOperations={canAccess('experiences')} />} />
           <Route path="analytics" element={!canAccess('analytics') ? <Navigate to="/app" replace /> : <Analytics org={o} />} />
           <Route path="reports" element={!canAccess('reports') ? <Navigate to="/app" replace /> : <ReportsPage org={o} />} />
           <Route path="experiences" element={!canAccess('experiences') ? <Navigate to="/app" replace /> : <ExperiencesPage org={o} canCreate={platformOperator} />} />
           <Route path="treasure-hunt" element={!canReadTreasureHunt ? <Navigate to="/app" replace /> : <TreasureHuntListPage org={o} organizationName={currentOrganization?.organizationName} canManage={canManage} />} />
           <Route path="treasure-hunt/new" element={!canManage ? <Navigate to="/app/treasure-hunt" replace /> : <TreasureHuntDraftPage org={o} organizationName={currentOrganization?.organizationName} />} />
           <Route path="treasure-hunt/:id/draft" element={!canManage ? <Navigate to="/app/treasure-hunt" replace /> : <TreasureHuntDraftRoute org={o} organizationName={currentOrganization?.organizationName} />} />
           <Route path="treasure-hunt/:id" element={!canReadTreasureHunt ? <Navigate to="/app" replace /> : <TreasureHuntDetailPage org={o} organizationName={currentOrganization?.organizationName} canManage={canManage} />} />
           <Route path="products" element={!canAccess('products') || !canUseWorkspaceProduct('product-catalog') ? <Navigate to="/app" replace /> : <ProductsPage org={o} canEdit={canManage} canManageAssets={currentPermissions.includes('assets.manage')} isPlatformOperator={platformOperator} />} />
            <Route path="leads" element={!adminMode || !canAccess('leads') ? <Navigate to="/app" replace /> : <LeadsPage org={o} canEdit={adminMode || canManage} internal />} />
            <Route path="experiences/:id" element={!workspaceProductsReady ? <WorkspaceProductsLoading /> : !canAccess('experiences') || !currentExperienceAssigned ? <Navigate to="/app" replace /> : <ExperienceDetailPage org={o} permissions={currentPermissions} canManageCommercial={isPlatformCommercialAdmin(m.user.platformRole)} />} />
            <Route path="commercial" element={!adminMode || !canAccess('commercial') ? <Navigate to="/app" replace /> : <CommercialPage org={o} canManageCatalog={isPlatformCommercialAdmin(m.user.platformRole)} />} />
            <Route path="subscriptions" element={!adminMode || !canAccess('subscriptions') ? <Navigate to="/app" replace /> : <SubscriptionsPage org={o} canManage={true} canManageCommercial={isPlatformCommercialAdmin(m.user.platformRole)} />} />
            <Route path="onboarding" element={!adminMode ? <Navigate to="/app" replace /> : <ClientOnboardingPage />} />
            <Route path="redeem" element={!canAccess('redeem') ? <Navigate to="/app" replace /> : <RedeemPage org={o} canRedeem />} />
            <Route path="activity" element={<Navigate to="/app" replace />} />
            <Route path="attention" element={<Navigate to="/app" replace />} />
            <Route path="assets" element={<Navigate to="/app" replace />} />
            <Route path="channels" element={!canAccess('channels') ? <Navigate to="/app" replace /> : <ChannelsPage org={o} canManage={canManage} />} />
            <Route path="channels/:id" element={!canAccess('channels') ? <Navigate to="/app" replace /> : <ChannelDetailPage org={o} canManage={canManage} canAssignContentProfile={platformOperator} canManageAssets={platformOperator || currentPermissions.includes('assets.manage')} hasProductCatalog={workspaceProductTypes.has('product-catalog')} />} />
           <Route path="team" element={<TeamPage org={o} role={currentOrganization?.role ?? 'global_admin'} canManage={canManage} canAssignAdmin={platformOperator || currentOrganization?.role === 'owner'} />} />
          <Route
            path="*"
            element={
              <main className="page">
                <h1>Página no encontrada</h1>
                <p>La ruta que buscás no existe.</p>
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
