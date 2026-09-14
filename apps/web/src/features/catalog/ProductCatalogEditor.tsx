import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  CATALOG_PRODUCT_LIMITS,
  catalogProductFieldErrors,
  formatMoneyFromMinor,
  parseMoneyToMinor,
  catalogPhoneFromCtaUrl,
  type CatalogCtaType,
  type CatalogProductField,
} from '@corsteno/types';
import { AssetPicker } from '../assets/AssetPicker';
import { ConfigEditor } from '../../shared/config/ConfigEditor';
import { Dialog } from '../../shared/ui/Dialog';
import type { ConfigSectionDefinition } from '../../shared/config/sections';
import { ApiError } from '../../shared/api/client';
import { experiencesApi, productsApi, type CatalogProduct, type OrganizationProduct } from '../experiences/api';
import './catalog.css';

type Props = {
  org: string;
  id: string;
  canEdit: boolean;
  canManageAssets?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onUnpublishedChange?: (dirty: boolean) => void;
  onDraftSaved?: (draft: unknown) => void;
};
type CatalogConfig = { schemaVersion: 1; title?: string; intro?: string };
type ProductForm = Omit<
  CatalogProduct,
  | 'id'
  | 'organizationId'
  | 'experienceId'
  | 'sortOrder'
  | 'gallery'
  | 'createdAt'
  | 'updatedAt'
>;
type ProductErrors = Partial<Record<CatalogProductField, string>>;

const sections: ConfigSectionDefinition[] = [
  {
    id: 'catalog',
    title: 'Presentación del catálogo',
    description: 'Este contenido aparece encima de los productos publicados.',
    fields: [
      {
        key: 'title',
        type: 'text',
        label: 'Título',
        maxLength: 120,
        placeholder: 'Catálogo de productos',
      },
      {
        key: 'intro',
        type: 'textarea',
        label: 'Introducción',
        maxLength: 500,
        placeholder: 'Conocé nuestros productos.',
      },
    ],
  },
];
const emptyProduct: ProductForm = {
  name: '',
  description: '',
  priceMinorUnits: 0,
  currency: 'ARS',
  stock: 0,
  visible: true,
  mainAssetUrl: null,
  ctaLabel: null,
  ctaUrl: null,
};
const fieldIds: Record<string, string> = {
  name: 'catalog-product-name',
  description: 'catalog-product-description',
  priceMinorUnits: 'catalog-product-price',
  stock: 'catalog-product-stock',
  ctaLabel: 'catalog-product-cta-label',
  ctaUrl: 'catalog-product-cta-url',
};

function configValues(value: unknown): CatalogConfig {
  const item =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Partial<CatalogConfig>)
      : {};
  return {
    schemaVersion: 1,
    title:
      typeof item.title === 'string' ? item.title : 'Catálogo de productos',
    intro: typeof item.intro === 'string' ? item.intro : '',
  };
}
function priceValue(product: ProductForm) {
  return (product.priceMinorUnits / 100).toFixed(2).replace('.', ',');
}
function isMoneyEntry(value: string) {
  return value === '' || /^(?:0|[1-9]\d*)(?:[,.]\d{0,2})?$/.test(value);
}
function isIntegerEntry(value: string) {
  return value === '' || /^\d+$/.test(value);
}
function validationValues(
  form: ProductForm,
  priceInput: string,
  stockInput: string,
): Record<string, unknown> {
  return {
    ...form,
    priceMinorUnits: parseMoneyToMinor(priceInput) ?? priceInput,
    stock: /^\d+$/.test(stockInput) ? Number(stockInput) : stockInput,
  };
}
function errorId(field: string) {
  return `${fieldIds[field] ?? `catalog-product-${field}`}-error`;
}

