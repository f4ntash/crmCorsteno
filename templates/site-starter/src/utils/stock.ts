export function stockLabel(stock: number) {
  return Number.isInteger(stock) && stock > 0 ? 'Disponible' : 'Agotado';
}
