import { useEffect, useRef } from 'react';
import { createExperienceAnalytics } from '../../analytics/experienceAnalytics';
import type { CatalogPublicProduct } from '../../api/publicExperiencesApi';
import './catalog.css';

type CatalogConfig = { schemaVersion: 1; title?: string; intro?: string };

export function ProductCatalogView({ config, products, slug }: { config: unknown; products: CatalogPublicProduct[]; slug: string }) {
  const analytics = useRef(createExperienceAnalytics(import.meta.env.VITE_API_URL ?? 'http://localhost:8787', slug));
  useEffect(() => { analytics.current.trackViewOnce(); }, [slug]);
  const copy: CatalogConfig = config && typeof config === 'object' && !Array.isArray(config) ? config as CatalogConfig : { schemaVersion: 1 };
  return <div className="catalog-runtime"><header className="catalog-runtime-header"><p className="catalog-runtime-kicker">CATÁLOGO</p><h1>{copy.title || 'Catálogo de productos'}</h1>{copy.intro && <p>{copy.intro}</p>}</header><div className="catalog-product-grid">{products.map((product, index) => <article className="catalog-product" key={`${product.name}-${product.priceMinorUnits}-${index}`}><div className="catalog-product-image">{product.mainImageUrl ? <img src={product.mainImageUrl} alt="" /> : <span>Sin imagen</span>}</div><div className="catalog-product-body"><h2>{product.name}</h2>{product.description && <p>{product.description}</p>}<strong>{new Intl.NumberFormat('es-AR', { style: 'currency', currency: product.currency }).format(product.priceMinorUnits / 100)}</strong><span className={product.stock > 0 ? 'catalog-stock' : 'catalog-stock catalog-sold-out'}>{product.stock > 0 ? `${product.stock} disponibles` : 'Agotado'}</span>{product.ctaLabel && product.ctaUrl && product.stock > 0 && <a className="catalog-cta" href={product.ctaUrl} target="_blank" rel="noreferrer">{product.ctaLabel}</a>}</div></article>)}</div></div>;
}
