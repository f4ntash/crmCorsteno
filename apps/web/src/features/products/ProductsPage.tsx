import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CATALOG_PRODUCT_LIMITS, catalogProductFieldErrors, formatMoneyFromMinor, parseMoneyToMinor, type CatalogProductField } from '@corsteno/types';
import { AssetPicker } from '../assets/AssetPicker';
import { ApiError } from '../../shared/api/client';
import { Dialog } from '../../shared/ui/Dialog';
import { productsApi, type OrganizationProduct } from '../experiences/api';
import './products.css';

type Props = { org: string; canEdit: boolean; canManageAssets?: boolean };
type Form = Pick<OrganizationProduct, 'name' | 'description' | 'priceMinorUnits' | 'currency' | 'stock' | 'mainAssetUrl' | 'ctaLabel' | 'ctaUrl'>;
type Errors = Partial<Record<CatalogProductField, string>>;
const empty: Form = { name: '', description: '', priceMinorUnits: 0, currency: 'ARS', stock: 0, mainAssetUrl: null, ctaLabel: null, ctaUrl: null };

function productForm(product: OrganizationProduct): Form {
  return { name: product.name, description: product.description, priceMinorUnits: product.priceMinorUnits, currency: product.currency, stock: product.stock, mainAssetUrl: product.mainAssetUrl, ctaLabel: product.ctaLabel, ctaUrl: product.ctaUrl };
}

