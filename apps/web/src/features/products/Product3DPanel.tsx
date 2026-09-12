import { useEffect, useMemo, useState } from 'react';
import { defaultProduct3DConfig, product3DConfigIssues, type Product3DConfig } from '@corsteno/types';
import { ApiError } from '../../shared/api/client';
import { products3dApi, type Product3DAsset, type Product3DState } from '../experiences/api';
import { ProductModelPreview } from './ProductModelPreview';

type Props = { org: string; productId: string; productStatus: 'active' | 'archived' };
type EditableConfig = { scale: string; positionX: string; positionY: string; positionZ: string; rotationX: string; rotationY: string; rotationZ: string; arEnabled: boolean };

function editableConfig(config: Product3DConfig | null): EditableConfig {
  const value = config ?? defaultProduct3DConfig();
  return {
    scale: String(value.transform.scale),
    positionX: String(value.transform.position.x), positionY: String(value.transform.position.y), positionZ: String(value.transform.position.z),
    rotationX: String(value.transform.rotation.x), rotationY: String(value.transform.rotation.y), rotationZ: String(value.transform.rotation.z),
    arEnabled: value.arEnabled,
  };
}

function numberValue(value: string) { return value.trim() === '' ? Number.NaN : Number(value); }

function configValue(value: EditableConfig): Product3DConfig {
  return {
    schemaVersion: 1,
    transform: {
      scale: numberValue(value.scale),
      position: { x: numberValue(value.positionX), y: numberValue(value.positionY), z: numberValue(value.positionZ) },
      rotation: { x: numberValue(value.rotationX), y: numberValue(value.rotationY), z: numberValue(value.rotationZ) },
    },
    viewer: { framing: 'auto' },
    arEnabled: value.arEnabled,
  };
}

function statusLabel(status: Product3DState['status']) {
  return { not_configured: 'No configurado', draft: 'Borrador', published: 'Publicado', changes: 'Cambios sin publicar', error: 'Error' }[status];
}

