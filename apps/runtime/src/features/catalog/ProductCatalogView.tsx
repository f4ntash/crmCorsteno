import { useEffect, useRef, useState } from 'react';
import { createExperienceAnalytics } from '../../analytics/experienceAnalytics';
import type { CatalogPublicProduct } from '../../api/publicExperiencesApi';
import './catalog.css';

type CatalogConfig = { schemaVersion: 1; title?: string; intro?: string };

function CatalogProductCard({ product }: { product: CatalogPublicProduct }) {
  const [selectedImage, setSelectedImage] = useState(0);
  const images = [product.mainImageUrl, ...product.gallery].filter((url): url is string => Boolean(url));
  useEffect(() => setSelectedImage(0), [images.join('|')]);
  const image = images[selectedImage];
  return <article className="catalog-product">
    <div className="catalog-product-media">
      <div className="catalog-product-image">{image ? <img src={image} alt={product.name} /> : <span>Sin imagen</span>}</div>
      {images.length > 1 && <div className="catalog-product-thumbnails" role="list" aria-label={`Imágenes de ${product.name}`}>
        {images.map((url, index) => <button type="button" className={`catalog-product-thumbnail${selectedImage === index ? ' is-selected' : ''}`} key={`${url}-${index}`} onClick={() => setSelectedImage(index)} aria-label={`Ver imagen ${index + 1} de ${product.name}`} aria-current={selectedImage === index ? 'true' : undefined}><img src={url} alt="" /></button>)}
      </div>}
    </div>
    <div className="catalog-product-body"><h2>{product.name}</h2>{product.description && <p>{product.description}</p>}<strong className="catalog-product-price">{new Intl.NumberFormat('es-AR', { style: 'currency', currency: product.currency }).format(product.priceMinorUnits / 100)}</strong><span className={`catalog-stock${product.stock <= 0 ? ' catalog-sold-out' : product.stock <= 3 ? ' catalog-stock-low' : ''}`}>{product.stock > 0 ? `${product.stock} disponibles` : 'Agotado'}</span>{product.ctaLabel && product.ctaUrl && product.stock > 0 && <a className="catalog-cta" href={product.ctaUrl} target="_blank" rel="noreferrer">{product.ctaLabel}</a>}</div>
  </article>;
}

export function ProductCatalogView({ config, products, slug }: { config: unknown; products: CatalogPublicProduct[]; slug: string }) {
  const analytics = useRef(createExperienceAnalytics(import.meta.env.VITE_API_URL ?? 'http://localhost:8787', slug));
  useEffect(() => { analytics.current.trackViewOnce(); }, [slug]);
  const copy: CatalogConfig = config && typeof config === 'object' && !Array.isArray(config) ? config as CatalogConfig : { schemaVersion: 1 };
  return <div className="catalog-runtime"><header className="catalog-runtime-header"><p className="catalog-runtime-kicker">CATÁLOGO</p><h1>{copy.title || 'Catálogo de productos'}</h1>{copy.intro && <p>{copy.intro}</p>}</header><div className="catalog-product-grid">{products.map((product, index) => <CatalogProductCard product={product} key={`${product.name}-${product.priceMinorUnits}-${index}`} />)}</div></div>;
}
