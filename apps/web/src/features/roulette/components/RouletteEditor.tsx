import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RoulettePreview } from '../../../RoulettePreview';
import { apiRequest } from '../../../shared/api/client';
import { experiencesApi } from '../../experiences/api';
import type { Experience } from '../../experiences/types';
import type { RoulettePrize as Prize } from '../types';
import { useRouletteDraft } from '../hooks/useRouletteDraft';

type Inventory = { prizeId: string; stockLimit: number | null; stockUsed: number; stockRemaining: number | null };
type LegacyJson = ReturnType<JSON['parse']>;
async function get<T = LegacyJson>(path: string, org?: string, init?: RequestInit) { return apiRequest<T>(path, org, init); }

export function RouletteEditor({ org, id }: { org: string; id: string }) {
  const navigate = useNavigate();
  const [item, setItem] = useState<Experience>();
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const { draft, setDraft, reset, resize, updateSegment, updatePrize, addPrize, dirty, valid } = useRouletteDraft();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!org) return;
    get(`/experiences/${id}`, org).then((experience: Experience & { draftConfig: unknown }) => { reset(experience.draftConfig); setItem(experience); experiencesApi.inventory(id, org).then(setInventory).catch(() => setInventory([])); }).catch(() => setError('No se pudo cargar la experiencia.')).finally(() => setLoading(false));
  }, [org, id]);
  if (loading) return <main className="page"><p>Cargando configuración…</p></main>;
  async function save() { if (!valid || !dirty || saving) return; setSaving(true); setMessage(''); setError(''); try { await get(`/experiences/${id}`, org, { method: 'PATCH', body: JSON.stringify({ draft_config: draft }) }); reset(draft); setMessage('Borrador guardado.'); } catch (e) { setError((e as Error).message); } finally { setSaving(false); } }
  const previewSegments = draft.segments.map((s) => ({ ...s, label: draft.prizes.find((p) => p.id === s.prizeId)?.name ?? 'Sin premio', iconUrl: draft.prizes.find((p) => p.id === s.prizeId)?.iconUrl ?? null }));
  return <main className="page"><div className="page-heading"><div><p className="eyebrow">EXPERIENCE / CONFIGURACIÓN</p><h1>{item?.name}</h1></div><button className="secondary" onClick={() => navigate('/app/experiences')}>Volver</button></div><div className="editor-grid"><section className="card editor-panel"><h2>Configuración</h2><label>Fondo<input type="color" value={draft.backgroundColor} onChange={(e) => setDraft({ ...draft, backgroundColor: e.target.value })} /></label><h3>Premios</h3>{draft.prizes.map((prize, index) => <PrizeEditor key={prize.id} prize={prize} inventory={inventory.find((entry) => entry.prizeId === prize.id)} uploading={false} onChange={(next) => updatePrize(index, next)} />)}{draft.prizes.length < 5 && <button type="button" className="secondary" onClick={addPrize}>+ Agregar premio</button>}<label>Segmentos<select value={draft.segments.length} onChange={(e) => resize(Number(e.target.value))}>{[6, 7, 8, 9, 10].map((count) => <option key={count}>{count}</option>)}</select></label>{draft.segments.map((segment, index) => <div className="segment-editor" key={segment.id}><strong>Segmento {index + 1}</strong><select value={segment.prizeId ?? ''} onChange={(e) => updateSegment(index, 'prizeId', e.target.value)}><option value="">Sin premio</option>{draft.prizes.map((prize) => <option key={prize.id} value={prize.id}>{prize.name}</option>)}</select><input type="color" value={segment.color} onChange={(e) => updateSegment(index, 'color', e.target.value)} /></div>)}<div className="save-row">{dirty && <span className="dirty">Cambios sin guardar</span>}{message && <span className="success">{message}</span>}{error && <span className="error">{error}</span>}<button disabled={!valid || !dirty || saving} onClick={save}>{saving ? 'Guardando…' : 'Guardar borrador'}</button></div></section><section className="card preview-panel"><h2>Preview</h2><RoulettePreview segments={previewSegments} backgroundColor={draft.backgroundColor} /></section></div></main>;
}

function PrizeEditor({ prize, inventory, uploading, onChange }: { prize: Prize; inventory?: Inventory; uploading: boolean; onChange: (prize: Prize) => void }) {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  async function upload(file: File) {
    setError(''); setSuccess('');
    if (file.type !== 'image/png' && file.type !== 'image/svg+xml') { setError('Solo se aceptan PNG o SVG.'); return; }
    setIsUploading(true);
    try { const organizationId = (document.querySelector('header select') as HTMLSelectElement | null)?.value ?? ''; const experienceId = window.location.pathname.split('/').pop(); const result = await experiencesApi.uploadAsset(experienceId ?? '', organizationId, file) as { url: string }; onChange({ ...prize, iconUrl: result.url }); setSuccess('Ícono cargado.'); } catch (e) { setError((e as Error).message); } finally { setIsUploading(false); }
  }
  const stock = inventory ?? { stockLimit: prize.stockLimit ?? null, stockUsed: 0, stockRemaining: prize.stockLimit ?? null };
  return <div className="prize-editor"><input value={prize.name} onChange={(e) => onChange({ ...prize, name: e.target.value })} /><label>Peso<input type="number" min="1" max="1000" step="1" value={prize.weight ?? 1} onChange={(e) => onChange({ ...prize, weight: Math.max(1, Number(e.target.value) || 1) })} /></label><label>Stock<select value={prize.stockLimit === null || prize.stockLimit === undefined ? 'unlimited' : 'limited'} onChange={(e) => onChange({ ...prize, stockLimit: e.target.value === 'unlimited' ? null : Math.max(0, prize.stockLimit ?? 0) })}><option value="unlimited">Ilimitado</option><option value="limited">Limitado</option></select></label>{prize.stockLimit !== null && prize.stockLimit !== undefined && <input type="number" min="0" max="1000000000" step="1" value={prize.stockLimit} onChange={(e) => onChange({ ...prize, stockLimit: Math.max(0, Number(e.target.value) || 0) })} />}<label><input type="checkbox" checked={prize.enabled ?? true} onChange={(e) => onChange({ ...prize, enabled: e.target.checked })} /> Activo</label>{stock.stockLimit === null ? <small>Stock: ilimitado</small> : <small>Stock: {stock.stockRemaining} / {stock.stockLimit} (usado: {stock.stockUsed})</small>}{prize.iconUrl && <img src={prize.iconUrl} alt="Ícono actual" width="32" height="32" />}<label className="secondary">{uploading || isUploading ? 'Subiendo…' : 'Subir ícono'}<input type="file" accept="image/png,image/svg+xml" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); e.currentTarget.value = ''; }} /></label>{error && <span className="error">{error}</span>}{success && <span className="success">{success}</span>}<small>Mayor peso = más posibilidades de salir.</small></div>;
}
