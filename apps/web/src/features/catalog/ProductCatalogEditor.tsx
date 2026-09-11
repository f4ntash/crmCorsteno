import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { parseMoneyToMinor, formatMoneyFromMinor } from '@corsteno/types';
import { AssetPicker } from '../assets/AssetPicker';
import { ConfigEditor } from '../../shared/config/ConfigEditor';
import type { ConfigSectionDefinition } from '../../shared/config/sections';
import { experiencesApi, type CatalogProduct } from '../experiences/api';
import './catalog.css';

type Props = { org: string; id: string; canEdit: boolean; canManageAssets?: boolean; onDirtyChange?: (dirty: boolean) => void; onUnpublishedChange?: (dirty: boolean) => void; onDraftSaved?: (draft: unknown) => void };
type CatalogConfig = { schemaVersion: 1; title?: string; intro?: string };
type ProductForm = Omit<CatalogProduct, 'id' | 'organizationId' | 'experienceId' | 'sortOrder' | 'gallery' | 'createdAt' | 'updatedAt'>;
const sections: ConfigSectionDefinition[] = [{ id: 'catalog', title: 'Presentación del catálogo', description: 'Este contenido aparece encima de los productos publicados.', fields: [{ key: 'title', type: 'text', label: 'Título', maxLength: 120, placeholder: 'Catálogo de productos' }, { key: 'intro', type: 'textarea', label: 'Introducción', maxLength: 500, placeholder: 'Conocé nuestros productos.' }] }];
const emptyProduct: ProductForm = { name: '', description: '', priceMinorUnits: 0, currency: 'ARS', stock: 0, visible: true, mainAssetUrl: null, ctaLabel: null, ctaUrl: null };

function configValues(value: unknown): CatalogConfig { const item = value && typeof value === 'object' && !Array.isArray(value) ? value as Partial<CatalogConfig> : {}; return { schemaVersion: 1, title: typeof item.title === 'string' ? item.title : 'Catálogo de productos', intro: typeof item.intro === 'string' ? item.intro : '' }; }
function priceValue(product: ProductForm) { return (product.priceMinorUnits / 100).toFixed(2).replace('.', ','); }

