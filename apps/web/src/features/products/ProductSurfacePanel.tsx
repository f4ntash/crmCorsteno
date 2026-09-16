import { useEffect, useState } from 'react';
import { productSurfaceConfigIssues, SURFACE_MATERIAL_SCHEMA_VERSION, type ProductSurfaceConfig } from '@corsteno/types';
import { ApiError } from '../../shared/api/client';
import { AssetPicker } from '../assets/AssetPicker';
import { productsSurfaceApi, type ProductSurfaceState } from '../experiences/api';

type Props = { org: string; productId: string; productStatus: 'active' | 'archived'; canManageAssets?: boolean };
type Editable = {
  enabled: boolean; mode: 'solid' | 'texture'; width: string; height: string; rotation: string; orientation: 'horizontal' | 'vertical' | 'free'; roughness: string; metalness: string; normalScale: string; fallbackColor: string; baseColor: string; wall: boolean; floor: boolean;
  baseColorAssetId: string | null; baseColorUrl: string | null; normalAssetId: string | null; normalUrl: string | null; roughnessAssetId: string | null; roughnessUrl: string | null;
};

function editableConfig(config: ProductSurfaceConfig | null, state?: ProductSurfaceState | null): Editable {
  const value = config ?? { schemaVersion: SURFACE_MATERIAL_SCHEMA_VERSION, enabled: false, mode: 'solid' as const, physicalWidthM: 0.6, physicalHeightM: 1.2, rotationDegrees: 0, roughness: 0.8, metalness: 0, fallbackColor: '#d7d1c6', compatibleSurfaces: ['wall', 'floor'] as ('wall' | 'floor')[], orientation: 'free' as const };
  return {
    enabled: value.enabled !== false, mode: value.mode, width: String(value.physicalWidthM), height: String(value.physicalHeightM), rotation: String(value.rotationDegrees), orientation: value.orientation ?? 'free', roughness: String(value.roughness), metalness: String(value.metalness), normalScale: String(value.normalScale ?? 0.45), fallbackColor: value.fallbackColor ?? (value.mode === 'solid' ? value.baseColor ?? '#d7d1c6' : '#d7d1c6'), baseColor: value.mode === 'solid' ? value.baseColor ?? '#d7d1c6' : '#d7d1c6', wall: (value.compatibleSurfaces ?? ['wall', 'floor']).includes('wall'), floor: (value.compatibleSurfaces ?? ['wall', 'floor']).includes('floor'),
    baseColorAssetId: value.mode === 'texture' ? value.assets?.baseColorAssetId ?? null : null, baseColorUrl: state?.draftAssets.baseColor?.url ?? null, normalAssetId: value.mode === 'texture' ? value.assets?.normalAssetId ?? null : null, normalUrl: state?.draftAssets.normal?.url ?? null, roughnessAssetId: value.mode === 'texture' ? value.assets?.roughnessAssetId ?? null : null, roughnessUrl: state?.draftAssets.roughness?.url ?? null,
  };
}

function numeric(value: string) { return value.trim() === '' ? Number.NaN : Number(value); }

function configValue(value: Editable): ProductSurfaceConfig {
  const compatibleSurfaces = [value.wall ? 'wall' : null, value.floor ? 'floor' : null].filter((surface): surface is 'wall' | 'floor' => Boolean(surface));
  return {
    schemaVersion: SURFACE_MATERIAL_SCHEMA_VERSION,
    repeatMode: 'repeat',
    enabled: value.enabled,
    mode: value.mode,
    physicalWidthM: numeric(value.width),
    physicalHeightM: numeric(value.height),
    rotationDegrees: numeric(value.rotation),
    orientation: value.orientation,
    compatibleSurfaces,
    roughness: numeric(value.roughness),
    metalness: numeric(value.metalness),
    normalScale: numeric(value.normalScale),
    fallbackColor: value.fallbackColor,
    ...(value.mode === 'solid' ? { baseColor: value.baseColor } : { assets: { baseColorAssetId: value.baseColorAssetId ?? '', normalAssetId: value.normalAssetId, roughnessAssetId: value.roughnessAssetId } }),
  };
}

function statusLabel(status: ProductSurfaceState['status']) {
  return { not_configured: 'No configurado', draft: 'Borrador', published: 'Publicado', changes: 'Cambios sin publicar', error: 'Error' }[status];
}

