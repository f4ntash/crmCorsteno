import { useEffect, useRef, useState } from 'react';
import { createExperienceAnalytics } from '../../analytics/experienceAnalytics';
import { runtimeApiBaseUrl } from '../../config/runtimeEnvironment';
import type { CatalogPublicProduct } from '../../api/publicExperiencesApi';
import { Link } from 'react-router-dom';
import { isSurfaceMaterialConfig } from '@corsteno/types';
import './catalog.css';

type CatalogConfig = { schemaVersion: 1; title?: string; intro?: string };

export function catalogProductSummary(product: CatalogPublicProduct) {
  const material = product.metadata?.material;
  const finish = typeof product.metadata?.finish === 'string' ? product.metadata.finish.trim().toLocaleLowerCase('es-AR') : '';
  const secondary = finish || product.metadata?.environment || product.metadata?.recommendedUse;
  const highlights = [material, secondary].filter((value): value is string => typeof value === 'string' && Boolean(value.trim()));
  return highlights.length ? highlights.join(' · ') : product.description;
}

function CatalogProductCard({ product, slug }: { product: CatalogPublicProduct; slug: string }) {
  const [selectedImage, setSelectedImage] = useState(0);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const images = [product.mainImageUrl, ...product.gallery].filter((url): url is string => Boolean(url));
  useEffect(() => setSelectedImage(0), [images.join('|')]);
  const image = images[selectedImage];
  const imageToShow = image && failedImage !== image ? image : null;
  const summary = catalogProductSummary(product);
  const priceUnit = product.priceUnit?.trim();
  const hasPriceUnit = Boolean(priceUnit);
  const price = new Intl.NumberFormat('es-AR', { style: 'currency', currency: product.currency, ...(hasPriceUnit ? { currencyDisplay: 'code', minimumFractionDigits: 0 } : {}) }).format(product.priceMinorUnits / 100);
  const supportsSurfaceVisualizer = Boolean(product.surfaceConfig && isSurfaceMaterialConfig(product.surfaceConfig) && product.surfaceConfig.enabled !== false);
  return <article className="catalog-product">
    <div className="catalog-product-media">
      <div className="catalog-product-image">{imageToShow ? <img src={imageToShow} alt={product.name} onError={() => setFailedImage(imageToShow)} /> : <span role="img" aria-label={`Imagen no disponible para ${product.name}`}>Sin imagen</span>}</div>
      {images.length > 1 && <div className="catalog-product-thumbnails" role="list" aria-label={`Imágenes de ${product.name}`}>
        {images.map((url, index) => <button type="button" className={`catalog-product-thumbnail${selectedImage === index ? ' is-selected' : ''}`} key={`${url}-${index}`} onClick={() => setSelectedImage(index)} aria-label={`Ver imagen ${index + 1} de ${product.name}`} aria-current={selectedImage === index ? 'true' : undefined}><img src={url} alt="" /></button>)}
      </div>}
    </div>
    <div className="catalog-product-body"><h2>{product.name}</h2>{summary && <p>{summary}</p>}<strong className="catalog-product-price">{price}{priceUnit ? ` / ${priceUnit}` : ''}</strong><span className={`catalog-stock${product.stock <= 0 ? ' catalog-sold-out' : product.stock <= 3 ? ' catalog-stock-low' : ''}`}>{product.stock > 0 ? `${product.stock} disponibles` : 'Agotado'}</span>{supportsSurfaceVisualizer && <Link className="catalog-visualizer-link" to={`/r/${encodeURIComponent(slug)}/visualizer/${encodeURIComponent(product.id)}`}>Ver en ambiente</Link>}{product.ctaLabel && product.ctaUrl && product.stock > 0 && <a className="catalog-cta" href={product.ctaUrl} target="_blank" rel="noreferrer">{product.ctaLabel}</a>}</div>
  </article>;
}

export function ProductCatalogView({ config, products, slug }: { config: unknown; products: CatalogPublicProduct[]; slug: string }) {
  const analytics = useRef(createExperienceAnalytics(runtimeApiBaseUrl, slug));
  useEffect(() => { analytics.current.trackViewOnce(); }, [slug]);
  const copy: CatalogConfig = config && typeof config === 'object' && !Array.isArray(config) ? config as CatalogConfig : { schemaVersion: 1 };
  return <div className="catalog-runtime"><header className="catalog-runtime-header"><p className="catalog-runtime-kicker">CATÁLOGO</p><h1>{copy.title || 'Catálogo de productos'}</h1>{copy.intro && <p>{copy.intro}</p>}</header><div className="catalog-product-grid">{products.map((product, index) => <CatalogProductCard product={product} slug={slug} key={product.id || `${product.name}-${product.priceMinorUnits}-${index}`} />)}</div></div>;
}
