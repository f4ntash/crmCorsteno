export type AttentionSeverity = 'info' | 'warning' | 'critical';

export type AttentionItem = {
  id: string;
  organizationId: string;
  type: string;
  severity: AttentionSeverity;
  title: string;
  description?: string;
  resourceType: string;
  resourceId: string;
  actionLabel?: string;
  actionHref?: string;
  createdAt?: string | number | null;
};

export type AttentionReadinessIssue = {
  code?: string;
  message: string;
};

export type AttentionExperience = {
  id: string;
  name: string;
  type: string;
  status: string;
  effectiveStatus: string;
  accessStatus?: string | null;
  startsAt: string | null;
  endsAt: string | null;
  updatedAt?: string | number | null;
};

export type AttentionRouletteOperations = {
  pendingClaims: number;
  soldOutLimitedPrizes: number;
};
export type AttentionCatalogOperations = {
  visibleProducts: number;
  soldOutProducts: number;
};

export type AttentionProviderContext = {
  organizationId: string;
  experiences: readonly AttentionExperience[];
  readinessByExperience: ReadonlyMap<string, readonly AttentionReadinessIssue[]>;
  rouletteOperationsByExperience: ReadonlyMap<string, AttentionRouletteOperations>;
  catalogOperationsByExperience?: ReadonlyMap<string, AttentionCatalogOperations>;
};

export type AttentionProvider = (context: AttentionProviderContext) => AttentionItem[];

const severityRank: Record<AttentionSeverity, number> = { critical: 3, warning: 2, info: 1 };

function experienceHref(id: string, section = 'overview') {
  return `/app/experiences/${encodeURIComponent(id)}#${section}`;
}

function experienceStatusProvider(context: AttentionProviderContext): AttentionItem[] {
  return context.experiences.flatMap((experience): AttentionItem[] => {
    const base = {
      organizationId: context.organizationId,
      resourceType: 'experience',
      resourceId: experience.id,
      createdAt: experience.updatedAt ?? null,
      actionLabel: 'Abrir experiencia',
      actionHref: experienceHref(experience.id),
    };
    if (experience.accessStatus === 'no_access' || experience.accessStatus === 'expired') {
      return [{
        ...base,
        id: `experience:${experience.id}:unavailable`,
        type: 'experience.unavailable',
        severity: 'critical',
        title: `${experience.name} no está disponible`,
        description: experience.accessStatus === 'expired' ? 'El acceso comercial está vencido.' : 'El acceso comercial no está disponible.',
      }];
    }
    if (experience.accessStatus === 'scheduled') {
      return [{
        ...base,
        id: `experience:${experience.id}:access-scheduled`,
        type: 'experience.access_scheduled',
        severity: 'info',
        title: `${experience.name} tiene acceso programado`,
        description: 'El acceso todavía no comenzó.',
      }];
    }
    const readiness = context.readinessByExperience.get(experience.id) ?? [];
    if (experience.status === 'draft' && readiness.length > 0) {
      const extra = readiness.length > 1 ? ` y ${readiness.length - 1} problema${readiness.length === 2 ? '' : 's'} más` : '';
      return [{
        ...base,
        id: `experience:${experience.id}:publish-blocked`,
        type: 'experience.publish_blocked',
        severity: 'warning',
        title: `No se puede publicar ${experience.name}`,
        description: `${readiness[0]!.message}${extra}`,
        actionLabel: 'Revisar configuración',
        actionHref: experienceHref(experience.id, 'configuration'),
      }];
    }
    if (experience.status === 'draft') return [{ ...base, id: `experience:${experience.id}:draft`, type: 'experience.draft', severity: 'warning', title: `${experience.name} todavía está en borrador`, description: 'Publicá la experiencia cuando la configuración esté lista.', actionLabel: 'Abrir configuración', actionHref: experienceHref(experience.id, 'configuration') }];
    if (experience.effectiveStatus === 'scheduled') return [{ ...base, id: `experience:${experience.id}:scheduled`, type: 'experience.scheduled', severity: 'info', title: `${experience.name} está programada`, description: 'La experiencia comenzará en la fecha configurada.' }];
    if (experience.effectiveStatus === 'expired') return [{ ...base, id: `experience:${experience.id}:expired`, type: 'experience.expired', severity: 'warning', title: `${experience.name} ya finalizó`, description: 'Revisá las fechas si querés preparar una nueva campaña.' }];
    if (experience.effectiveStatus === 'paused') return [{ ...base, id: `experience:${experience.id}:paused`, type: 'experience.paused', severity: 'warning', title: `${experience.name} está pausada`, description: 'La experiencia no está disponible mientras permanezca pausada.' }];
    if (readiness.length > 0) return [{ ...base, id: `experience:${experience.id}:publish-blocked`, type: 'experience.publish_blocked', severity: 'warning', title: `Hay cambios que no se pueden publicar en ${experience.name}`, description: readiness[0]!.message, actionLabel: 'Revisar configuración', actionHref: experienceHref(experience.id, 'configuration') }];
    return [];
  });
}

