import type React from 'react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { Dialog } from '../../shared/ui/Dialog';
import { experiencesApi, productsApi, type OrganizationProduct } from '../experiences/api';
import type { Experience } from '../experiences/types';
import { channelsApi, channelTypeLabels, isHttpUrl, type Channel, type ChannelContent } from './api';
import { SiteContentEditor } from './SiteContentEditor';

const experienceTypeLabels: Record<string, string> = {
  roulette: 'Roulette',
  website: 'Web',
  ar: 'AR',
  'product-catalog': 'Catálogo de productos',
};

function experienceLabel(experience: Pick<Experience, 'type'>) {
  return experienceTypeLabels[experience.type] ?? experience.type;
}

export function ChannelDetailPage({ org, canManage, canAssignContentProfile = false, canManageAssets = false, hasProductCatalog = false }: { org: string; canManage: boolean; canAssignContentProfile?: boolean; canManageAssets?: boolean; hasProductCatalog?: boolean }) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [channel, setChannel] = useState<Channel>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({ name: '', url: '', status: 'active' as Channel['status'] });
  const [connectOpen, setConnectOpen] = useState(false);
  const [availableExperiences, setAvailableExperiences] = useState<Experience[]>([]);
  const [selectedExperience, setSelectedExperience] = useState('');
  const [loadingExperiences, setLoadingExperiences] = useState(false);
  const [connectError, setConnectError] = useState('');
  const [content, setContent] = useState<ChannelContent>();
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState('');
  const [assigningProfile, setAssigningProfile] = useState(false);
  const [availableProducts, setAvailableProducts] = useState<OrganizationProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productError, setProductError] = useState('');
  const [keyCopied, setKeyCopied] = useState(false);

  async function load() {
    if (!org || !id) return;
    setLoading(true);
    setError('');
    try {
      const result = await channelsApi.get(id, org);
      setChannel(result);
      setForm({ name: result.name, url: result.url ?? '', status: result.status });
      setContent(undefined);
      setContentError('');
      if (result.type !== 'hosted_runtime') {
        setContentLoading(true);
        try {
          setContent(await channelsApi.getContent(result.id, org));
        } catch (cause) {
          setContentError(cause instanceof ApiError ? cause.message : 'No se pudo cargar el contenido.');
        } finally {
          setContentLoading(false);
        }
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'No se pudo cargar el sitio o canal.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [org, id]);

  async function assignProfile() {
    if (!channel || assigningProfile || !canAssignContentProfile) return;
    setAssigningProfile(true);
    setContentError('');
    try {
      setContent(await channelsApi.assignContentProfile(channel.id, org, 'marketing-basic-v1'));
    } catch (cause) {
      setContentError(cause instanceof ApiError ? cause.message : 'No se pudo preparar el contenido.');
    } finally {
      setAssigningProfile(false);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!channel || saving) return;
    const name = form.name.trim();
    const url = form.url.trim();
    if (name.length < 2 || name.length > 120) {
      setFormError('El nombre debe tener entre 2 y 120 caracteres.');
      return;
    }
    if (channel.type === 'external_site' && !isHttpUrl(url)) {
      setFormError('Ingresá una URL válida con http:// o https://.');
      return;
    }
    if (channel.type === 'corsteno_site' && url && !isHttpUrl(url)) {
      setFormError('Ingresá una URL válida con http:// o https://.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const updated = await channelsApi.update(channel.id, org, { name, status: form.status, url: channel.type === 'hosted_runtime' ? null : url || null });
      setChannel(updated);
      setForm({ name: updated.name, url: updated.url ?? '', status: updated.status });
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'No se pudo guardar el canal.');
    } finally {
      setSaving(false);
    }
  }

  async function openConnect() {
    if (!channel || !canManage) return;
    setConnectError('');
    setSelectedExperience('');
    setLoadingExperiences(true);
    try {
      const experiences = await experiencesApi.list(org);
      const connected = new Set((channel.experiences ?? []).map((experience) => experience.id));
      setAvailableExperiences(experiences.filter((experience) => !connected.has(experience.id)));
      setConnectOpen(true);
    } catch (cause) {
      setConnectError(cause instanceof Error ? cause.message : 'No se pudieron cargar las experiencias.');
    } finally {
      setLoadingExperiences(false);
    }
  }

  async function connect(event: React.FormEvent) {
    event.preventDefault();
    if (!channel || !selectedExperience || loadingExperiences) return;
    setLoadingExperiences(true);
    setConnectError('');
    try {
      const updated = await channelsApi.linkExperience(channel.id, org, selectedExperience);
      setChannel(updated);
      setConnectOpen(false);
    } catch (cause) {
      setConnectError(cause instanceof Error ? cause.message : 'No se pudo conectar la experiencia.');
    } finally {
      setLoadingExperiences(false);
    }
  }

  async function unlink(experience: NonNullable<Channel['experiences']>[number]) {
    if (!channel || !canManage || !window.confirm(`¿Desconectar ${experience.name} de este canal?`)) return;
    try {
      setChannel(await channelsApi.unlinkExperience(channel.id, org, experience.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo desconectar la experiencia.');
    }
  }

  async function openProductConnect() {
    if (!channel || !canManage || !hasProductCatalog) return;
    setProductError(''); setSelectedProduct(''); setLoadingProducts(true);
    try {
      const result = await productsApi.list(org, false);
      const connected = new Set((channel.products?.draft ?? []).map((product) => product.id));
      setAvailableProducts(result.items.filter((product) => !connected.has(product.id) && product.status === 'active'));
      setProductDialogOpen(true);
    } catch (cause) { setProductError(cause instanceof ApiError ? cause.message : 'No se pudieron cargar los productos.'); }
    finally { setLoadingProducts(false); }
  }

  async function connectProduct(event: React.FormEvent) {
    event.preventDefault();
    if (!channel || !hasProductCatalog || !selectedProduct || loadingProducts) return;
    setLoadingProducts(true); setProductError('');
    try { setChannel(await channelsApi.addProduct(channel.id, org, selectedProduct)); setProductDialogOpen(false); }
    catch (cause) { setProductError(cause instanceof ApiError ? cause.message : 'No se pudo conectar el producto.'); }
    finally { setLoadingProducts(false); }
  }

  async function unlinkProduct(product: NonNullable<Channel['products']>['draft'][number]) {
    if (!channel || !hasProductCatalog || !canManage || !window.confirm(`¿Desconectar ${product.name} de este sitio?`)) return;
    try { setChannel(await channelsApi.removeProduct(channel.id, org, product.id)); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : 'No se pudo desconectar el producto.'); }
  }

  async function setProductVisibility(product: NonNullable<Channel['products']>['draft'][number]) {
    if (!channel || !hasProductCatalog || !canManage) return;
    try { setChannel(await channelsApi.updateProduct(channel.id, org, product.id, !product.visible)); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : 'No se pudo actualizar la visibilidad.'); }
  }

  async function moveProduct(product: NonNullable<Channel['products']>['draft'][number], direction: -1 | 1) {
    if (!channel || !hasProductCatalog || !canManage) return;
    const current = channel.products?.draft ?? [];
    const index = current.findIndex((item) => item.id === product.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.length) return;
    const ids = current.map((item) => item.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try { setChannel(await channelsApi.reorderProducts(channel.id, org, ids)); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : 'No se pudo actualizar el orden.'); }
  }

  async function copySiteKey() {
    if (!channel?.publicKey || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(channel.publicKey);
      setKeyCopied(true);
      window.setTimeout(() => setKeyCopied(false), 1800);
    } catch {
      setError('No se pudo copiar el identificador. Seleccionalo manualmente.');
    }
  }

  function handleContentChange(next: ChannelContent) {
    setContent(next);
    if (!next.hasUnpublishedChanges) {
      setChannel((current) => current?.products?.hasUnpublishedChanges ? { ...current, products: { ...current.products, published: current.products.draft, hasUnpublishedChanges: false } } : current);
    }
  }

  if (loading) return <main className="page"><p className="loading-state"><span className="loading-mark" />Cargando sitio o canal…</p></main>;
  if (!channel) return <main className="page"><div className="empty"><h2>{error || 'No se pudo cargar el sitio o canal.'}</h2><button type="button" className="button button-secondary" onClick={() => navigate('/app/channels')}>Volver a sitios y canales</button></div></main>;
  const experiences = channel.experiences ?? [];
  return (
    <main className="page channel-detail-page">
      <div className="page-heading">
        <div><p className="eyebrow">SITIOS Y CANALES / DESTINO</p><h1>{channel.name}</h1><p className="page-description">Gestioná este destino y las experiencias conectadas.</p></div>
        <Link className="button button-secondary" to="/app/channels">Volver a sitios y canales</Link>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="channel-detail-grid">
        <section className="card channel-edit-card">
          <div className="channel-detail-heading"><div><p className="eyebrow">DESTINO</p><h2>Datos del canal</h2></div><span className={`status status-${channel.status}`}>{channel.status === 'active' ? 'Activo' : 'Inactivo'}</span></div>
          <p className="channel-detail-type">{channelTypeLabels[channel.type]}</p>
          {channel.type === 'hosted_runtime' ? <p className="field-help">Este registro representa el enlace público alojado por Corsteno. La URL pública sigue siendo la de la experiencia.</p> : <p className="field-help">{channel.type === 'external_site' ? `Sitio registrado. Puede consultar el contenido${hasProductCatalog ? ' y los productos' : ''} publicados mediante la API pública.` : 'Sitio registrado para una futura construcción de Corsteno. La API pública ya puede consultar su contenido publicado.'}</p>}
          {canManage ? <form onSubmit={save} className="channel-edit-form">
            <label>Nombre<input value={form.name} maxLength={120} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            {channel.type !== 'hosted_runtime' && <label>{channel.type === 'external_site' ? 'URL del sitio' : 'Dominio previsto (opcional)'}<input type="url" value={form.url} maxLength={2048} onChange={(event) => setForm({ ...form, url: event.target.value })} /><small className="field-help">Solo http:// o https://. No verificamos que el sitio esté online.</small></label>}
            <label>Estado<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Channel['status'] })}><option value="active">Activo</option><option value="inactive">Inactivo</option></select></label>
            {formError && <p className="error" role="alert">{formError}</p>}
            <button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
          </form> : <p className="field-help">Tu acceso permite consultar este destino, pero no modificarlo.</p>}
        </section>
        <section className="card channel-experiences-card">
          <div className="channel-detail-heading"><div><p className="eyebrow">CONTENIDO CONECTADO</p><h2>Experiencias</h2></div>{canManage && <button type="button" className="button button-secondary" onClick={() => void openConnect()} disabled={loadingExperiences}>{loadingExperiences ? 'Cargando…' : 'Conectar experiencia'}</button>}</div>
          {experiences.length ? <div className="linked-experience-list">{experiences.map((experience) => <div className="linked-experience-row" key={experience.id}><div><Link to={`/app/experiences/${experience.id}`}><strong>{experience.name}</strong></Link><small>{experienceLabel(experience)} · {experience.status === 'published' ? 'Publicada' : 'Borrador'}</small></div>{canManage && <button type="button" className="button button-quiet" onClick={() => void unlink(experience)}>Desconectar</button>}</div>)}</div> : <div className="empty channel-empty"><h3>No hay experiencias conectadas.</h3><p>Conectá una experiencia existente para dejar registrado este destino.</p></div>}
        </section>
      </div>
      {channel.type !== 'hosted_runtime' && <section className="card channel-integration-card">
        <div className="channel-detail-heading"><div><p className="eyebrow">INTEGRACIÓN</p><h2>API disponible</h2></div><span className="content-profile-label">Pública</span></div>
        <p>Este identificador permite que tu sitio consulte el contenido{hasProductCatalog ? ' y los productos' : ''} publicados en Corsteno. No es un secreto.</p>
        <div className="channel-key-row"><code>{channel.publicKey ?? 'Identificador no disponible'}</code>{channel.publicKey && <button type="button" className="button button-secondary" onClick={() => void copySiteKey()}>{keyCopied ? 'Copiado' : 'Copiar identificador'}</button>}</div>
      </section>}
      {channel.type !== 'hosted_runtime' && hasProductCatalog && <section className="card channel-products-card">
        <div className="channel-detail-heading"><div><p className="eyebrow">PRODUCTOS DEL SITIO</p><h2>Productos conectados</h2><p className="field-help">La web solo puede consultar productos activos y publicados cuando aparecen en la estructura publicada.</p></div>{canManage && <button type="button" className="button button-secondary" onClick={() => void openProductConnect()} disabled={loadingProducts}>{loadingProducts ? 'Cargando…' : 'Agregar producto'}</button>}</div>
        {(channel.products?.draft ?? []).length ? <div className="channel-product-list">{channel.products?.draft.map((product, index, products) => <div className={`channel-product-row ${product.visible ? '' : 'is-hidden'}`} key={product.id}><div><strong>{product.name}</strong><small>{product.published ? 'Producto publicado' : 'Producto sin publicar'} · {product.visible ? 'Visible' : 'Oculto'}{channel.products?.published.some((published) => published.id === product.id && published.visible) ? ' · En sitio publicado' : ''}</small></div>{canManage && <div className="channel-product-actions"><button type="button" className="button button-quiet" disabled={index === 0} onClick={() => void moveProduct(product, -1)} aria-label={`Subir ${product.name}`}>↑</button><button type="button" className="button button-quiet" disabled={index === products.length - 1} onClick={() => void moveProduct(product, 1)} aria-label={`Bajar ${product.name}`}>↓</button><button type="button" className="button button-quiet" onClick={() => void setProductVisibility(product)}>{product.visible ? 'Ocultar' : 'Mostrar'}</button><button type="button" className="button button-quiet product-danger" onClick={() => void unlinkProduct(product)}>Desconectar</button></div>}</div>)}</div> : <div className="empty channel-empty"><h3>No hay productos conectados.</h3><p>Agregá productos existentes para definir qué puede consumir este sitio.</p></div>}
        {channel.products?.hasUnpublishedChanges && <p className="channel-products-publish-note">Hay cambios de estructura sin publicar. Se publican junto con el contenido del sitio.</p>}
      </section>}
      <section className="card site-content-card">
        <div className="channel-detail-heading"><div><p className="eyebrow">CONTENIDO DEL SITIO</p><h2>Contenido editable</h2></div>{channel.type !== 'hosted_runtime' && content?.profile && <span className="content-profile-label">Perfil preparado</span>}</div>
        {channel.type === 'hosted_runtime' ? <p className="field-help">El canal alojado por Corsteno sigue usando la configuración publicada de la experiencia. Este editor está reservado para sitios externos o creados por Corsteno.</p> : contentLoading ? <p className="loading-state"><span className="loading-mark" />Cargando contenido…</p> : contentError && !content ? <div><p className="error" role="alert">{contentError}</p><button type="button" className="button button-secondary" onClick={() => void load()}>Reintentar</button></div> : content?.profile ? <SiteContentEditor org={org} channel={channel} content={content} canEdit={canManage} canManageAssets={canManageAssets} onContentChange={handleContentChange} /> : <div className="site-content-unassigned"><p>Este sitio todavía no tiene un perfil de contenido editable.</p>{canAssignContentProfile ? <button type="button" onClick={() => void assignProfile()} disabled={assigningProfile}>{assigningProfile ? 'Preparando…' : 'Preparar contenido editable'}</button> : <small>El equipo de Corsteno debe preparar el perfil antes de que puedas cargar contenido.</small>}{contentError && <p className="error" role="alert">{contentError}</p>}</div>}
      </section>
      <Dialog open={connectOpen} title="Conectar experiencia" description="Solo podés elegir experiencias de la organización actual." onClose={() => !loadingExperiences && setConnectOpen(false)}>
        <form onSubmit={connect}>
          {availableExperiences.length ? <label>Experiencia<select autoFocus value={selectedExperience} onChange={(event) => setSelectedExperience(event.target.value)}><option value="">Elegí una experiencia</option>{availableExperiences.map((experience) => <option value={experience.id} key={experience.id}>{experience.name} · {experienceLabel(experience)}</option>)}</select></label> : <p className="field-help">No hay experiencias disponibles para conectar.</p>}
          {connectError && <p className="error" role="alert">{connectError}</p>}
          <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={() => setConnectOpen(false)}>Cancelar</button><button type="submit" disabled={loadingExperiences || !selectedExperience || !availableExperiences.length}>{loadingExperiences ? 'Guardando…' : 'Conectar'}</button></div>
        </form>
      </Dialog>
      {hasProductCatalog && <Dialog open={productDialogOpen} title="Agregar producto" description="Solo podés elegir productos activos de la organización actual." onClose={() => !loadingProducts && setProductDialogOpen(false)}>
        <form onSubmit={connectProduct}>
          {availableProducts.length ? <label>Producto<select autoFocus value={selectedProduct} onChange={(event) => setSelectedProduct(event.target.value)}><option value="">Elegí un producto</option>{availableProducts.map((product) => <option value={product.id} key={product.id}>{product.name}{product.published ? '' : ' · Borrador comercial'}</option>)}</select></label> : <p className="field-help">No hay productos activos disponibles para conectar.</p>}
          {productError && <p className="error" role="alert">{productError}</p>}
          <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={() => setProductDialogOpen(false)}>Cancelar</button><button type="submit" disabled={loadingProducts || !selectedProduct || !availableProducts.length}>{loadingProducts ? 'Guardando…' : 'Conectar'}</button></div>
        </form>
      </Dialog>}
    </main>
  );
}
