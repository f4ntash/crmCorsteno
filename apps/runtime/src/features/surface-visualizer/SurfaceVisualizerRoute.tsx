import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { publicExperiencesApi, type CatalogPublicProduct } from '../../api/publicExperiencesApi';
import { getParticipantIdentity } from '../../analytics/experienceAnalytics';
import { SurfaceVisualizerView } from './SurfaceVisualizerView';
import { isSurfaceMaterialConfig } from '@corsteno/types';
import './surface-visualizer.css';

type RouteState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; products: CatalogPublicProduct[]; initialProduct: CatalogPublicProduct };

export function SurfaceVisualizerRoute() {
  const { slug = '', productId = '' } = useParams();
  const [state, setState] = useState<RouteState>({ status: 'loading' });
  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    void publicExperiencesApi.getExperience(slug, getParticipantIdentity()).then((response) => {
      if (!active) return;
      if (!response.active || response.experience.type !== 'product-catalog' || !response.experience.products) { setState({ status: 'error' }); return; }
      const products = response.experience.products.filter((product) => product.surfaceConfig && isSurfaceMaterialConfig(product.surfaceConfig) && product.surfaceConfig.enabled !== false);
      const initialProduct = products.find((product) => product.id === productId);
      setState(initialProduct ? { status: 'ready', products, initialProduct } : { status: 'error' });
    }).catch(() => { if (active) setState({ status: 'error' }); });
    return () => { active = false; };
  }, [slug, productId]);

  if (state.status === 'loading') return <main className="surface-visualizer-fallback" aria-live="polite"><p>Cargando ambiente…</p></main>;
  if (state.status === 'error') return <main className="surface-visualizer-fallback"><section><h1>No pudimos cargar el visualizador.</h1><Link to={`/r/${encodeURIComponent(slug)}`}>Volver al catálogo</Link></section></main>;
  return <SurfaceVisualizerView slug={slug} products={state.products} initialProduct={state.initialProduct} />;
}
