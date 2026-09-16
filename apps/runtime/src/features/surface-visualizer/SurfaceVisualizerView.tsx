import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CatalogPublicProduct } from '../../api/publicExperiencesApi';
import { isSurfaceMaterialConfig } from '@corsteno/types';
import { SurfaceVisualizerCanvas } from './SurfaceVisualizerCanvas';
import { assignProductToSurface, resetSurfaceAssignments, type SurfaceAssignments } from './state/assignments';
import type { RoomSurfaceId } from './utils/surfaces';
import { ROOM_SURFACES, surfaceAreaM2 } from './utils/surfaces';

type Props = { slug: string; initialProduct: CatalogPublicProduct; products: CatalogPublicProduct[] };

function priceLabel(product: CatalogPublicProduct) {
  const price = new Intl.NumberFormat('es-AR', { style: 'currency', currency: product.currency, maximumFractionDigits: 0 }).format(product.priceMinorUnits / 100);
  return `${price}${product.priceUnit ? ` / ${product.priceUnit}` : ''}`;
}

function productDescriptor(product: CatalogPublicProduct) {
  const material = product.metadata?.material;
  const finish = typeof product.metadata?.finish === 'string' ? product.metadata.finish.trim().toLocaleLowerCase('es-AR') : '';
  return [material, finish].filter((value): value is string => typeof value === 'string' && Boolean(value.trim())).join(' · ');
}

