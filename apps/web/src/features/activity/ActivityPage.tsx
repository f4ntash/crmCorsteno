import { useCallback, useEffect, useState } from 'react';
import { apiRequest, ApiError } from '../../shared/api/client';
import { formatActivity } from './presentation';

type ActivityItem = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: number | string;
  actorName: string | null;
  actorEmail: string | null;
};

type ActivityResponse = {
  items: ActivityItem[];
  pagination: { limit: number; offset: number; nextOffset: number | null };
};

function formatTimestamp(value: number | string) {
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function timestampIso(value: number | string) {
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function ActivityPage({ org }: { org: string }) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (offset = 0) => {
    if (!org) return;
    const append = offset > 0;
    if (append) setLoadingMore(true); else setLoading(true);
    setError('');
    try {
      const result = await apiRequest<ActivityResponse>(`/organizations/activity?limit=25&offset=${offset}`, org);
      setItems((current) => append ? [...current, ...result.items] : result.items);
      setNextOffset(result.pagination.nextOffset);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'No se pudo cargar la actividad');
    } finally {
      if (append) setLoadingMore(false); else setLoading(false);
    }
  }, [org]);

  useEffect(() => { void load(); }, [load]);

  return (
    <main className="page activity-page">
      <div className="page-heading">
        <div><p className="eyebrow">ORGANIZACIÓN / HISTORIAL</p><h1>Actividad</h1><p className="page-description">Acciones administrativas y operativas recientes de este espacio.</p></div>
      </div>
      <section className="card activity-card" aria-label="Actividad de la organización">
        <div className="activity-card-heading"><div><h2>Últimas acciones</h2><p>Los eventos se muestran con el contexto disponible y respetan tu organización.</p></div></div>
        {loading ? <p className="loading-state"><span className="loading-mark" />Cargando actividad…</p> : error ? <div className="empty activity-empty"><h2>{error}</h2><button className="button button-secondary" onClick={() => void load()}>Reintentar</button></div> : items.length === 0 ? <div className="empty activity-empty"><h2>Todavía no hay actividad</h2><p>Las acciones importantes aparecerán aquí cuando ocurran.</p></div> : <>
          <div className="activity-list">
            {items.map((item) => <article className="activity-row" key={item.id}>
              <time dateTime={timestampIso(item.createdAt)}>{formatTimestamp(item.createdAt)}</time>
              <div><strong>{formatActivity(item)}</strong><small>{item.actorEmail && item.actorEmail !== item.actorName ? item.actorEmail : 'Actividad registrada en el espacio actual'}</small></div>
            </article>)}
          </div>
          {nextOffset !== null && <button className="button button-secondary activity-more" disabled={loadingMore} onClick={() => void load(nextOffset)}>{loadingMore ? 'Cargando…' : 'Cargar más'}</button>}
        </>}
      </section>
    </main>
  );
}
