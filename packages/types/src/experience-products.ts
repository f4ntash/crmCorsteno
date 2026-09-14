export const CRM_PRODUCT_TYPES = ['roulette', 'website', 'ar', 'product-catalog'] as const;
export type CrmProductType = (typeof CRM_PRODUCT_TYPES)[number];

export const CRM_PRODUCT_LABELS: Record<CrmProductType, string> = {
  roulette: 'Ruleta',
  website: 'Web',
  ar: 'AR',
  'product-catalog': 'Catálogo de productos',
};

export function isCrmProductType(value: unknown): value is CrmProductType {
  return typeof value === 'string' && CRM_PRODUCT_TYPES.includes(value as CrmProductType);
}
