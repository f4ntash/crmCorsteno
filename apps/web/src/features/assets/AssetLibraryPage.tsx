import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../shared/api/client';
import { assetsApi, type OrganizationAsset } from './api';

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | number) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha desconocida' : date.toLocaleDateString('es-AR');
}

export function AssetLibraryPage({ org, canManage }: { org: string; canManage: boolean }) {
  const [items, setItems] = useState<OrganizationAsset[]>([]);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (next = 0, searchValue = search) => {
    setLoading(true);
    setError('');
    try {
      const result = await assetsApi.list(org, { limit: 24, offset: next, search: searchValue.trim() || undefined });
      setItems(result.items);
      setOffset(next);
      setNextOffset(result.pagination.nextOffset);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo cargar la biblioteca.');
    } finally {
      setLoading(false);
    }
  }, [org, search]);

  useEffect(() => { void load(0, ''); }, [org]);

  async function upload(file: File) {
    setUploading(true);
    setError('');
    try {
      await assetsApi.upload(org, file, 'image');
      await load(0);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo cargar el archivo.');
    } finally {
      setUploading(false);
    }
  }

  async function rename(item: OrganizationAsset) {
    const displayName = window.prompt('Nuevo nombre', item.displayName)?.trim();
    if (!displayName || displayName === item.displayName) return;
    try {
      await assetsApi.rename(org, item.id, displayName);
      await load(offset);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo renombrar el archivo.');
    }
  }

  async function archive(item: OrganizationAsset) {
    if (!window.confirm(`¿Archivar “${item.displayName}”?`)) return;
    try {
      await assetsApi.archive(org, item.id);
      await load(offset);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo archivar el archivo.');
    }
  }

  return (
    <main className="page asset-library-page">
      <div className="page-heading">
        <div><h1>Archivos</h1><p className="page-description">Biblioteca compartida de imágenes para tus experiencias y contenidos.</p></div>
        {canManage && <>
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ''; }} />
          <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()}>{uploading ? 'Subiendo…' : 'Subir archivo'}</button>
        </>}
      </div>
      <section className="asset-library-toolbar">
        <form onSubmit={(event) => { event.preventDefault(); void load(0); }}>
          <input aria-label="Buscar archivos" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre" maxLength={80} />
          <button type="submit" className="secondary" disabled={loading}>Buscar</button>
        </form>
        {!canManage && <span className="field-help">Modo de solo lectura.</span>}
      </section>
      {error && <section className="card asset-library-error"><p className="error">{error}</p><button type="button" className="secondary" onClick={() => void load(offset)}>Reintentar</button></section>}
      {loading ? <p className="field-help">Cargando archivos…</p> : items.length ? <>
        <section className="asset-library-grid" aria-label="Archivos de la organización">
          {items.map((item) => <article className="asset-library-item" key={item.id}>
            <img src={item.url} alt="" loading="lazy" />
            <div className="asset-library-item-body"><strong title={item.displayName}>{item.displayName}</strong><small>{item.category} · {item.mimeType} · {formatBytes(item.byteSize)}</small><small>{formatDate(item.createdAt)}</small></div>
            {canManage && <div className="asset-library-item-actions"><button type="button" className="link" onClick={() => void rename(item)}>Renombrar</button><button type="button" className="link danger-link" onClick={() => void archive(item)}>Archivar</button></div>}
          </article>)}
        </section>
        <div className="asset-library-pagination"><button type="button" className="secondary" disabled={offset === 0 || loading} onClick={() => void load(Math.max(0, offset - 24))}>Anteriores</button><button type="button" className="secondary" disabled={nextOffset === null || loading} onClick={() => void load(nextOffset ?? offset)}>Siguientes</button></div>
      </> : <section className="card asset-library-empty"><h2>Sin archivos todavía</h2><p>Subí una imagen para reutilizarla en tus experiencias.</p>{canManage && <button type="button" onClick={() => inputRef.current?.click()}>Subir primer archivo</button>}</section>}
    </main>
  );
}
