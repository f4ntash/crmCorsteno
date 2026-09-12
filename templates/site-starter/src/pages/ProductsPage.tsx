import { useEffect, useState } from 'react';
import type { PublicProduct } from '@corsteno/client';
import { corsteno } from '../lib/corsteno';
import { ErrorState, LoadingState } from '../components/PageStates';
import { ProductGrid } from '../components/ProductGrid';

export function ProductsPage({ onSiteName }: { onSiteName: (name: string) => void }) {
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const load = () => {
    setState('loading');
    void corsteno.getProducts().then((response) => { onSiteName(response.site.name); setProducts(response.products); setState('ready'); }).catch(() => setState('error'));
  };
  useEffect(load, [onSiteName]);
  if (state === 'loading') return <LoadingState label="Cargando productos…" />;
  if (state === 'error') return <ErrorState onRetry={load} label="No pudimos cargar los productos." />;
  return <section className="listing-page"><div className="page-intro"><p className="section-kicker">Colección</p><h1>Productos</h1><p>Conocé la selección disponible.</p></div><ProductGrid products={products} /></section>;
}
