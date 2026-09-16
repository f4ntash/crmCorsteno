export const CATALOG_PRODUCT_LIMITS = {
  name: 120,
  description: 1000,
  ctaLabel: 80,
  ctaUrl: 2048,
  priceUnit: 32,
  metadataKeys: 32,
  metadataKey: 40,
  metadataValue: 160,
  priceMinorUnits: 9_000_000_000_000_000,
  stock: 1_000_000_000,
  galleryImages: 6,
} as const;

export type CatalogProductField =
  | 'name'
  | 'description'
  | 'priceMinorUnits'
  | 'currency'
  | 'stock'
  | 'visible'
  | 'ctaLabel'
  | 'ctaUrl'
  | 'priceUnit'
  | 'metadata';
export type CatalogProductMetadata = Record<string, string | number | boolean | null>;
export type CatalogCtaType = 'url' | 'whatsapp';

export function isSafeCatalogExternalUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > CATALOG_PRODUCT_LIMITS.ctaUrl)
    return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function catalogPhoneDigits(value: string) {
  if (!/^[+\d\s().-]+$/.test(value.trim())) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function catalogPhoneFromCtaUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^https:\/\/wa\.me\/(\d{8,15})$/i);
  return match?.[1] ?? null;
}

export function isCatalogWhatsAppPhone(value: unknown) {
  return typeof value === 'string' && Boolean(catalogPhoneDigits(value));
}

export function normalizeCatalogCtaUrl(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (isSafeCatalogExternalUrl(trimmed)) return trimmed;
  const digits = catalogPhoneDigits(trimmed);
  return digits ? `https://wa.me/${digits}` : null;
}

export function catalogProductFieldErrors(
  product: Record<string, unknown>,
  ctaType: CatalogCtaType = 'url',
): Partial<Record<CatalogProductField, string>> {
  const errors: Partial<Record<CatalogProductField, string>> = {};
  const name = product.name;
  if (typeof name !== 'string' || !name.trim())
    errors.name = 'Ingresá un nombre.';
  else if (name.trim().length > CATALOG_PRODUCT_LIMITS.name)
    errors.name = `Usá hasta ${CATALOG_PRODUCT_LIMITS.name} caracteres.`;

  const description = product.description;
  if (typeof description !== 'string')
    errors.description = 'La descripción no es válida.';
  else if (description.length > CATALOG_PRODUCT_LIMITS.description)
    errors.description = `Usá hasta ${CATALOG_PRODUCT_LIMITS.description} caracteres.`;

  const price = product.priceMinorUnits;
  if (
    typeof price !== 'number' ||
    !Number.isSafeInteger(price) ||
    price < 0 ||
    price > CATALOG_PRODUCT_LIMITS.priceMinorUnits
  ) {
    errors.priceMinorUnits =
      'Ingresá un precio no negativo con hasta dos decimales.';
  }

  if (
    typeof product.currency !== 'string' ||
    !/^[A-Z]{3}$/.test(product.currency)
  )
    errors.currency = 'La moneda no es válida.';

  const stock = product.stock;
  if (
    typeof stock !== 'number' ||
    !Number.isInteger(stock) ||
    stock < 0 ||
    stock > CATALOG_PRODUCT_LIMITS.stock
  ) {
    errors.stock = 'Ingresá un stock entero igual o mayor a cero.';
  }

  if (typeof product.visible !== 'boolean')
    errors.visible = 'La visibilidad no es válida.';

  const ctaLabel = product.ctaLabel;
  if (
    ctaLabel !== null &&
    ctaLabel !== undefined &&
    (typeof ctaLabel !== 'string' ||
      ctaLabel.length > CATALOG_PRODUCT_LIMITS.ctaLabel)
  ) {
    errors.ctaLabel = `Usá hasta ${CATALOG_PRODUCT_LIMITS.ctaLabel} caracteres.`;
  }

  const ctaUrl = product.ctaUrl;
  if (ctaUrl !== null && ctaUrl !== undefined) {
    const valid = ctaType === 'whatsapp'
      ? isCatalogWhatsAppPhone(ctaUrl) || Boolean(catalogPhoneFromCtaUrl(ctaUrl))
      : isSafeCatalogExternalUrl(ctaUrl);
    if (!valid) errors.ctaUrl = ctaType === 'whatsapp'
      ? 'Ingresá el número con código de país y área.'
      : 'Usá un enlace http:// o https:// válido.';
  }

  const priceUnit = product.priceUnit;
  if (priceUnit !== null && priceUnit !== undefined && (typeof priceUnit !== 'string' || priceUnit.trim().length > CATALOG_PRODUCT_LIMITS.priceUnit)) {
    errors.priceUnit = `Usá hasta ${CATALOG_PRODUCT_LIMITS.priceUnit} caracteres.`;
  }

  const metadata = product.metadata;
  if (metadata !== null && metadata !== undefined) {
    const validRecord = typeof metadata === 'object' && !Array.isArray(metadata);
    const entries = validRecord ? Object.entries(metadata as Record<string, unknown>) : [];
    if (!validRecord || entries.length > CATALOG_PRODUCT_LIMITS.metadataKeys || entries.some(([key, value]) =>
      !/^[A-Za-z][A-Za-z0-9_-]*$/.test(key) || key.length > CATALOG_PRODUCT_LIMITS.metadataKey ||
      !(value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value) || typeof value === 'string' && value.length <= CATALOG_PRODUCT_LIMITS.metadataValue))) {
      errors.metadata = 'La metadata debe ser un objeto simple con campos y valores válidos.';
    }
  }
  return errors;
}

export function normalizeCatalogProductMetadata(value: unknown): CatalogProductMetadata | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length || entries.some(([, item]) => !(item === null || typeof item === 'string' || typeof item === 'number' && Number.isFinite(item) || typeof item === 'boolean'))) return null;
  return Object.fromEntries(entries) as CatalogProductMetadata;
}