export function ProductCatalogEditor({ org, id, canEdit, canManageAssets = false, onDirtyChange, onUnpublishedChange, onDraftSaved }: Props) {
  const [draft, setDraft] = useState<CatalogConfig>(configValues(undefined));
  const [initial, setInitial] = useState<CatalogConfig>(configValues(undefined));
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyProduct);
  const [priceInput, setPriceInput] = useState('0');
  const [productSaving, setProductSaving] = useState(false);
  const [productError, setProductError] = useState('');
  const [gallerySaving, setGallerySaving] = useState(false);
  const [galleryError, setGalleryError] = useState('');
  const [reorderingProducts, setReorderingProducts] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  async function load() {
    setLoading(true); setError('');
    try {
      const [experience, catalog] = await Promise.all([experiencesApi.get(id, org), experiencesApi.catalogProducts(id, org)]);
      const next = configValues(experience.draftConfig); setDraft(next); setInitial(next); setProducts(catalog.items); onUnpublishedChange?.(catalog.hasUnpublishedChanges);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo cargar el catálogo.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [id, org]);
  const productCountLabel = useMemo(() => `${products.length} ${products.length === 1 ? 'producto' : 'productos'}`, [products.length]);
  async function saveConfig() {
    if (!dirty || saving || !canEdit) return false;
    setSaving(true); setSaveError(''); setSaveMessage('');
    try { const saved = await experiencesApi.update(id, org, { draft_config: draft }) as { draftConfig?: unknown }; setInitial(draft); setSaveMessage('Presentación guardada.'); onDraftSaved?.(saved.draftConfig ?? draft); return true; }
    catch (caught) { setSaveError(caught instanceof Error ? caught.message : 'No se pudo guardar.'); return false; }
    finally { setSaving(false); }
  }
  function editProduct(product: CatalogProduct) { setEditing(product.id); setForm({ name: product.name, description: product.description, priceMinorUnits: product.priceMinorUnits, currency: product.currency, stock: product.stock, visible: product.visible, mainAssetUrl: product.mainAssetUrl, ctaLabel: product.ctaLabel, ctaUrl: product.ctaUrl }); setPriceInput(priceValue(product)); setProductError(''); setGalleryError(''); }
  function newProduct() { setEditing('new'); setForm({ ...emptyProduct }); setPriceInput('0'); setProductError(''); setGalleryError(''); }
  async function saveProduct(event: FormEvent) {
    event.preventDefault(); if (productSaving || !canEdit) return;
    const parsedPrice = parseMoneyToMinor(priceInput);
    if (parsedPrice === null) { setProductError('Ingresá un precio válido con hasta dos decimales.'); return; }
    setProductSaving(true); setProductError('');
    const value = { ...form, priceMinorUnits: parsedPrice };
    try { if (editing === 'new') await experiencesApi.createCatalogProduct(id, org, value); else if (editing) await experiencesApi.updateCatalogProduct(id, org, editing, value); setEditing(null); onUnpublishedChange?.(true); await load(); }
    catch (caught) { setProductError(caught instanceof Error ? caught.message : 'No se pudo guardar el producto.'); }
    finally { setProductSaving(false); }
  }
  async function reorderProducts(productId: string, direction: -1 | 1) {
    if (!canEdit || reorderingProducts) return;
    const index = products.findIndex((product) => product.id === productId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= products.length) return;
    const productIds = products.map((product) => product.id);
    [productIds[index], productIds[nextIndex]] = [productIds[nextIndex]!, productIds[index]!];
    setReorderingProducts(true); setError('');
    try { const result = await experiencesApi.reorderCatalogProducts(id, org, productIds); setProducts(result.items); onUnpublishedChange?.(true); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo cambiar el orden.'); }
    finally { setReorderingProducts(false); }
  }
  const currentGallery = editing && editing !== 'new' ? products.find((product) => product.id === editing)?.gallery ?? [] : [];
  async function addGalleryImage(url: string | null) {
    if (!url || !editing || editing === 'new' || gallerySaving || !canEdit) return;
    setGallerySaving(true); setGalleryError('');
    try { await experiencesApi.addCatalogProductImage(id, org, editing, url); onUnpublishedChange?.(true); await load(); }
    catch (caught) { setGalleryError(caught instanceof Error ? caught.message : 'No se pudo agregar la imagen.'); }
    finally { setGallerySaving(false); }
  }
  async function removeGalleryImage(imageId: string) {
    if (!editing || editing === 'new' || gallerySaving || !canEdit) return;
    setGallerySaving(true); setGalleryError('');
    try { await experiencesApi.removeCatalogProductImage(id, org, editing, imageId); onUnpublishedChange?.(true); await load(); }
    catch (caught) { setGalleryError(caught instanceof Error ? caught.message : 'No se pudo quitar la imagen.'); }
    finally { setGallerySaving(false); }
  }
  async function reorderGalleryImage(imageId: string, direction: -1 | 1) {
    if (!editing || editing === 'new' || gallerySaving) return;
    const index = currentGallery.findIndex((image) => image.id === imageId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= currentGallery.length) return;
    const imageIds = currentGallery.map((image) => image.id);
    [imageIds[index], imageIds[nextIndex]] = [imageIds[nextIndex]!, imageIds[index]!];
    setGallerySaving(true); setGalleryError('');
    try { await experiencesApi.reorderCatalogProductImages(id, org, editing, imageIds); onUnpublishedChange?.(true); await load(); }
    catch (caught) { setGalleryError(caught instanceof Error ? caught.message : 'No se pudo cambiar el orden de imágenes.'); }
    finally { setGallerySaving(false); }
  }
  async function archive(product: CatalogProduct) { if (!canEdit || !window.confirm(`¿Archivar ${product.name}?`)) return; try { await experiencesApi.archiveCatalogProduct(id, org, product.id); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo archivar el producto.'); } }
  function setField<K extends keyof ProductForm>(key: K, value: ProductForm[K]) { setForm((current) => ({ ...current, [key]: value })); }
  if (loading) return <div className="loading-state" aria-live="polite"><span className="loading-mark" />Cargando catálogo…</div>;
  return <div className="catalog-editor">
    {error && <p className="error" role="alert">{error}</p>}
    <ConfigEditor sections={sections} initialValues={initial as unknown as Record<string, unknown>} values={draft as unknown as Record<string, unknown>} onChange={(key, value) => setDraft((current) => ({ ...current, [key]: value }))} onSave={saveConfig} saving={saving} readOnly={!canEdit} saveLabel="Guardar presentación" saveMessage={saveMessage} saveError={saveError} onDirtyChange={onDirtyChange} />
    <section className="catalog-products-section" aria-labelledby="catalog-products-heading"><div className="catalog-products-heading"><div><p className="eyebrow">PRODUCTOS</p><h2 id="catalog-products-heading">Catálogo <small>{productCountLabel}</small></h2><p className="field-help">El orden guardado es el orden público. Los cambios quedan en borrador hasta publicar.</p></div>{canEdit && <button type="button" onClick={newProduct}>Agregar producto</button>}</div>{products.length === 0 ? <div className="empty catalog-empty"><h3>Todavía no hay productos.</h3><p>Agregá al menos un producto visible para poder publicar el catálogo.</p></div> : <div className="catalog-product-list">{products.map((product, index) => <article className={`catalog-product-row${product.visible ? '' : ' is-hidden'}`} key={product.id}><div className="catalog-product-thumb">{product.mainAssetUrl ? <img src={product.mainAssetUrl} alt="" /> : <span>—</span>}</div><div className="catalog-product-info"><h3>{product.name}</h3><p>{product.description || 'Sin descripción'}</p></div><div className="catalog-product-meta"><strong>{formatMoneyFromMinor(product.priceMinorUnits, product.currency)}</strong><span>{product.stock} en stock · {product.visible ? 'Visible' : 'Oculto'} · {product.gallery.length} {product.gallery.length === 1 ? 'imagen' : 'imágenes'} secundarias</span></div><div className="catalog-product-actions"><div className="catalog-order-actions"><button type="button" className="button-quiet" disabled={!canEdit || reorderingProducts || index === 0} onClick={() => void reorderProducts(product.id, -1)}>Subir</button><button type="button" className="button-quiet" disabled={!canEdit || reorderingProducts || index === products.length - 1} onClick={() => void reorderProducts(product.id, 1)}>Bajar</button></div><button type="button" className="secondary" disabled={!canEdit} onClick={() => editProduct(product)}>Editar</button>{canEdit && <button type="button" className="button-quiet" onClick={() => void archive(product)}>Archivar</button>}</div></article>)}</div>}</section>
    {editing && <div className="catalog-product-dialog" role="dialog" aria-modal="true" aria-labelledby="catalog-product-form-heading"><form className="card" onSubmit={(event) => void saveProduct(event)}><h2 id="catalog-product-form-heading">{editing === 'new' ? 'Nuevo producto' : 'Editar producto'}</h2><label>Nombre<input required maxLength={120} value={form.name} onChange={(event) => setField('name', event.target.value)} /></label><label>Descripción<textarea maxLength={1000} value={form.description} onChange={(event) => setField('description', event.target.value)} /></label><div className="catalog-form-grid"><label>Precio<input inputMode="decimal" required value={priceInput} onChange={(event) => { setPriceInput(event.target.value); const parsed = parseMoneyToMinor(event.target.value); if (parsed !== null) setField('priceMinorUnits', parsed); }} /><small>Se guarda en unidades menores. Moneda: {form.currency}</small></label><label>Stock<input type="number" min="0" max="1000000000" step="1" required value={form.stock} onChange={(event) => setField('stock', Math.max(0, Number(event.target.value) || 0))} /></label></div><label className="catalog-checkbox"><input type="checkbox" checked={form.visible} onChange={(event) => setField('visible', event.target.checked)} />Visible en el catálogo público</label><label>Imagen principal<AssetPicker org={org} value={form.mainAssetUrl} onChange={(value) => setField('mainAssetUrl', value)} categories={['image']} canUpload={canManageAssets} disabled={!canEdit} label="Seleccionar imagen" /></label>{editing === 'new' ? <p className="field-help">Guardá el producto para poder agregar imágenes secundarias.</p> : <section className="catalog-gallery-section" aria-labelledby="catalog-gallery-heading"><div className="catalog-gallery-heading"><div><h3 id="catalog-gallery-heading">Imágenes secundarias</h3><p className="field-help">Hasta 6 imágenes. La imagen principal se mantiene separada.</p></div><AssetPicker org={org} value={null} onChange={(value) => void addGalleryImage(value)} categories={['image']} canUpload={canManageAssets} disabled={!canEdit || gallerySaving} label={gallerySaving ? 'Guardando…' : 'Agregar imagen'} /></div>{galleryError && <p className="error" role="alert">{galleryError}</p>}{currentGallery.length ? <div className="catalog-gallery-list">{currentGallery.map((image, index) => <div className="catalog-gallery-item" key={image.id}><img src={image.url} alt={`Imagen secundaria ${index + 1}`} /><div><span>Imagen {index + 1}</span><div className="catalog-gallery-actions"><button type="button" className="button-quiet" disabled={gallerySaving || index === 0} onClick={() => void reorderGalleryImage(image.id, -1)}>Subir</button><button type="button" className="button-quiet" disabled={gallerySaving || index === currentGallery.length - 1} onClick={() => void reorderGalleryImage(image.id, 1)}>Bajar</button><button type="button" className="button-quiet" disabled={gallerySaving} onClick={() => void removeGalleryImage(image.id)}>Quitar</button></div></div></div>)}</div> : <p className="field-help">Todavía no hay imágenes secundarias.</p>}</section>}<div className="catalog-form-grid"><label>Texto del botón<input maxLength={80} value={form.ctaLabel ?? ''} onChange={(event) => setField('ctaLabel', event.target.value || null)} placeholder="Consultar" /></label><label>Enlace o WhatsApp<input type="url" maxLength={2048} value={form.ctaUrl ?? ''} onChange={(event) => setField('ctaUrl', event.target.value || null)} placeholder="https://wa.me/…" /></label></div>{productError && <p className="error" role="alert">{productError}</p>}<div className="dialog-actions"><button type="button" className="secondary" onClick={() => setEditing(null)}>Cancelar</button><button disabled={productSaving}>{productSaving ? 'Guardando…' : 'Guardar producto'}</button></div></form></div>}
  </div>;
}
