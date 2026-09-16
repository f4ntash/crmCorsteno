import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../shared/api/client';
import { assetsApi, type OrganizationAsset } from './api';

export type AssetPickerProps = {
  org: string;
  value?: string | null;
  onChange: (url: string | null) => void;
  onAssetChange?: (asset: OrganizationAsset | null) => void;
  categories?: string[];
  canUpload?: boolean;
  disabled?: boolean;
  label?: string;
  accept?: string;
};

export function AssetPicker({ org, value, onChange, onAssetChange, categories = [], canUpload = false, disabled = false, label = 'Seleccionar archivo', accept = 'image/png,image/jpeg,image/webp,image/svg+xml' }: AssetPickerProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<OrganizationAsset[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const allowed = categories.length ? new Set(categories) : null;

  async function load(searchValue = search) {
    setLoading(true);
    setError('');
    try {
      const result = await assetsApi.list(org, { limit: 50, search: searchValue.trim() || undefined, category: categories.length === 1 ? categories[0] : undefined });
      setItems(allowed ? result.items.filter((item) => allowed.has(item.category)) : result.items);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo cargar la biblioteca.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void load('');
    // Loading is intentionally tied to opening the picker; the library itself is the source of truth.
  }, [open, org, categories.join('|')]);

  async function upload(file: File) {
    setUploading(true);
    setError('');
    try {
      const asset = await assetsApi.upload(org, file, categories[0] ?? 'image');
      onChange(asset.url);
      onAssetChange?.(asset);
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo cargar el archivo.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="asset-picker">
      <div className="asset-picker-selection">
        {value ? <img src={value} alt="Archivo seleccionado" /> : <span className="asset-picker-empty">Sin selección</span>}
        <div>
          <button type="button" className="secondary" disabled={disabled} onClick={() => setOpen(true)}>{label}</button>
          {value && <button type="button" className="link" disabled={disabled} onClick={() => { onChange(null); onAssetChange?.(null); }}>Quitar</button>}
        </div>
      </div>
      {open && (
        <div className="asset-picker-dialog" role="dialog" aria-modal="true" aria-label="Seleccionar archivo">
          <div className="asset-picker-dialog-heading">
            <div><strong>Biblioteca de archivos</strong><small>Seleccioná un archivo de tu organización.</small></div>
            <button type="button" className="button-quiet" onClick={() => setOpen(false)}>Cerrar</button>
          </div>
          <form className="asset-picker-search" onSubmit={(event) => { event.preventDefault(); void load(); }}>
            <input aria-label="Buscar archivos" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre" maxLength={80} />
            <button type="submit" className="secondary" disabled={loading}>Buscar</button>
          </form>
          {canUpload && <>
            <input ref={inputRef} type="file" accept={accept} hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ''; }} />
            <button type="button" className="secondary" disabled={uploading} onClick={() => inputRef.current?.click()}>{uploading ? 'Subiendo…' : 'Subir archivo nuevo'}</button>
          </>}
          {error && <p className="error">{error}</p>}
          {loading ? <p className="field-help">Cargando archivos…</p> : items.length ? <div className="asset-picker-list">
            {items.map((item) => <button type="button" className={`asset-picker-item${item.url === value ? ' selected' : ''}`} key={item.id} onClick={() => { onChange(item.url); onAssetChange?.(item); setOpen(false); }}>
              <img src={item.url} alt="" />
              <span><strong>{item.displayName}</strong><small>{item.category} · {item.mimeType}</small></span>
            </button>)}
          </div> : <p className="field-help">No hay archivos disponibles para este campo.</p>}
        </div>
      )}
    </div>
  );
}