function rouletteOperationsProvider(context: AttentionProviderContext): AttentionItem[] {
  return context.experiences.flatMap((experience) => {
    if (experience.type !== 'roulette') return [];
    const operations = context.rouletteOperationsByExperience.get(experience.id);
    if (!operations) return [];
    const items: AttentionItem[] = [];
    if (operations.soldOutLimitedPrizes > 0) items.push({ organizationId: context.organizationId, id: `roulette:${experience.id}:sold-out`, type: 'roulette.inventory_sold_out', severity: 'warning', title: `${experience.name} tiene premios agotados`, description: 'Revisá el inventario limitado antes de continuar la campaña.', resourceType: 'experience', resourceId: experience.id, actionLabel: 'Revisar inventario', actionHref: experienceHref(experience.id, 'inventory'), createdAt: experience.updatedAt ?? null });
    if (operations.pendingClaims > 0) items.push({ organizationId: context.organizationId, id: `roulette:${experience.id}:pending-claims`, type: 'roulette.pending_redemptions', severity: 'warning', title: `${experience.name} tiene canjes pendientes`, description: `${operations.pendingClaims.toLocaleString('es-AR')} premio${operations.pendingClaims === 1 ? '' : 's'} espera${operations.pendingClaims === 1 ? '' : 'n'} canje.`, resourceType: 'experience', resourceId: experience.id, actionLabel: 'Ver resultados', actionHref: experienceHref(experience.id, 'results'), createdAt: experience.updatedAt ?? null });
    return items;
  });
}

function catalogOperationsProvider(context: AttentionProviderContext): AttentionItem[] {
  return context.experiences.flatMap((experience) => {
    if (experience.type !== 'product-catalog') return [];
    const operations = context.catalogOperationsByExperience?.get(experience.id);
    if (!operations) return [];
    const items: AttentionItem[] = [];
    if (operations.visibleProducts === 0) items.push({ organizationId: context.organizationId, id: `catalog:${experience.id}:no-visible-products`, type: 'catalog.no_visible_products', severity: 'warning', title: `${experience.name} no tiene productos visibles`, description: 'Agregá o hacé visible un producto antes de publicar el catálogo.', resourceType: 'experience', resourceId: experience.id, actionLabel: 'Revisar catálogo', actionHref: experienceHref(experience.id, 'configuration'), createdAt: experience.updatedAt ?? null });
    if (operations.soldOutProducts > 0) items.push({ organizationId: context.organizationId, id: `catalog:${experience.id}:sold-out`, type: 'catalog.products_sold_out', severity: 'warning', title: `${experience.name} tiene productos agotados`, description: `${operations.soldOutProducts.toLocaleString('es-AR')} producto${operations.soldOutProducts === 1 ? '' : 's'} sin stock.`, resourceType: 'experience', resourceId: experience.id, actionLabel: 'Revisar catálogo', actionHref: experienceHref(experience.id, 'configuration'), createdAt: experience.updatedAt ?? null });
    return items;
  });
}

export const defaultAttentionProviders: readonly AttentionProvider[] = [experienceStatusProvider, rouletteOperationsProvider, catalogOperationsProvider];

function createdAtValue(value: string | number | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function orderAttentionItems(items: readonly AttentionItem[]) {
  return [...items].sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || createdAtValue(b.createdAt) - createdAtValue(a.createdAt) || a.id.localeCompare(b.id));
}

export function buildAttentionItems(context: AttentionProviderContext, providers: readonly AttentionProvider[] = defaultAttentionProviders) {
  const unique = new Map<string, AttentionItem>();
  for (const provider of providers) for (const item of provider(context)) if (!unique.has(item.id)) unique.set(item.id, item);
  return orderAttentionItems([...unique.values()]);
}