function formatBytes(value: number) {
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function Product3DPanel({ org, productId, productStatus }: Props) {
  const [state, setState] = useState<Product3DState | null>(null);
  const [assets, setAssets] = useState<Product3DAsset[]>([]);
  const [form, setForm] = useState<EditableConfig>(editableConfig(null));
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [validation, setValidation] = useState<Array<{ path: string; message: string }>>([]);

  async function load() {
    setLoading(true); setError('');
    try {
      const [nextState, nextAssets] = await Promise.all([products3dApi.get(productId, org), products3dApi.assets(productId, org)]);
      setState(nextState); setAssets(nextAssets.items); setForm(editableConfig(nextState.draftConfig)); setSelectedModel(nextState.draftModelAssetId); setValidation(nextState.draftIssues);
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'No se pudo cargar la configuración 3D.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [org, productId]);

  const selectedAsset = useMemo(() => assets.find((asset) => asset.id === selectedModel) ?? state?.draftModel ?? null, [assets, selectedModel, state?.draftModel]);
  const previewConfig = useMemo(() => configValue(form), [form]);

  function change(key: keyof EditableConfig, value: string | boolean) {
    setForm((current) => ({ ...current, [key]: value }));
    setValidation([]); setMessage('');
  }

  async function upload(file: File) {
    setUploading(true); setError(''); setMessage('');
    try {
      const result = await products3dApi.upload(productId, org, file);
      setState(result.state); setSelectedModel(result.state.draftModelAssetId); setAssets((current) => [result.asset, ...current.filter((asset) => asset.id !== result.asset.id)]);
      setMessage('Modelo cargado como borrador.');
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'No se pudo cargar el modelo.'); }
    finally { setUploading(false); }
  }

  async function saveDraft() {
    const nextConfig = configValue(form);
    const issues = product3DConfigIssues(nextConfig, 'draftConfig');
    if (issues.length) { setValidation(issues); setError('Revisá los valores técnicos antes de guardar.'); return false; }
    setSaving(true); setError(''); setMessage('');
    try {
      const next = await products3dApi.update(productId, org, { modelAssetId: selectedModel, config: nextConfig });
      setState(next); setForm(editableConfig(next.draftConfig)); setSelectedModel(next.draftModelAssetId); setValidation(next.draftIssues); setMessage('Configuración 3D guardada como borrador.'); return true;
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'No se pudo guardar la configuración 3D.'); return false; }
    finally { setSaving(false); }
  }

  async function publish() {
    if (!await saveDraft()) return;
    setPublishing(true); setError(''); setMessage('');
    try { const next = await products3dApi.publish(productId, org); setState(next); setForm(editableConfig(next.draftConfig)); setSelectedModel(next.draftModelAssetId); setValidation(next.draftIssues); setMessage('Configuración 3D publicada.'); }
    catch (caught) {
      const details = caught instanceof ApiError && Array.isArray(caught.details) ? caught.details.filter((item): item is { path: string; message: string } => Boolean(item && typeof item === 'object' && typeof (item as { path?: unknown }).path === 'string' && typeof (item as { message?: unknown }).message === 'string')) : [];
      setValidation(details); setError(caught instanceof ApiError ? caught.message : 'No se pudo publicar la configuración 3D.');
    } finally { setPublishing(false); }
  }

  if (loading) return <section className="product-3d-panel"><p className="field-help">Cargando configuración 3D…</p></section>;
  return <section className="product-3d-panel" aria-labelledby={`product-3d-heading-${productId}`}>
    <div className="product-3d-heading"><div><p className="eyebrow">SOLO CORSTENO</p><h3 id={`product-3d-heading-${productId}`}>Configuración 3D</h3><p className="field-help">Superficie técnica independiente del contenido comercial.</p></div><span className={`status status-${state?.status ?? 'not_configured'}`}>{statusLabel(state?.status ?? 'not_configured')}</span></div>
    {error && <p className="error" role="alert">{error}</p>}{message && <p className="success" role="status">{message}</p>}
    {state?.publishedModel && <p className="product-3d-published">Publicado: <strong>{state.publishedModel.displayName}</strong>{state.publishedConfig ? ' · encuadre automático' : ''}</p>}
    <div className="product-3d-layout">
      <div className="product-3d-fields">
        <label htmlFor={`product-3d-model-${productId}`}>Modelo GLB</label>
        <select id={`product-3d-model-${productId}`} value={selectedModel ?? ''} disabled={productStatus === 'archived' || saving || uploading || publishing} onChange={(event) => { setSelectedModel(event.target.value || null); setMessage(''); }}>
          <option value="">Sin modelo seleccionado</option>{assets.map((asset) => <option value={asset.id} key={asset.id}>{asset.displayName} · {formatBytes(asset.byteSize)}</option>)}
        </select>
        <div className="product-3d-file-actions"><label className="button secondary" htmlFor={`product-3d-upload-${productId}`}>{uploading ? 'Subiendo…' : 'Cargar GLB'}</label><input id={`product-3d-upload-${productId}`} type="file" accept=".glb,model/gltf-binary,application/octet-stream" hidden disabled={productStatus === 'archived' || uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ''; }} />{selectedModel && <button type="button" className="link" disabled={saving || publishing} onClick={() => { setSelectedModel(null); setMessage(''); }}>Quitar borrador</button>}</div>
        {selectedAsset && <small className="field-help">{selectedAsset.displayName} · {selectedAsset.mimeType} · {formatBytes(selectedAsset.byteSize)}</small>}
        <div className="product-3d-subheading"><strong>Transformación</strong><small>Posición en unidades del modelo · rotación en grados.</small></div>
        <label htmlFor={`product-3d-scale-${productId}`}>Escala</label><input id={`product-3d-scale-${productId}`} type="number" inputMode="decimal" min="0.01" max="100" step="0.01" value={form.scale} disabled={productStatus === 'archived' || saving || publishing} onChange={(event) => change('scale', event.target.value)} />
        <div className="product-3d-axis-grid"><label>Posición X<input type="number" step="0.01" value={form.positionX} disabled={productStatus === 'archived' || saving || publishing} onChange={(event) => change('positionX', event.target.value)} /></label><label>Posición Y<input type="number" step="0.01" value={form.positionY} disabled={productStatus === 'archived' || saving || publishing} onChange={(event) => change('positionY', event.target.value)} /></label><label>Posición Z<input type="number" step="0.01" value={form.positionZ} disabled={productStatus === 'archived' || saving || publishing} onChange={(event) => change('positionZ', event.target.value)} /></label></div>
        <div className="product-3d-axis-grid"><label>Rotación X °<input type="number" step="1" value={form.rotationX} disabled={productStatus === 'archived' || saving || publishing} onChange={(event) => change('rotationX', event.target.value)} /></label><label>Rotación Y °<input type="number" step="1" value={form.rotationY} disabled={productStatus === 'archived' || saving || publishing} onChange={(event) => change('rotationY', event.target.value)} /></label><label>Rotación Z °<input type="number" step="1" value={form.rotationZ} disabled={productStatus === 'archived' || saving || publishing} onChange={(event) => change('rotationZ', event.target.value)} /></label></div>
        <div className="product-3d-subheading"><strong>Viewer y AR</strong><small>Encuadre automático para el futuro consumidor.</small></div>
        <label className="product-3d-checkbox"><input type="checkbox" checked={form.arEnabled} disabled={productStatus === 'archived' || saving || publishing} onChange={(event) => change('arEnabled', event.target.checked)} /> AR habilitada</label>
        {validation.length > 0 && <div className="product-3d-issues" role="alert"><strong>Revisá antes de publicar</strong>{validation.map((item, index) => <small key={`${item.path}-${index}`}>{item.message}</small>)}</div>}
        {productStatus === 'archived' && <small className="field-help">El producto está archivado; su configuración técnica se conserva y es de solo lectura.</small>}
        <div className="product-3d-actions"><button type="button" className="secondary" disabled={productStatus === 'archived' || saving || publishing} onClick={() => void saveDraft()}>{saving ? 'Guardando…' : 'Guardar borrador 3D'}</button><button type="button" disabled={productStatus === 'archived' || saving || publishing || !selectedModel} onClick={() => void publish()}>{publishing ? 'Publicando…' : 'Publicar configuración 3D'}</button></div>
      </div>
      <div><ProductModelPreview url={selectedAsset?.url ?? null} config={previewConfig} /></div>
    </div>
  </section>;
}
