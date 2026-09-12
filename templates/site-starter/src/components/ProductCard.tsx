import type { PublicProduct } from '@corsteno/client';
import { Link } from 'react-router-dom';
import { CtaLink } from '../utils/urls';
import { formatPrice } from '../utils/price';
import { stockLabel } from '../utils/stock';

export function ProductCard({ product }: { product: PublicProduct }) {
  return <article className="product-card">
    <Link className="product-card-image" to={`/productos/${encodeURIComponent(product.key)}`} aria-label={`Ver ${product.name}`}>
      {product.images.main ? <img src={product.images.main.url} alt={product.name} /> : <span>Sin imagen</span>}
    </Link>
    <div className="product-card-body"><p className={`stock-label${product.stock <= 0 ? ' is-sold-out' : ''}`}>{stockLabel(product.stock)}</p><h3><Link to={`/productos/${encodeURIComponent(product.key)}`}>{product.name}</Link></h3>{product.description && <p className="product-card-description">{product.description}</p>}<strong className="product-price">{formatPrice(product.price.amountMinor, product.price.currency)}</strong><div className="product-card-actions"><Link className="text-link" to={`/productos/${encodeURIComponent(product.key)}`}>Ver producto</Link>{product.cta.label && product.cta.url && <CtaLink url={product.cta.url} className="text-link">{product.cta.label}</CtaLink>}</div></div>
  </article>;
}
