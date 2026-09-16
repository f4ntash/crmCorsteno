import { CRM_PRODUCT_TYPES, isCrmProductType, type CrmProductType } from '@corsteno/types';

export type NavigationKey = 'summary' | 'experiences' | 'treasure-hunt' | 'products' | 'leads' | 'analytics' | 'channels' | 'reports' | 'redeem' | 'commercial' | 'subscriptions';
export type NavigationMode = 'admin' | 'workspace';
export type NavigationItem = {
  key: NavigationKey;
  label: string;
  to: string;
  adminOnly: boolean;
  requiredProduct: CrmProductType | null;
  requiredPermission: string | null;
  allowedMode: readonly NavigationMode[];
  capabilities: readonly CrmProductType[];
};

export type NavigationContext = {
  mode: 'admin' | 'workspace';
  platformRole: string;
  permissions: readonly string[];
  workspace: boolean;
  productTypes: ReadonlySet<string>;
};

/**
 * Treasure Hunt is a read-only workspace module. Its route must be authorized
 * by the active organization and permission, independently of whether the
 * campaign list has finished loading or is empty.
 */
export function canAccessTreasureHuntRoute(context: Pick<NavigationContext, 'workspace' | 'permissions'>) {
  return context.workspace && context.permissions.includes('crm.read');
}

type ProductNavigationItem = Omit<NavigationItem, 'capabilities' | 'adminOnly' | 'requiredProduct' | 'requiredPermission' | 'allowedMode'> & {
  adminOnly: false;
  requiredProduct: CrmProductType;
  requiredPermission: string;
  allowedMode: readonly ['workspace'];
  capability: CrmProductType;
};

/**
 * Product-owned navigation. A workspace never receives an item merely because
 * the platform offers that product; it must own the matching experience type.
 */
export const productNavigation: Readonly<Record<CrmProductType, readonly ProductNavigationItem[]>> = {
  roulette: [
    { key: 'experiences', label: 'Ruleta', to: '/app/experiences', adminOnly: false, requiredProduct: 'roulette', requiredPermission: 'crm.read', allowedMode: ['workspace'], capability: 'roulette' },
    { key: 'analytics', label: 'Resultados', to: '/app/analytics', adminOnly: false, requiredProduct: 'roulette', requiredPermission: 'analytics.read', allowedMode: ['workspace'], capability: 'roulette' },
    { key: 'reports', label: 'Reportes', to: '/app/reports', adminOnly: false, requiredProduct: 'roulette', requiredPermission: 'analytics.read', allowedMode: ['workspace'], capability: 'roulette' },
    { key: 'redeem', label: 'Canjear premio', to: '/app/redeem', adminOnly: false, requiredProduct: 'roulette', requiredPermission: 'claims.redeem', allowedMode: ['workspace'], capability: 'roulette' },
  ],
  website: [
    { key: 'experiences', label: 'Web', to: '/app/experiences', adminOnly: false, requiredProduct: 'website', requiredPermission: 'crm.read', allowedMode: ['workspace'], capability: 'website' },
    { key: 'channels', label: 'Sitios y canales', to: '/app/channels', adminOnly: false, requiredProduct: 'website', requiredPermission: 'crm.read', allowedMode: ['workspace'], capability: 'website' },
    { key: 'analytics', label: 'Analytics', to: '/app/analytics', adminOnly: false, requiredProduct: 'website', requiredPermission: 'analytics.read', allowedMode: ['workspace'], capability: 'website' },
  ],
  ar: [
    { key: 'experiences', label: 'Experiencia AR', to: '/app/experiences', adminOnly: false, requiredProduct: 'ar', requiredPermission: 'crm.read', allowedMode: ['workspace'], capability: 'ar' },
    { key: 'analytics', label: 'Analytics', to: '/app/analytics', adminOnly: false, requiredProduct: 'ar', requiredPermission: 'analytics.read', allowedMode: ['workspace'], capability: 'ar' },
  ],
  'product-catalog': [
    { key: 'experiences', label: 'Catálogo', to: '/app/experiences', adminOnly: false, requiredProduct: 'product-catalog', requiredPermission: 'crm.read', allowedMode: ['workspace'], capability: 'product-catalog' },
    { key: 'products', label: 'Productos', to: '/app/products', adminOnly: false, requiredProduct: 'product-catalog', requiredPermission: 'crm.read', allowedMode: ['workspace'], capability: 'product-catalog' },
    { key: 'channels', label: 'Sitios y canales', to: '/app/channels', adminOnly: false, requiredProduct: 'product-catalog', requiredPermission: 'crm.read', allowedMode: ['workspace'], capability: 'product-catalog' },
  ],
};