export function ProductSurfacePanel({ org, productId, productStatus, canManageAssets = false }: Props) {
  const [state, setState] = useState<ProductSurfaceState | null>(null);
  const [form, setForm] = useState<Editable>(editableConfig(null));
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [publishing, setPublishing] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [validation, setValidation] = useState<Array<{ path: string; message: string }>>([]);

  async function load() {
    setLoading(true); setError('');
    try { const next = await productsSurfaceApi.get(productId, org); setState(next); setForm(editableConfig(next.draftConfig, next)); setValidation(next.draftIssues); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'No se pudo cargar la configuración de superficie.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [org, productId]);
  function change<K extends keyof Editable>(key: K, value: Editable[K]) { setForm((current) => ({ ...current, [key]: value })); setValidation([]); setMessage(''); }
  function assetChange(role: 'base' | 'normal' | 'roughness', asset: { id: string; url: string; byteSize?: number } | null) { change(`${role === 'base' ? 'baseColor' : role}AssetId` as keyof Editable, asset?.id ?? null); change(`${role === 'base' ? 'baseColor' : role}Url` as keyof Editable, asset?.url ?? null); }
  async function saveDraft() {
    const nextConfig = configValue(form); const issues = productSurfaceConfigIssues(nextConfig, 'draftConfig').map((path) => ({ path, message: 'El valor de superficie no es válido.' }));
    if (issues.length) { setValidation(issues); setError('Revisá los valores técnicos antes de guardar.'); return false; }
    setSaving(true); setError(''); setMessage('');
    try { const next = await productsSurfaceApi.update(productId, org, nextConfig); setState(next); setForm(editableConfig(next.draftConfig, next)); setValidation(next.draftIssues); setMessage('Material 3D guardado como borrador.'); return true; }
    catch (caught) { const details = caught instanceof ApiError && Array.isArray(caught.details) ? caught.details.filter((item): item is { path: string; message: string } => Boolean(item && typeof item === 'object' && typeof (item as { path?: unknown }).path === 'string' && typeof (item as { message?: unknown }).message === 'string')) : []; setValidation(details); setError(caught instanceof ApiError ? caught.message : 'No se pudo guardar el material 3D.'); return false; }
    finally { setSaving(false); }
  }
  async function publish() {
    if (!await saveDraft()) return; setPublishing(true); setError(''); setMessage('');
    try { const next = await productsSurfaceApi.publish(productId, org); setState(next); setForm(editableConfig(next.draftConfig, next)); setValidation(next.draftIssues); setMessage('Material 3D publicado.'); }
    catch (caught) { const details = caught instanceof ApiError && Array.isArray(caught.details) ? caught.details.filter((item): item is { path: string; message: string } => Boolean(item && typeof item === 'object' && typeof (item as { path?: unknown }).path === 'string' && typeof (item as { message?: unknown }).message === 'string')) : []; setValidation(details); setError(caught instanceof ApiError ? caught.message : 'No se pudo publicar el material 3D.'); }
    finally { setPublishing(false); }
  }
  const disabled = productStatus === 'archived' || saving || publishing;
  if (loading) return <section className="product-surface-panel"><p className="field-help">Cargando material 3D…</p></section>;
  return <section className="product-surface-panel" aria-labelledby={`product-surface-heading-${productId}`}>
    <div className="product-3d-heading"><div><p className="eyebrow">CAPACIDAD DE PRODUCTO</p><h3 id={`product-surface-heading-${productId}`}>Material 3D / Visualizador</h3><p className="field-help">Configuración PBR administrable y separada del modelo GLB.</p></div><span className={`status status-${state?.status ?? 'not_configured'}`}>{statusLabel(state?.status ?? 'not_configured')}</span></div>
    {error && <p className="error" role="alert">{error}</p>}{message && <p className="success" role="status">{message}</p>}
    <div className="product-surface-fields">
      <label className="product-3d-checkbox"><input type="checkbox" checked={form.enabled} disabled={disabled} onChange={(event) => change('enabled', event.target.checked)} /> Habilitado para el visualizador</label>
      <label htmlFor={`surface-mode-${productId}`}>Modo</label><select id={`surface-mode-${productId}`} value={form.mode} disabled={disabled} onChange={(event) => change('mode', event.target.value as Editable['mode'])}><option value="solid">Color sólido</option><option value="texture">Texture / PBR</option></select>
      <div className="product-surface-grid"><label>Ancho físico (m)<input type="number" min="0.01" max="20" step="0.01" value={form.width} disabled={disabled} onChange={(event) => change('width', event.target.value)} /></label><label>Alto físico (m)<input type="number" min="0.01" max="20" step="0.01" value={form.height} disabled={disabled} onChange={(event) => change('height', event.target.value)} /></label><label>Rotación (°)<input type="number" min="-3600" max="3600" step="1" value={form.rotation} disabled={disabled} onChange={(event) => change('rotation', event.target.value)} /></label></div>
      <div className="product-surface-grid"><label>Orientación<select value={form.orientation} disabled={disabled} onChange={(event) => change('orientation', event.target.value as Editable['orientation'])}><option value="free">Libre</option><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></label><label>Roughness<input type="number" min="0" max="1" step="0.01" value={form.roughness} disabled={disabled} onChange={(event) => change('roughness', event.target.value)} /></label><label>Metalness<input type="number" min="0" max="1" step="0.01" value={form.metalness} disabled={disabled} onChange={(event) => change('metalness', event.target.value)} /></label></div>
      <div className="product-surface-grid"><label>Normal scale<input type="number" min="0" max="2" step="0.01" value={form.normalScale} disabled={disabled} onChange={(event) => change('normalScale', event.target.value)} /></label><label>Color fallback<input type="text" maxLength={7} value={form.fallbackColor} disabled={disabled} onChange={(event) => change('fallbackColor', event.target.value)} /></label>{form.mode === 'solid' && <label>Base Color<input type="text" maxLength={7} value={form.baseColor} disabled={disabled} onChange={(event) => change('baseColor', event.target.value)} /></label>}</div>
      <div className="product-surface-subheading"><strong>Superficies compatibles</strong><small>Se deja disponible la restricción; por ahora no bloquea la aplicación.</small></div><div className="product-surface-checks"><label className="product-3d-checkbox"><input type="checkbox" checked={form.wall} disabled={disabled} onChange={(event) => change('wall', event.target.checked)} /> Pared</label><label className="product-3d-checkbox"><input type="checkbox" checked={form.floor} disabled={disabled} onChange={(event) => change('floor', event.target.checked)} /> Piso</label></div>
      {form.mode === 'texture' && <div className="product-surface-maps"><div className="product-surface-subheading"><strong>Mapas PBR</strong><small>Base Color es obligatorio. Normal y Roughness son opcionales.</small></div><div><span className="field-label">Base Color</span><AssetPicker org={org} value={form.baseColorUrl} onChange={(url) => change('baseColorUrl', url)} onAssetChange={(asset) => assetChange('base', asset)} categories={['surface-material-map']} accept="image/webp" canUpload={canManageAssets} disabled={disabled} label="Elegir Base Color" />{state?.draftAssets.baseColor ? <small className="field-help">{state.draftAssets.baseColor.displayName} · {state.draftAssets.baseColor.mimeType}</small> : <small className="field-help">Sin Base Color seleccionado</small>}</div><div><span className="field-label">Normal</span><AssetPicker org={org} value={form.normalUrl} onChange={(url) => change('normalUrl', url)} onAssetChange={(asset) => assetChange('normal', asset)} categories={['surface-material-map']} accept="image/webp" canUpload={canManageAssets} disabled={disabled} label="Elegir Normal" />{state?.draftAssets.normal ? <small className="field-help">{state.draftAssets.normal.displayName} · {state.draftAssets.normal.mimeType}</small> : <small className="field-help">Sin Normal (opcional)</small>}</div><div><span className="field-label">Roughness</span><AssetPicker org={org} value={form.roughnessUrl} onChange={(url) => change('roughnessUrl', url)} onAssetChange={(asset) => assetChange('roughness', asset)} categories={['surface-material-map']} accept="image/webp" canUpload={canManageAssets} disabled={disabled} label="Elegir Roughness" />{state?.draftAssets.roughness ? <small className="field-help">{state.draftAssets.roughness.displayName} · {state.draftAssets.roughness.mimeType}</small> : <small className="field-help">Sin Roughness (opcional)</small>}</div></div>}
      {validation.length > 0 && <div className="product-3d-issues" role="alert"><strong>Revisá antes de guardar</strong>{validation.map((item, index) => <small key={`${item.path}-${index}`}>{item.message}</small>)}</div>}
      {productStatus === 'archived' && <small className="field-help">El producto está archivado; su capacidad se conserva y es de solo lectura.</small>}
      <div className="product-3d-actions"><button type="button" className="secondary" disabled={disabled} onClick={() => void saveDraft()}>{saving ? 'Guardando…' : 'Guardar borrador'}</button><button type="button" disabled={disabled} onClick={() => void publish()}>{publishing ? 'Publicando…' : 'Publicar material 3D'}</button></div>
    </div>
  </section>;
}
