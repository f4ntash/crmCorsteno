import type { PublicProduct } from '@corsteno/client';
import { ProductCard } from './ProductCard';

export function ProductGrid({ products }: { products: PublicProduct[] }) {
  if (!products.length) return <div className="empty-state"><h2>Próximamente</h2><p>No hay productos publicados en este sitio.</p></div>;
  return <div className="product-grid">{products.map((product) => <ProductCard key={product.key} product={product} />)}</div>;
}
