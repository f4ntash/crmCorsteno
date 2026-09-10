import { useEffect, useState } from 'react';
import { experiencesApi } from '../api';
import type { EffectiveExperienceStatus } from '../types';
import { ExperienceQrModal } from './ExperienceQrModal';

type InventoryItem = { stockMode: 'limited' | 'unlimited'; stockAvailable: number | null };
type Props = { id: string; org: string; slug: string; status: EffectiveExperienceStatus; accessStatus?: string; startsAt: string | null; endsAt: string | null; publicUrl: string; onTest: () => void };
const statusLabels: Record<string, string> = { draft: 'Borrador', published: 'Publicada', active: 'Activa', scheduled: 'Programada', expired: 'Vencida', paused: 'Pausada', unavailable: 'Sin acceso' };
const accessLabels: Record<string, string> = { no_access: 'Sin acceso comercial', expired: 'Acceso vencido', scheduled: 'Acceso programado' };
function date(value: string | null) { return value ? new Date(value).toLocaleString('es-AR') : ''; }

export function RouletteOperationsOverview({ id, org, slug, status, accessStatus, startsAt, endsAt, publicUrl, onTest }: Props) {
  const [inventory, setInventory] = useState<InventoryItem[] | null>(null);
  const [spinSummary, setSpinSummary] = useState<{ completed: number; prizesWon: number } | null>(null);
  const [claims, setClaims] = useState<{ generated: number; redeemed: number; pending: number } | null>(null);
  useEffect(() => {
    let mounted = true;
    void Promise.allSettled([experiencesApi.inventory(id, org), experiencesApi.spins(id, org, { limit: 1 }), experiencesApi.claims(id, org, undefined)]).then(([inventoryResult, spinsResult, claimsResult]) => {
      if (!mounted) return;
      if (inventoryResult.status === 'fulfilled') setInventory(inventoryResult.value.items);
      if (spinsResult.status === 'fulfilled') setSpinSummary(spinsResult.value.summary ?? { completed: spinsResult.value.pagination.total, prizesWon: 0 });
      if (claimsResult.status === 'fulfilled') setClaims(claimsResult.value.summary ?? null);
    });
    return () => { mounted = false; };
  }, [id, org]);
  const limited = inventory?.filter((item) => item.stockMode === 'limited') ?? [];
  const available = limited.filter((item) => (item.stockAvailable ?? 0) > 0).length;
  const soldOut = limited.filter((item) => (item.stockAvailable ?? 0) <= 0).length;
  const effectiveStatus = accessStatus === 'no_access' ? 'unavailable' : status;
  const statusText = statusLabels[effectiveStatus] ?? effectiveStatus;
  const context = accessLabels[accessStatus ?? ''] ?? (status === 'draft' ? 'Borrador sin publicar' : status === 'scheduled' && startsAt ? `Empieza el ${date(startsAt)}` : status === 'expired' && endsAt ? `Finalizó el ${date(endsAt)}` : 'Disponible según la configuración actual');
  return <section className="roulette-operations" aria-label="Resumen operativo"><div className="roulette-operations-heading"><div><p className="eyebrow">OPERACIÓN DE CAMPAÑA</p><h2>Resumen operativo</h2><p>{context}</p></div><span className={`status status-${effectiveStatus}`}>{statusText}</span></div><div className="roulette-operation-metrics"><Metric label="Giros completados" value={spinSummary?.completed ?? null} /><Metric label="Premios ganados" value={spinSummary?.prizesWon ?? null} /><Metric label="Claims generados" value={claims?.generated ?? null} /><Metric label="Claims canjeados" value={claims?.redeemed ?? null} /><Metric label="Pendientes de canje" value={claims?.pending ?? null} />{limited.length > 0 && <Metric label="Stock limitado" value={`${available} con stock · ${soldOut} agotado${soldOut === 1 ? '' : 's'}`} />}</div><div className="roulette-quick-actions" aria-label="Acciones rápidas"><button type="button" className="primary" onClick={onTest}>Probar experiencia</button><a href={publicUrl} target="_blank" rel="noreferrer">Abrir experiencia</a><ExperienceQrModal slug={slug} label="Ver QR" /><a href="#configuration">Configurar</a><a href="#inventory">Inventario</a><a href="#results">Resultados</a></div></section>;
}
function Metric({ label, value }: { label: string; value: number | string | null | undefined }) { return <div className="roulette-operation-metric"><small>{label}</small><strong>{value === null ? '—' : value === undefined ? '—' : value}</strong></div>; }
