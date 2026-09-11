export const CATALOG_PRODUCT_LIMITS = {
  name: 120,
  description: 1000,
  ctaLabel: 80,
  ctaUrl: 2048,
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
  | 'ctaUrl';

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

export function catalogProductFieldErrors(
  product: Record<string, unknown>,
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
  if (
    ctaUrl !== null &&
    ctaUrl !== undefined &&
    !isSafeCatalogExternalUrl(ctaUrl)
  )
    errors.ctaUrl = 'Usá un enlace http:// o https:// válido.';
  return errors;
}