export function ProductsPage({ org, canEdit, canManageAssets = false }: Props) {
  const [items, setItems] = useState<OrganizationProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<OrganizationProduct | 'new' | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [priceInput, setPriceInput] = useState('0');
  const [stockInput, setStockInput] = useState('0');
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true); setError('');
    try { setItems((await productsApi.list(org)).items); } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudieron cargar los productos.'); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [org]);

  function open(product: OrganizationProduct | 'new') {
    setEditing(product); setForm(product === 'new' ? empty : productForm(product)); setPriceInput(product === 'new' ? '0' : (product.priceMinorUnits / 100).toFixed(2).replace('.', ',')); setStockInput(product === 'new' ? '0' : String(product.stock)); setErrors({}); setSubmitted(false); setMessage('');
  }
  function validate(next = form, nextPrice = priceInput, nextStock = stockInput) {
    return catalogProductFieldErrors({ ...next, priceMinorUnits: parseMoneyToMinor(nextPrice) ?? nextPrice, stock: /^\d+$/.test(nextStock) ? Number(nextStock) : nextStock, visible: true });
  }
  function setField<K extends keyof Form>(key: K, value: Form[K]) { const next = { ...form, [key]: value }; setForm(next); if (submitted) setErrors(validate(next)); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!canEdit || saving) return;
    setSubmitted(true); const nextErrors = validate(); setErrors(nextErrors); if (Object.keys(nextErrors).length || !editing) return;
    const price = parseMoneyToMinor(priceInput); if (price === null || !/^\d+$/.test(stockInput)) return;
    setSaving(true); setError('');
    try {
      const value = { ...form, priceMinorUnits: price, stock: Number(stockInput) };
      if (editing === 'new') await productsApi.create(org, value); else await productsApi.update(editing.id, org, value);
      setEditing(null); setMessage('Producto guardado como borrador.'); await load();
    } catch (caught) {
      const details = caught instanceof ApiError && Array.isArray(caught.details) ? caught.details : [];
      const next: Errors = {}; for (const issue of details) { if (!issue || typeof issue !== 'object') continue; const path = (issue as { path?: unknown }).path; const text = (issue as { message?: unknown }).message; const field = (Object.keys(empty) as CatalogProductField[]).find((key) => path === key || (typeof path === 'string' && path.endsWith(`.${key}`))); if (field && typeof text === 'string') next[field] = text; }
      setErrors(next); setError(Object.keys(next).length ? '' : caught instanceof Error ? caught.message : 'No se pudo guardar el producto.');
    } finally { setSaving(false); }
  }
  async function publish(product: OrganizationProduct) { if (!canEdit) return; setError(''); try { await productsApi.publish(product.id, org); setMessage(`«${product.name}» publicado.`); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo publicar el producto.'); } }
  async function archive(product: OrganizationProduct) { if (!canEdit || !window.confirm(`¿Archivar ${product.name}? Esto lo ocultará de nuevos catálogos y conservará sus asociaciones históricas.`)) return; try { await productsApi.archive(product.id, org); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo archivar el producto.'); } }
  async function adjust(product: OrganizationProduct, delta: number) { if (!canEdit || !Number.isInteger(delta) || delta === 0) return; try { const updated = await productsApi.adjustStock(product.id, org, delta); setItems((current) => current.map((item) => item.id === updated.id ? updated : item)); } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo ajustar el stock.'); } }
  async function addImage(url: string | null) { if (!url || !editing || editing === 'new') return; try { await productsApi.addImage(editing.id, org, url); const fresh = await productsApi.get(editing.id, org); setEditing(fresh); setItems((current) => current.map((item) => item.id === fresh.id ? fresh : item)); } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo agregar la imagen.'); } }
  async function removeImage(imageId: string) { if (!editing || editing === 'new') return; try { await productsApi.removeImage(editing.id, org, imageId); const fresh = await productsApi.get(editing.id, org); setEditing(fresh); setItems((current) => current.map((item) => item.id === fresh.id ? fresh : item)); } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo quitar la imagen.'); } }

  if (loading) return <main className="page"><div className="loading-state" aria-live="polite"><span className="loading-mark" />Cargando productos…</div></main>;
  return <main className="page products-page">
    <div className="page-heading"><div><p className="eyebrow">CONTENIDO COMERCIAL</p><h1>Productos</h1><p className="page-description">Administrá productos reutilizables y publicalos de forma independiente de cada catálogo.</p></div>{canEdit && <button type="button" onClick={() => open('new')}>Nuevo producto</button>}</div>
    {message && <p className="success" role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}
    {!items.length ? <div className="empty"><h2>Todavía no hay productos.</h2><p>Creá el primer producto para poder reutilizarlo en tus catálogos.</p></div> : <section className="products-list" aria-label="Productos de la organización">{items.map((product) => <article className={`product-row ${product.status === 'archived' ? 'is-archived' : ''}`} key={product.id}><div className="product-thumb">{product.mainAssetUrl ? <img src={product.mainAssetUrl} alt="" /> : <span>—</span>}</div><div className="product-main"><div className="product-title-line"><h2>{product.name}</h2><span className={`status status-${product.status}`}>{product.status === 'archived' ? 'Archivado' : product.hasUnpublishedChanges ? 'Cambios sin publicar' : product.published ? 'Publicado' : 'Borrador'}</span></div><p>{product.description || 'Sin descripción'}</p><small>{formatMoneyFromMinor(product.priceMinorUnits, product.currency)} · {product.stock} en stock · {product.usages.length ? `Usado en ${product.usages.length} catálogo${product.usages.length === 1 ? '' : 's'}` : 'Sin catálogos'}</small></div><div className="product-actions"><button type="button" className="button-quiet" disabled={!canEdit || product.status === 'archived'} onClick={() => open(product)}>Editar</button>{canEdit && product.status === 'active' && (!product.published || product.hasUnpublishedChanges) && <button type="button" className="button-quiet" onClick={() => void publish(product)}>{product.published ? 'Publicar cambios' : 'Publicar'}</button>}{canEdit && product.status === 'active' && <button type="button" className="button-quiet product-danger" onClick={() => void archive(product)}>Archivar</button>}<div className="stock-adjust"><span>Stock</span><button type="button" className="button-quiet" disabled={!canEdit || product.stock === 0 || product.status === 'archived'} onClick={() => void adjust(product, -1)} aria-label={`Quitar stock de ${product.name}`}>−</button><strong>{product.stock}</strong><button type="button" className="button-quiet" disabled={!canEdit || product.status === 'archived'} onClick={() => void adjust(product, 1)} aria-label={`Agregar stock a ${product.name}`}>+</button></div></div></article>)}</section>}
    <Dialog open={Boolean(editing)} title={editing === 'new' ? 'Nuevo producto' : 'Editar producto'} description="Los cambios se guardan como borrador. Publicá el producto cuando quieras actualizarlos en los catálogos publicados." onClose={() => { if (!saving) setEditing(null); }} initialFocusRef={nameRef}><form className="product-form" onSubmit={(event) => void save(event)} noValidate><label htmlFor="org-product-name">Nombre</label><input id="org-product-name" ref={nameRef} maxLength={CATALOG_PRODUCT_LIMITS.name} value={form.name} onChange={(event) => setField('name', event.target.value)} aria-invalid={Boolean(submitted && errors.name)} />{submitted && errors.name && <small className="field-error">{errors.name}</small>}<label htmlFor="org-product-description">Descripción</label><textarea id="org-product-description" maxLength={CATALOG_PRODUCT_LIMITS.description} value={form.description} onChange={(event) => setField('description', event.target.value)} />{submitted && errors.description && <small className="field-error">{errors.description}</small>}<div className="product-form-grid"><div><label htmlFor="org-product-price">Precio</label><input id="org-product-price" inputMode="decimal" value={priceInput} onChange={(event) => { setPriceInput(event.target.value); const price = parseMoneyToMinor(event.target.value); if (price !== null) setForm((current) => ({ ...current, priceMinorUnits: price })); }} /><small>Moneda: {form.currency}</small>{submitted && errors.priceMinorUnits && <small className="field-error">{errors.priceMinorUnits}</small>}</div><div><label htmlFor="org-product-stock">Stock</label><input id="org-product-stock" inputMode="numeric" value={stockInput} onChange={(event) => { setStockInput(event.target.value); if (/^\d+$/.test(event.target.value)) setForm((current) => ({ ...current, stock: Number(event.target.value) })); }} />{submitted && errors.stock && <small className="field-error">{errors.stock}</small>}</div></div><label>Imagen principal</label><AssetPicker org={org} value={form.mainAssetUrl} onChange={(value) => setField('mainAssetUrl', value)} categories={['image']} canUpload={canManageAssets} disabled={!canEdit || saving} label="Seleccionar imagen" />{editing && editing !== 'new' && <div className="product-gallery"><div className="product-gallery-heading"><strong>Galería</strong><AssetPicker org={org} value={null} onChange={(value) => void addImage(value)} categories={['image']} canUpload={canManageAssets} disabled={!canEdit || editing.gallery.length >= CATALOG_PRODUCT_LIMITS.galleryImages} label="Agregar imagen" /></div>{editing.gallery.length ? <div className="product-gallery-grid">{editing.gallery.map((image) => <div key={image.id}><img src={image.url} alt="" /><button type="button" className="button-quiet" onClick={() => void removeImage(image.id)}>Quitar</button></div>)}</div> : <small>Sin imágenes secundarias.</small>}</div>}<label htmlFor="org-product-cta-label">Texto del botón <span>(opcional)</span></label><input id="org-product-cta-label" maxLength={CATALOG_PRODUCT_LIMITS.ctaLabel} value={form.ctaLabel ?? ''} onChange={(event) => setField('ctaLabel', event.target.value || null)} /><label htmlFor="org-product-cta-url">Enlace <span>(opcional)</span></label><input id="org-product-cta-url" inputMode="url" maxLength={CATALOG_PRODUCT_LIMITS.ctaUrl} value={form.ctaUrl ?? ''} onChange={(event) => setField('ctaUrl', event.target.value || null)} />{submitted && errors.ctaUrl && <small className="field-error">{errors.ctaUrl}</small>}{error && <p className="error" role="alert">{error}</p>}<div className="dialog-actions"><button type="button" className="secondary" onClick={() => setEditing(null)}>Cancelar</button><button type="submit" disabled={saving || !canEdit}>{saving ? 'Guardando…' : 'Guardar borrador'}</button></div></form></Dialog>
  </main>;
}
