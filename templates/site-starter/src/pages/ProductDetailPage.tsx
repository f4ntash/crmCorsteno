import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PublicProduct } from '@corsteno/client';
import { corsteno } from '../lib/corsteno';
import { ErrorState, LoadingState, NotFoundState } from '../components/PageStates';
import { ProductMedia } from '../components/ProductMedia';
import { CtaLink } from '../utils/urls';
import { formatPrice } from '../utils/price';
import { stockLabel } from '../utils/stock';
import { isNotFoundError } from '../utils/api';

export function ProductDetailPage({ onSiteName }: { onSiteName: (name: string) => void }) {
  const { productKey } = useParams();
  const [product, setProduct] = useState<PublicProduct | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'not-found' | 'error'>('loading');
  const load = () => {
    if (!productKey) { setState('not-found'); return; }
    setState('loading');
    void corsteno.getProduct(productKey).then((response) => { onSiteName(response.site.name); setProduct(response.product); setState('ready'); }).catch((cause) => setState(isNotFoundError(cause) ? 'not-found' : 'error'));
  };
  useEffect(load, [onSiteName, productKey]);
  if (state === 'loading') return <LoadingState label="Cargando producto…" />;
  if (state === 'not-found') return <NotFoundState />;
  if (state === 'error' || !product) return <ErrorState onRetry={load} label="No pudimos cargar este producto." />;
  return <section className="detail-page"><Link className="back-link" to="/productos">← Volver a productos</Link><div className="detail-grid"><ProductMedia product={product} /><div className="detail-copy"><p className={`stock-label${product.stock <= 0 ? ' is-sold-out' : ''}`}>{stockLabel(product.stock)}</p><h1>{product.name}</h1><p className="detail-description">{product.description}</p><strong className="detail-price">{formatPrice(product.price.amountMinor, product.price.currency)}</strong>{product.cta.label && product.cta.url && <CtaLink url={product.cta.url}>{product.cta.label}</CtaLink>}</div></div></section>;
}