export function ProductCatalogEditor({
  org,
  id,
  canEdit,
  canManageAssets = false,
  onDirtyChange,
  onUnpublishedChange,
  onDraftSaved,
}: Props) {
  const [draft, setDraft] = useState<CatalogConfig>(configValues(undefined));
  const [initial, setInitial] = useState<CatalogConfig>(
    configValues(undefined),
  );
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [availableProducts, setAvailableProducts] = useState<OrganizationProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyProduct);
  const [ctaType, setCtaType] = useState<CatalogCtaType>('url');
  const [priceInput, setPriceInput] = useState('0');
  const [stockInput, setStockInput] = useState('0');
  const [productSaving, setProductSaving] = useState(false);
  const [productError, setProductError] = useState('');
  const [productErrors, setProductErrors] = useState<ProductErrors>({});
  const [touched, setTouched] = useState<
    Partial<Record<CatalogProductField, boolean>>
  >({});
  const [submitted, setSubmitted] = useState(false);
  const [gallerySaving, setGallerySaving] = useState(false);
  const [galleryError, setGalleryError] = useState('');
  const [reorderingProducts, setReorderingProducts] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [experience, catalog] = await Promise.all([
        experiencesApi.get(id, org),
        experiencesApi.catalogProducts(id, org),
      ]);
      const next = configValues(experience.draftConfig);
      setDraft(next);
      setInitial(next);
      setProducts(catalog.items);
      try {
        const organizationProducts = (await productsApi.list(org, false)).items;
        setAvailableProducts(organizationProducts.filter((product) => !product.usages.some((usage) => usage.experienceId === id)));
      } catch {
        setAvailableProducts([]);
      }
      onUnpublishedChange?.(catalog.hasUnpublishedChanges);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'No se pudo cargar el catálogo.',
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [id, org]);
  const productCountLabel = useMemo(
    () =>
      `${products.length} ${products.length === 1 ? 'producto' : 'productos'}`,
    [products.length],
  );

  async function saveConfig() {
    if (!dirty || saving || !canEdit) return false;
    setSaving(true);
    setSaveError('');
    setSaveMessage('');
    try {
      const saved = (await experiencesApi.update(id, org, {
        draft_config: draft,
      })) as { draftConfig?: unknown };
      setInitial(draft);
      setSaveMessage('Presentación guardada.');
      onDraftSaved?.(saved.draftConfig ?? draft);
      return true;
    } catch (caught) {
      setSaveError(
        caught instanceof Error ? caught.message : 'No se pudo guardar.',
      );
      return false;
    } finally {
      setSaving(false);
    }
  }

  function resetProductFeedback() {
    setProductError('');
    setProductErrors({});
    setTouched({});
    setSubmitted(false);
    setGalleryError('');
  }
  function editProduct(product: CatalogProduct) {
    setEditing(product.id);
    setForm({
      name: product.name,
      description: product.description,
      priceMinorUnits: product.priceMinorUnits,
      currency: product.currency,
      stock: product.stock,
      visible: product.visible,
      mainAssetUrl: product.mainAssetUrl,
      ctaLabel: product.ctaLabel,
      ctaUrl: catalogPhoneFromCtaUrl(product.ctaUrl) ?? product.ctaUrl,
    });
    setCtaType(catalogPhoneFromCtaUrl(product.ctaUrl) ? 'whatsapp' : 'url');
    setPriceInput(priceValue(product));
    setStockInput(String(product.stock));
    resetProductFeedback();
  }
  function newProduct() {
    setEditing('new');
    setForm({ ...emptyProduct });
    setCtaType('url');
    setPriceInput('0');
    setStockInput('0');
    resetProductFeedback();
  }
  function currentValidation(
    nextForm = form,
    nextPrice = priceInput,
    nextStock = stockInput,
  ) {
    return catalogProductFieldErrors(
      validationValues(nextForm, nextPrice, nextStock),
      ctaType,
    );
  }
  function changeCtaType(nextType: CatalogCtaType) {
    setCtaType(nextType);
    setProductErrors((current) => ({ ...current, ctaUrl: undefined }));
    if (submitted || touched.ctaUrl) {
      const nextErrors = catalogProductFieldErrors(validationValues(form, priceInput, stockInput), nextType);
      setProductErrors(nextErrors);
    }
  }
  function focusFirstError(errors: ProductErrors) {
    const firstField = Object.keys(fieldIds).find(
      (field) => errors[field as CatalogProductField],
    );
    if (!firstField) return;
    window.requestAnimationFrame(() => {
      const element = document.getElementById(fieldIds[firstField]!);
      element?.focus();
      element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }
  function updateErrors(
    nextForm: ProductForm,
    nextPrice = priceInput,
    nextStock = stockInput,
  ) {
    const nextErrors = currentValidation(nextForm, nextPrice, nextStock);
    setProductErrors(nextErrors);
    return nextErrors;
  }
  function setField<K extends keyof ProductForm>(
    key: K,
    value: ProductForm[K],
  ) {
    const nextForm = { ...form, [key]: value } as ProductForm;
    setForm(nextForm);
    if (submitted || touched[key as CatalogProductField])
      updateErrors(nextForm);
  }
  function setPriceValue(value: string) {
    setPriceInput(value);
    const parsed = parseMoneyToMinor(value);
    const nextForm =
      parsed === null ? form : { ...form, priceMinorUnits: parsed };
    if (parsed !== null) setForm(nextForm);
    if (submitted || touched.priceMinorUnits) updateErrors(nextForm, value);
  }
  function setStockValue(value: string) {
    setStockInput(value);
    const nextForm = /^\d+$/.test(value)
      ? { ...form, stock: Number(value) }
      : form;
    if (/^\d+$/.test(value)) setForm(nextForm);
    if (submitted || touched.stock) updateErrors(nextForm, priceInput, value);
  }
  function touchField(field: CatalogProductField) {
    setTouched((current) => ({ ...current, [field]: true }));
    updateErrors(form);
  }
  function displayedError(field: CatalogProductField) {
    return submitted || touched[field] ? productErrors[field] : undefined;
  }
  function handleMoneyKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.ctrlKey || event.metaKey || event.key.length !== 1) return;
    if (!/[0-9.,]/.test(event.key)) event.preventDefault();
  }
  function handleIntegerKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.ctrlKey || event.metaKey || event.key.length !== 1) return;
    if (!/[0-9]/.test(event.key)) event.preventDefault();
  }
  function handleMoneyPaste(event: ClipboardEvent<HTMLInputElement>) {
    if (!isMoneyEntry(event.clipboardData.getData('text').trim())) {
      event.preventDefault();
      setTouched((current) => ({ ...current, priceMinorUnits: true }));
    }
  }
  function handleIntegerPaste(event: ClipboardEvent<HTMLInputElement>) {
    if (!isIntegerEntry(event.clipboardData.getData('text').trim())) {
      event.preventDefault();
      setTouched((current) => ({ ...current, stock: true }));
    }
  }
  function apiFieldErrors(details: unknown): ProductErrors {
    if (!Array.isArray(details)) return {};
    const mapped: ProductErrors = {};
    for (const item of details) {
      if (!item || typeof item !== 'object') continue;
      const path =
        typeof (item as { path?: unknown }).path === 'string'
          ? (item as { path: string }).path
          : '';
      const field = (Object.keys(fieldIds) as CatalogProductField[]).find(
        (key) => path === key || path.endsWith(`.${key}`),
      );
      const message =
        typeof (item as { message?: unknown }).message === 'string'
          ? (item as { message: string }).message
          : '';
      if (field && message) mapped[field] = message;
    }
    return mapped;
  }
  async function saveProduct(event: FormEvent) {
    event.preventDefault();
    if (productSaving || !canEdit) return;
    setSubmitted(true);
    const validationErrors = updateErrors(form);
    if (Object.keys(validationErrors).length) {
      focusFirstError(validationErrors);
      return;
    }
    const parsedPrice = parseMoneyToMinor(priceInput);
    if (parsedPrice === null || !/^\d+$/.test(stockInput)) return;
    setProductSaving(true);
    setProductError('');
    const value = {
      ...form,
      priceMinorUnits: parsedPrice,
      stock: Number(stockInput),
    };
    try {
      const isNew = editing === 'new';
      const existing = !isNew && editing ? products.find((product) => product.id === editing) : undefined;
      if (editing === 'new')
        await experiencesApi.createCatalogProduct(id, org, value);
      else if (editing)
        await experiencesApi.updateCatalogProduct(id, org, editing, value);
      setEditing(null);
      // Canonical product content has its own publication lifecycle. Only a
      // new association, a visibility change, or a legacy catalog mutation
      // makes the catalog structure itself unpublished.
      const canonical = existing && existing.published !== undefined;
      onUnpublishedChange?.(isNew || !canonical || existing?.visible !== form.visible);
      await load();
    } catch (caught) {
      const mapped = apiFieldErrors(
        caught instanceof ApiError ? caught.details : undefined,
      );
      setProductErrors(mapped);
      setSubmitted(true);
      focusFirstError(mapped);
      setProductError(
        Object.keys(mapped).length
          ? ''
          : caught instanceof Error
            ? caught.message
            : 'No se pudo guardar el producto.',
      );
    } finally {
      setProductSaving(false);
    }
  }
  async function reorderProducts(productId: string, direction: -1 | 1) {
    if (!canEdit || reorderingProducts) return;
    const index = products.findIndex((product) => product.id === productId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= products.length) return;
    const productIds = products.map((product) => product.id);
    [productIds[index], productIds[nextIndex]] = [
      productIds[nextIndex]!,
      productIds[index]!,
    ];
    setReorderingProducts(true);
    setError('');
    try {
      const result = await experiencesApi.reorderCatalogProducts(
        id,
        org,
        productIds,
      );
      setProducts(result.items);
      onUnpublishedChange?.(!(editing && products.find((product) => product.id === editing)?.published !== undefined));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'No se pudo cambiar el orden.',
      );
    } finally {
      setReorderingProducts(false);
    }
  }
  const currentGallery =
    editing && editing !== 'new'
      ? (products.find((product) => product.id === editing)?.gallery ?? [])
      : [];
  async function addGalleryImage(url: string | null) {
    if (!url || !editing || editing === 'new' || gallerySaving || !canEdit)
      return;
    setGallerySaving(true);
    setGalleryError('');
    try {
      await experiencesApi.addCatalogProductImage(id, org, editing, url);
      onUnpublishedChange?.(!(editing && products.find((product) => product.id === editing)?.published !== undefined));
      await load();
    } catch (caught) {
      setGalleryError(
        caught instanceof Error
          ? caught.message
          : 'No se pudo agregar la imagen.',
      );
    } finally {
      setGallerySaving(false);
    }
  }
  async function removeGalleryImage(imageId: string) {
    if (!editing || editing === 'new' || gallerySaving || !canEdit) return;
    setGallerySaving(true);
    setGalleryError('');
    try {
      await experiencesApi.removeCatalogProductImage(id, org, editing, imageId);
      onUnpublishedChange?.(!(editing && products.find((product) => product.id === editing)?.published !== undefined));
      await load();
    } catch (caught) {
      setGalleryError(
        caught instanceof Error
          ? caught.message
          : 'No se pudo quitar la imagen.',
      );
    } finally {
      setGallerySaving(false);
    }
  }
  async function reorderGalleryImage(imageId: string, direction: -1 | 1) {
    if (!editing || editing === 'new' || gallerySaving || !canEdit) return;
    const index = currentGallery.findIndex((image) => image.id === imageId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= currentGallery.length)
      return;
    const imageIds = currentGallery.map((image) => image.id);
    [imageIds[index], imageIds[nextIndex]] = [
      imageIds[nextIndex]!,
      imageIds[index]!,
    ];
    setGallerySaving(true);
    setGalleryError('');
    try {
      await experiencesApi.reorderCatalogProductImages(
        id,
        org,
        editing,
        imageIds,
      );
      onUnpublishedChange?.(!(editing && products.find((product) => product.id === editing)?.published !== undefined));
      await load();
    } catch (caught) {
      setGalleryError(
        caught instanceof Error
          ? caught.message
          : 'No se pudo cambiar el orden de imágenes.',
      );
    } finally {
      setGallerySaving(false);
    }
  }
  async function archive(product: CatalogProduct) {
    if (!canEdit || product.status === 'archived' || !window.confirm(`¿Archivar ${product.name}? Esto archivará el producto para toda la organización y conservará sus asociaciones históricas.`)) return;
    try {
      await experiencesApi.archiveCatalogProduct(id, org, product.id);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'No se pudo archivar el producto.',
      );
    }
  }
  async function linkExistingProduct() {
    if (!selectedProductId || !canEdit || productSaving) return;
    setProductSaving(true); setError('');
    try {
      await experiencesApi.createCatalogProduct(id, org, { productId: selectedProductId, visible: true });
      setSelectedProductId('');
      onUnpublishedChange?.(true);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo agregar el producto al catálogo.');
    } finally { setProductSaving(false); }
  }

  if (loading)
    return (
      <div className="loading-state" aria-live="polite">
        <span className="loading-mark" />
        Cargando catálogo…
      </div>
    );
  return (
    <div className="catalog-editor">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <ConfigEditor
        sections={sections}
        initialValues={initial as unknown as Record<string, unknown>}
        values={draft as unknown as Record<string, unknown>}
        onChange={(key, value) =>
          setDraft((current) => ({ ...current, [key]: value }))
        }
        onSave={saveConfig}
        saving={saving}
        readOnly={!canEdit}
        saveLabel="Guardar presentación"
        saveMessage={saveMessage}
        saveError={saveError}
        onDirtyChange={onDirtyChange}
      />
      <section
        className="catalog-products-section"
        aria-labelledby="catalog-products-heading"
      >
        <div className="catalog-products-heading">
          <div>
            <p className="eyebrow">PRODUCTOS</p>
            <h2 id="catalog-products-heading">
              Catálogo <small>{productCountLabel}</small>
            </h2>
            <p className="field-help">
              El orden guardado es el orden público. Los cambios quedan en
              borrador hasta publicar.
            </p>
          </div>
          {canEdit && <div className="catalog-add-actions"><button type="button" onClick={newProduct}>Crear producto</button>{availableProducts.length > 0 && <div className="catalog-link-existing"><select aria-label="Producto existente" value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)}><option value="">Agregar existente…</option>{availableProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select><button type="button" className="secondary" disabled={!selectedProductId || productSaving} onClick={() => void linkExistingProduct()}>Agregar</button></div>}</div>}
        </div>
        {products.length === 0 ? (
          <div className="empty catalog-empty">
            <h3>Todavía no hay productos.</h3>
            <p>
              Agregá al menos un producto visible para poder publicar el
              catálogo.
            </p>
          </div>
        ) : (
          <div className="catalog-product-list">
            {products.map((product, index) => (
              <article
                className={`catalog-product-row${product.visible ? '' : ' is-hidden'}${product.status === 'archived' ? ' is-archived' : ''}`}
                key={product.id}
              >
                <div className="catalog-product-thumb">
                  {product.mainAssetUrl ? (
                    <img src={product.mainAssetUrl} alt="" />
                  ) : (
                    <span>—</span>
                  )}
                </div>
                <div className="catalog-product-info">
                  <h3>{product.name}</h3>
                  <p>{product.description || 'Sin descripción'}</p>
                </div>
                <div className="catalog-product-meta">
                  <strong>
                    {formatMoneyFromMinor(
                      product.priceMinorUnits,
                      product.currency,
                    )}
                  </strong>
                  <span>
                    {product.stock} en stock ·{' '}
                    {product.visible ? 'Visible' : 'Oculto'} ·{' '}
                    {product.gallery.length}{' '}
                    {product.gallery.length === 1 ? 'imagen' : 'imágenes'}{' '}
                    secundarias ·{' '}
                    {product.status === 'archived'
                      ? 'Archivado globalmente'
                      : product.hasUnpublishedChanges
                      ? 'Cambios sin publicar'
                      : product.published
                        ? 'Publicado'
                        : 'Borrador de producto'}
                  </span>
                </div>
                <div className="catalog-product-actions">
                  <div className="catalog-order-actions">
                    <button
                      type="button"
                      className="button-quiet"
                      disabled={!canEdit || product.status === 'archived' || reorderingProducts || index === 0}
                      onClick={() => void reorderProducts(product.id, -1)}
                    >
                      Subir
                    </button>
                    <button
                      type="button"
                      className="button-quiet"
                      disabled={
                        !canEdit || product.status === 'archived' ||
                        reorderingProducts ||
                        index === products.length - 1
                      }
                      onClick={() => void reorderProducts(product.id, 1)}
                    >
                      Bajar
                    </button>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    disabled={!canEdit || product.status === 'archived'}
                    onClick={() => editProduct(product)}
                  >
                    Editar
                  </button>
                  {canEdit && product.status !== 'archived' && (
                    <button
                      type="button"
                      className="button-quiet catalog-danger-action"
                      onClick={() => void archive(product)}
                    >
                      Archivar
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <Dialog
        open={Boolean(editing)}
        title={editing === 'new' ? 'Nuevo producto' : 'Editar producto'}
        description={
          editing === 'new'
            ? 'Completá la información comercial para publicar este producto.'
            : 'Actualizá la información sin salir del catálogo.'
        }
        onClose={() => {
          if (!productSaving) setEditing(null);
        }}
        initialFocusRef={nameRef}
      >
        <form
          className="catalog-product-form"
          noValidate
          onSubmit={(event) => void saveProduct(event)}
        >
          <section
            className="catalog-form-section"
            aria-labelledby="catalog-product-information-heading"
          >
            <div className="catalog-form-section-heading">
              <h3 id="catalog-product-information-heading">Información</h3>
              <p>Los datos que verá una persona al recorrer el catálogo.</p>
            </div>
            <div className="catalog-form-field">
              <label htmlFor={fieldIds.name}>
                Nombre <span className="catalog-required">Requerido</span>
              </label>
              <input
                id={fieldIds.name}
                ref={nameRef}
                maxLength={CATALOG_PRODUCT_LIMITS.name}
                value={form.name}
                onChange={(event) => setField('name', event.target.value)}
                onBlur={() => touchField('name')}
                aria-invalid={Boolean(displayedError('name'))}
                aria-describedby={
                  displayedError('name') ? errorId('name') : undefined
                }
              />
              {displayedError('name') && (
                <p
                  id={errorId('name')}
                  className="catalog-field-error"
                  role="alert"
                >
                  {displayedError('name')}
                </p>
              )}
            </div>
            <div className="catalog-form-field">
              <label htmlFor={fieldIds.description}>
                Descripción <span className="catalog-optional">Opcional</span>
              </label>
              <textarea
                id={fieldIds.description}
                maxLength={CATALOG_PRODUCT_LIMITS.description}
                value={form.description}
                onChange={(event) =>
                  setField('description', event.target.value)
                }
                onBlur={() => touchField('description')}
                aria-invalid={Boolean(displayedError('description'))}
                aria-describedby={
                  displayedError('description')
                    ? errorId('description')
                    : undefined
                }
              />
              <div className="catalog-field-meta">
                <small>
                  Hasta {CATALOG_PRODUCT_LIMITS.description} caracteres.
                </small>
                <small>
                  {form.description.length}/{CATALOG_PRODUCT_LIMITS.description}
                </small>
              </div>
              {displayedError('description') && (
                <p
                  id={errorId('description')}
                  className="catalog-field-error"
                  role="alert"
                >
                  {displayedError('description')}
                </p>
              )}
            </div>
          </section>
          <section
            className="catalog-form-section"
            aria-labelledby="catalog-product-commercial-heading"
          >
            <div className="catalog-form-section-heading">
              <h3 id="catalog-product-commercial-heading">Comercial</h3>
              <p>Precio, disponibilidad y visibilidad pública.</p>
            </div>
            <div className="catalog-form-grid">
              <div className="catalog-form-field">
                <label htmlFor="catalog-product-cta-type">Tipo de acción</label>
                <select id="catalog-product-cta-type" value={ctaType} onChange={(event) => changeCtaType(event.target.value as CatalogCtaType)}>
                  <option value="url">Enlace</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </div>
              <div className="catalog-form-field">
                <label htmlFor={fieldIds.priceMinorUnits}>
                  Precio <span className="catalog-required">Requerido</span>
                </label>
                <input
                  id={fieldIds.priceMinorUnits}
                  inputMode="decimal"
                  autoComplete="off"
                  value={priceInput}
                  onChange={(event) => setPriceValue(event.target.value)}
                  onKeyDown={handleMoneyKeyDown}
                  onPaste={handleMoneyPaste}
                  onBlur={() => touchField('priceMinorUnits')}
                  placeholder="0,00"
                  aria-invalid={Boolean(displayedError('priceMinorUnits'))}
                  aria-describedby={
                    displayedError('priceMinorUnits')
                      ? errorId('priceMinorUnits')
                      : 'catalog-product-price-help'
                  }
                />
                <small id="catalog-product-price-help">
                  Moneda: {form.currency}. Usá coma o punto decimal.
                </small>
                {displayedError('priceMinorUnits') && (
                  <p
                    id={errorId('priceMinorUnits')}
                    className="catalog-field-error"
                    role="alert"
                  >
                    {displayedError('priceMinorUnits')}
                  </p>
                )}
              </div>
              <div className="catalog-form-field">
                <label htmlFor={fieldIds.stock}>
                  Stock <span className="catalog-required">Requerido</span>
                </label>
                <input
                  id={fieldIds.stock}
                  inputMode="numeric"
                  autoComplete="off"
                  value={stockInput}
                  onChange={(event) => setStockValue(event.target.value)}
                  onKeyDown={handleIntegerKeyDown}
                  onPaste={handleIntegerPaste}
                  onBlur={() => touchField('stock')}
                  placeholder="0"
                  aria-invalid={Boolean(displayedError('stock'))}
                  aria-describedby={
                    displayedError('stock') ? errorId('stock') : undefined
                  }
                />
                {displayedError('stock') && (
                  <p
                    id={errorId('stock')}
                    className="catalog-field-error"
                    role="alert"
                  >
                    {displayedError('stock')}
                  </p>
                )}
              </div>
            </div>
            <div className="catalog-visibility-control">
              <input
                id="catalog-product-visible"
                type="checkbox"
                checked={form.visible}
                onChange={(event) => setField('visible', event.target.checked)}
              />
              <div>
                <label htmlFor="catalog-product-visible">
                  Visible en el catálogo público
                </label>
                <p>
                  Activo: se muestra a clientes. Desactivado: queda oculto y
                  podés seguir editándolo.
                </p>
              </div>
            </div>
          </section>
          <section
            className="catalog-form-section"
            aria-labelledby="catalog-product-images-heading"
          >
            <div className="catalog-form-section-heading">
              <h3 id="catalog-product-images-heading">Imágenes</h3>
              <p>
                La imagen principal identifica el producto. Las secundarias
                amplían su presentación.
              </p>
            </div>
            <div className="catalog-form-field">
              <label>Imagen principal</label>
              <AssetPicker
                org={org}
                value={form.mainAssetUrl}
                onChange={(value) => setField('mainAssetUrl', value)}
                categories={['image']}
                canUpload={canManageAssets}
                disabled={!canEdit}
                label="Seleccionar imagen"
              />
            </div>
            {editing === 'new' ? (
              <p className="field-help">
                Guardá el producto para poder agregar imágenes secundarias.
              </p>
            ) : (
              <section
                className="catalog-gallery-section"
                aria-labelledby="catalog-gallery-heading"
              >
                <div className="catalog-gallery-heading">
                  <div>
                    <h4 id="catalog-gallery-heading">
                      Galería{' '}
                      <span>
                        {currentGallery.length}/
                        {CATALOG_PRODUCT_LIMITS.galleryImages}
                      </span>
                    </h4>
                    <p className="field-help">
                      La imagen principal se mantiene separada.
                    </p>
                  </div>
                  <AssetPicker
                    org={org}
                    value={null}
                    onChange={(value) => void addGalleryImage(value)}
                    categories={['image']}
                    canUpload={canManageAssets}
                    disabled={
                      !canEdit ||
                      gallerySaving ||
                      currentGallery.length >=
                        CATALOG_PRODUCT_LIMITS.galleryImages
                    }
                    label={gallerySaving ? 'Guardando…' : 'Agregar imagen'}
                  />
                </div>
                {galleryError && (
                  <p className="error" role="alert">
                    {galleryError}
                  </p>
                )}
                {currentGallery.length >=
                  CATALOG_PRODUCT_LIMITS.galleryImages && (
                  <p className="field-help">
                    Alcanzaste el máximo de imágenes secundarias.
                  </p>
                )}
                {currentGallery.length ? (
                  <div className="catalog-gallery-list">
                    {currentGallery.map((image, index) => (
                      <div className="catalog-gallery-item" key={image.id}>
                        <img
                          src={image.url}
                          alt={`Imagen secundaria ${index + 1}`}
                        />
                        <div>
                          <span>Imagen {index + 1}</span>
                          <div className="catalog-gallery-actions">
                            <button
                              type="button"
                              className="button-quiet"
                              disabled={
                                !canEdit || gallerySaving || index === 0
                              }
                              onClick={() =>
                                void reorderGalleryImage(image.id, -1)
                              }
                            >
                              Subir
                            </button>
                            <button
                              type="button"
                              className="button-quiet"
                              disabled={
                                !canEdit ||
                                gallerySaving ||
                                index === currentGallery.length - 1
                              }
                              onClick={() =>
                                void reorderGalleryImage(image.id, 1)
                              }
                            >
                              Bajar
                            </button>
                            <button
                              type="button"
                              className="button-quiet"
                              disabled={!canEdit || gallerySaving}
                              onClick={() => void removeGalleryImage(image.id)}
                            >
                              Quitar
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="field-help">
                    Todavía no hay imágenes secundarias.
                  </p>
                )}
              </section>
            )}
          </section>
          <section
            className="catalog-form-section"
            aria-labelledby="catalog-product-action-heading"
          >
            <div className="catalog-form-section-heading">
              <h3 id="catalog-product-action-heading">Acción</h3>
              <p>
                Podés dirigir a clientes a una consulta o WhatsApp desde el
                producto.
              </p>
            </div>
            <div className="catalog-form-grid">
              <div className="catalog-form-field">
                <label htmlFor={fieldIds.ctaLabel}>
                  Texto del botón{' '}
                  <span className="catalog-optional">Opcional</span>
                </label>
                <input
                  id={fieldIds.ctaLabel}
                  maxLength={CATALOG_PRODUCT_LIMITS.ctaLabel}
                  value={form.ctaLabel ?? ''}
                  onChange={(event) =>
                    setField('ctaLabel', event.target.value || null)
                  }
                  onBlur={() => touchField('ctaLabel')}
                  placeholder="Consultar"
                  aria-invalid={Boolean(displayedError('ctaLabel'))}
                  aria-describedby={
                    displayedError('ctaLabel') ? errorId('ctaLabel') : undefined
                  }
                />
                {displayedError('ctaLabel') && (
                  <p
                    id={errorId('ctaLabel')}
                    className="catalog-field-error"
                    role="alert"
                  >
                    {displayedError('ctaLabel')}
                  </p>
                )}
              </div>
              <div className="catalog-form-field">
                <label htmlFor={fieldIds.ctaUrl}>
                  {ctaType === 'whatsapp' ? 'Número de WhatsApp' : 'Enlace'}{' '}
                  <span className="catalog-optional">Opcional</span>
                </label>
                <input
                  id={fieldIds.ctaUrl}
                  type="text"
                  inputMode={ctaType === 'whatsapp' ? 'tel' : 'url'}
                  maxLength={CATALOG_PRODUCT_LIMITS.ctaUrl}
                  value={form.ctaUrl ?? ''}
                  onChange={(event) =>
                    setField('ctaUrl', event.target.value || null)
                  }
                  onBlur={() => touchField('ctaUrl')}
                  placeholder={ctaType === 'whatsapp' ? '+54 9 3541 123456' : 'https://ejemplo.com'}
                  aria-invalid={Boolean(displayedError('ctaUrl'))}
                  aria-describedby={
                    displayedError('ctaUrl')
                      ? errorId('ctaUrl')
                      : 'catalog-product-cta-help'
                  }
                />
                <small id="catalog-product-cta-help">
                  {ctaType === 'whatsapp' ? 'Ingresá el número con código de país y área.' : 'Usá un enlace http:// o https://. Si completás ambos campos, se muestra el botón.'}
                </small>
                {displayedError('ctaUrl') && (
                  <p
                    id={errorId('ctaUrl')}
                    className="catalog-field-error"
                    role="alert"
                  >
                    {displayedError('ctaUrl')}
                  </p>
                )}
              </div>
            </div>
          </section>
          {productError && (
            <p className="error catalog-product-error" role="alert">
              {productError}
            </p>
          )}
          <div className="dialog-actions catalog-product-dialog-actions">
            <button
              type="button"
              className="secondary"
              disabled={productSaving}
              onClick={() => setEditing(null)}
            >
              Cancelar
            </button>
            <button type="submit" disabled={productSaving}>
              {productSaving ? 'Guardando…' : 'Guardar producto'}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
