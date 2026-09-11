import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, apiRequest } from '../../shared/api/client';
import type { AttentionItem, AttentionResponse, AttentionSeverity } from '../../shared/attention/types';

const severityLabels: Record<AttentionSeverity, string> = { critical: 'Crítico', warning: 'Atención', info: 'Información' };
const resourceLabels: Record<string, string> = { experience: 'Experiencia' };

function formatTimestamp(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const action = item.actionHref ? <Link className="button button-secondary attention-action" to={item.actionHref}>{item.actionLabel ?? 'Revisar'} →</Link> : null;
  return <article className={`attention-row attention-${item.severity}`}>
    <span className="attention-severity">{severityLabels[item.severity]}</span>
    <div className="attention-row-content"><h2>{item.title}</h2>{item.description && <p>{item.description}</p>}<small>{resourceLabels[item.resourceType] ?? item.resourceType}{formatTimestamp(item.createdAt) ? ` · ${formatTimestamp(item.createdAt)}` : ''}</small></div>
    {action}
  </article>;
}

export function AttentionPage({ org }: { org: string }) {
  const [severity, setSeverity] = useState<AttentionSeverity | ''>('');
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!org) return;
    setLoading(true);
    setError('');
    const query = severity ? `?severity=${encodeURIComponent(severity)}` : '';
    try {
      const result = await apiRequest<AttentionResponse>(`/attention${query}`, org);
      setItems(result.items);
      setTotal(result.total);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'No se pudo cargar la atención.');
    } finally {
      setLoading(false);
    }
  }, [org, severity]);
  useEffect(() => { void load(); }, [load]);
  return <main className="page attention-page">
    <div className="page-heading"><div><p className="eyebrow">ORGANIZACIÓN / OPERACIÓN</p><h1>Requiere atención</h1><p className="page-description">Situaciones actuales que conviene revisar en tu espacio de trabajo.</p></div><label className="attention-filter">Filtrar<select value={severity} onChange={(event) => setSeverity(event.target.value as AttentionSeverity | '')}><option value="">Todas</option><option value="critical">Críticas</option><option value="warning">Atención</option><option value="info">Información</option></select></label></div>
    <section className="card attention-card" aria-label="Atención de la organización">
      {loading ? <div className="loading-state" aria-live="polite"><span className="loading-mark" />Cargando atención…</div> : error ? <div className="empty"><h2>{error}</h2><button className="button button-secondary" onClick={() => void load()}>Reintentar</button></div> : items.length === 0 ? <div className="empty attention-empty"><h2>No hay nada que requiera atención</h2><p>Las situaciones operativas que necesiten revisión aparecerán aquí.</p></div> : <><div className="attention-list">{items.map((item) => <AttentionRow item={item} key={item.id} />)}</div><p className="attention-count">{total} {total === 1 ? 'situación actual' : 'situaciones actuales'}</p></>}
    </section>
  </main>;
}