export function SurfaceVisualizerView({ slug, initialProduct, products }: Props) {
  const materialProducts = useMemo(() => products.filter((product) => product.surfaceConfig && isSurfaceMaterialConfig(product.surfaceConfig) && product.surfaceConfig.enabled !== false), [products]);
  const surfaceConfigs = useMemo(() => new Map(materialProducts.flatMap((product) => product.surfaceConfig && isSurfaceMaterialConfig(product.surfaceConfig) ? [[product.id, product.surfaceConfig] as const] : [])), [materialProducts]);
  const [selectedProductId, setSelectedProductId] = useState(initialProduct.id);
  const [selectedSurfaceId, setSelectedSurfaceId] = useState<RoomSurfaceId>('wall-back');
  const [assignments, setAssignments] = useState<SurfaceAssignments>(() => resetSurfaceAssignments());
  const [resetViewToken, setResetViewToken] = useState(0);
  const [renderFailed, setRenderFailed] = useState(false);
  const [notice, setNotice] = useState('');
  const activeProduct = materialProducts.find((product) => product.id === selectedProductId) ?? initialProduct;
  const selectedSurface = ROOM_SURFACES.find((surface) => surface.id === selectedSurfaceId) ?? ROOM_SURFACES[0]!;
  const onSurfaceSelect = useCallback((surfaceId: RoomSurfaceId) => { setSelectedSurfaceId(surfaceId); setNotice(''); }, []);
  const onRendererError = useCallback(() => setRenderFailed(true), []);
  const onMaterialWarning = useCallback((message: string) => setNotice(message), []);

  function selectProduct(productId: string) {
    const product = materialProducts.find((item) => item.id === productId);
    if (!product) return;
    setSelectedProductId(productId);
    setAssignments((current) => assignProductToSurface(current, selectedSurfaceId, productId));
    setNotice(`${product.name} aplicado a ${selectedSurface.label.toLocaleLowerCase('es-AR')}.`);
  }

  function resetRoom() {
    setAssignments(resetSurfaceAssignments());
    setSelectedProductId(initialProduct.id);
    setNotice('El ambiente volvió a sus materiales neutros.');
  }

  function resetCamera() {
    setResetViewToken((value) => value + 1);
    setNotice('La vista volvió a su encuadre inicial.');
  }

  return <main className="surface-visualizer-page">
    <div className="surface-visualizer">
      <header className="surface-visualizer-header">
        <Link className="surface-back-link" to={`/r/${encodeURIComponent(slug)}`}>← Volver al catálogo</Link>
        <div className="surface-header-actions"><span className="surface-demo-label">VISUALIZADOR 3D</span><div className="surface-header-buttons"><button type="button" className="surface-reset-view-button" onClick={resetCamera}>Restablecer vista</button><button type="button" className="surface-reset-button" onClick={resetRoom}>Restablecer ambiente</button></div></div>
      </header>
      <div className="surface-mobile-product-summary"><span>Producto seleccionado</span><strong>{activeProduct.name}</strong><b>{priceLabel(activeProduct)}</b></div>
      <section className="surface-workspace" aria-label="Visualizador de revestimientos">
        <div className="surface-stage-wrap">
          {renderFailed ? <div className="surface-render-fallback" role="alert"><h1>No pudimos cargar el visualizador.</h1><p>Podés seguir viendo los productos en el catálogo.</p><Link to={`/r/${encodeURIComponent(slug)}`}>Volver al catálogo</Link></div> : <SurfaceVisualizerCanvas assignments={assignments} surfaceConfigs={surfaceConfigs} selectedSurfaceId={selectedSurfaceId} resetViewToken={resetViewToken} onSurfaceSelect={onSurfaceSelect} onError={onRendererError} onMaterialWarning={onMaterialWarning} />}
          <p className="surface-stage-caption">Arrastrá para observar · rueda o pellizco para acercar · tocá una superficie</p>
        </div>
        <aside className="surface-control-panel" aria-label="Controles del ambiente">
          <div className="surface-panel-heading"><p className="surface-eyebrow">AMBIENTE 3D</p><h1>Probá los revestimientos</h1><p>Elegí una superficie y aplicá un material para comparar cómo cambia el espacio.</p></div>
          <section className="surface-control-section" aria-labelledby="surface-select-title"><div className="surface-section-heading"><h2 id="surface-select-title">1. Elegí una superficie</h2><span>{surfaceAreaM2(selectedSurface).toFixed(1)} m²</span></div><p className="surface-editing-indicator" aria-live="polite">Editando: <strong>{selectedSurface.label}</strong></p><div className="surface-target-grid">{ROOM_SURFACES.map((surface) => <button type="button" className={`surface-target${selectedSurfaceId === surface.id ? ' is-selected' : ''}`} key={surface.id} aria-pressed={selectedSurfaceId === surface.id} onClick={() => onSurfaceSelect(surface.id)}><span>{surface.label}</span><small>{assignments[surface.id] ? 'Material aplicado' : 'Sin revestir'}</small></button>)}</div></section>
          <section className="surface-control-section" aria-labelledby="surface-product-title"><div className="surface-section-heading"><h2 id="surface-product-title">2. Elegí un revestimiento</h2><span>{materialProducts.length} productos</span></div><p className="surface-selection-hint">Se aplica de inmediato a la superficie activa.</p><div className="surface-product-list">{materialProducts.map((product) => <button type="button" className={`surface-product-option${selectedProductId === product.id ? ' is-selected' : ''}`} key={product.id} aria-pressed={selectedProductId === product.id} onClick={() => selectProduct(product.id)}>{product.mainImageUrl ? <img src={product.mainImageUrl} alt="" loading="lazy" /> : <span className="surface-product-image-placeholder" aria-hidden="true" />}<span className="surface-product-info"><strong>{product.name}</strong>{productDescriptor(product) && <small>{productDescriptor(product)}</small>}<small>{priceLabel(product)}</small></span><span className="surface-product-check" aria-hidden="true">{selectedProductId === product.id ? '✓' : ''}</span></button>)}</div></section>
          <div className="surface-apply-area"><div className="surface-active-product"><span>Producto seleccionado</span><strong>{activeProduct.name}</strong><b>{priceLabel(activeProduct)}</b></div>{notice && <p className="surface-notice" role="status">{notice}</p>}</div>
        </aside>
      </section>
    </div>
  </main>;
}
