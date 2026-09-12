export function formatPrice(amountMinor: number, currency: string) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || !/^[A-Z]{3}$/.test(currency)) return 'Precio no disponible';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}