const adminNavigation: readonly NavigationItem[] = [
  { key: 'summary', label: 'Inicio', to: '/app', adminOnly: true, requiredProduct: null, requiredPermission: null, allowedMode: ['admin'], capabilities: [] },
  { key: 'leads', label: 'Leads', to: '/app/leads', adminOnly: true, requiredProduct: null, requiredPermission: null, allowedMode: ['admin'], capabilities: [] },
  { key: 'commercial', label: 'Catálogo comercial', to: '/app/commercial', adminOnly: true, requiredProduct: null, requiredPermission: null, allowedMode: ['admin'], capabilities: [] },
  { key: 'subscriptions', label: 'Suscripciones', to: '/app/subscriptions', adminOnly: true, requiredProduct: null, requiredPermission: null, allowedMode: ['admin'], capabilities: [] },
];

const treasureHuntNavigation: NavigationItem = {
  key: 'treasure-hunt',
  label: 'Búsqueda del Tesoro',
  to: '/app/treasure-hunt',
  adminOnly: false,
  requiredProduct: null,
  requiredPermission: 'crm.read',
  allowedMode: ['workspace'],
  capabilities: [],
};

function hasPermission(context: NavigationContext, permission: string | null) {
  return !permission || context.permissions.includes(permission);
}

function mergeProductItem(items: Map<NavigationKey, NavigationItem>, item: ProductNavigationItem) {
  const current = items.get(item.key);
  if (!current) {
    items.set(item.key, {
      key: item.key,
      label: item.label,
      to: item.to,
      adminOnly: item.adminOnly,
      requiredProduct: item.requiredProduct,
      requiredPermission: item.requiredPermission,
      allowedMode: item.allowedMode,
      capabilities: [item.capability],
    });
    return;
  }
  const capabilities = current.capabilities.includes(item.capability) ? current.capabilities : [...current.capabilities, item.capability];
  items.set(item.key, {
    ...current,
    label: current.label === item.label ? current.label : item.key === 'experiences' ? 'Experiencias' : current.label,
    capabilities,
    requiredPermission: current.requiredPermission === item.requiredPermission ? current.requiredPermission : null,
  });
}

export function buildNavigation(context: NavigationContext): NavigationItem[] {
  if (context.mode === 'admin') return isPlatformOperator(context.platformRole) ? adminNavigation.filter((item) => item.allowedMode.includes('admin') && item.adminOnly && hasPermission(context, item.requiredPermission)) : [];
  if (!context.workspace) return [{ key: 'summary', label: 'Inicio', to: '/app', adminOnly: false, requiredProduct: null, requiredPermission: null, allowedMode: ['workspace'], capabilities: [] }];

  const items = new Map<NavigationKey, NavigationItem>([['summary', { key: 'summary', label: 'Inicio', to: '/app', adminOnly: false, requiredProduct: null, requiredPermission: null, allowedMode: ['workspace'], capabilities: [] }]]);
  for (const type of CRM_PRODUCT_TYPES) {
    if (!context.productTypes.has(type)) continue;
    for (const item of productNavigation[type]) {
      if (!item.adminOnly && item.allowedMode.includes('workspace') && item.requiredProduct && hasPermission(context, item.requiredPermission)) mergeProductItem(items, item);
    }
  }
  // Route availability is determined by the active workspace and read permission.
  // Campaign loading belongs to the page and must not hide or reject the route.
  if (context.workspace && hasPermission(context, treasureHuntNavigation.requiredPermission)) items.set(treasureHuntNavigation.key, treasureHuntNavigation);
  return [...items.values()];
}

function isPlatformOperator(role: string) {
  return role === 'super_admin' || role === 'corsteno_admin';
}

export function isWorkspaceProductAssigned(productTypes: ReadonlySet<string>, type: string | undefined): type is CrmProductType {
  return Boolean(type && isCrmProductType(type) && productTypes.has(type));
}

type ExperienceProductReference = { id: string; type: string };
export function isExperienceAssignedToWorkspace(experiences: readonly ExperienceProductReference[], experienceId: string): boolean {
  const experience = experiences.find((item) => item.id === experienceId);
  return Boolean(experience && isWorkspaceProductAssigned(new Set([experience.type]), experience.type));
}

export function hasSupportedWorkspaceProduct(productTypes: ReadonlySet<string>): boolean {
  return CRM_PRODUCT_TYPES.some((type) => productTypes.has(type));
}

export function navigationHasKey(items: readonly NavigationItem[], key: NavigationKey) {
  return items.some((item) => item.key === key);
}
