import { useCallback, useState } from 'react';
import { rouletteDraftFieldErrors } from '@corsteno/types';
import type { RouletteConfig, RoulettePrize, RouletteSegment } from '../types';

const palette = ['#D6B25E', '#79A7D3', '#9BC47D', '#C0A1D8', '#D88C8C', '#6FB6A8', '#E0A15B', '#8E9CC8', '#C98BBA', '#A6B66F'];

function defaultDraft(count = 6): RouletteConfig {
  const prizes = [{ id: `prize-${crypto.randomUUID()}`, name: 'Premio 1', enabled: true, weight: 1, stockMode: 'unlimited' as const }];
  return { schemaVersion: 1, backgroundColor: '#111111', prizes, segments: Array.from({ length: count }, (_, i) => ({ id: `seg-${crypto.randomUUID()}`, prizeId: prizes[0].id, color: palette[i] })) };
}

export function normalizeRouletteDraft(value: unknown): RouletteConfig {
  const x = value as Partial<RouletteConfig> | null;
  const old = Array.isArray(x?.segments) ? x.segments : [];
  const prizes = Array.isArray(x?.prizes) ? x.prizes.filter((p): p is RoulettePrize => !!p && typeof p === 'object' && typeof (p as RoulettePrize).id === 'string' && typeof (p as RoulettePrize).name === 'string' && !!(p as RoulettePrize).name.trim()).map((p) => ({ id: p.id, name: p.name, iconUrl: p.iconUrl, enabled: p.enabled ?? true, weight: p.weight ?? 1, stockMode: p.stockMode ?? (p.stockLimit !== undefined && p.stockLimit !== null ? 'limited' : 'unlimited'), initialStock: p.initialStock ?? (p.stockLimit ?? undefined), stockLimit: p.stockLimit, redemption: { enabled: p.redemption?.enabled === true } })) : [];
  const oldPrizes = [...new Set(old.map((s) => typeof s === 'object' && s ? String((s as { label?: string }).label ?? '') : '').filter(Boolean))].map((name) => ({ id: `prize-${crypto.randomUUID()}`, name, enabled: true, weight: 1, stockMode: 'unlimited' as const }));
  const finalPrizes = prizes.length ? prizes.slice(0, 5) : oldPrizes.length ? oldPrizes : defaultDraft().prizes;
  const byName = new Map(finalPrizes.map((p) => [p.name, p.id]));
  const segments = old.length >= 6 && old.length <= 10 ? old.filter((s): s is RouletteSegment => !!s && typeof s === 'object' && typeof (s as RouletteSegment).color === 'string').map((s) => ({ id: s.id || `seg-${crypto.randomUUID()}`, color: s.color, prizeId: s.prizeId ?? byName.get((s as { label?: string }).label ?? '') ?? null })) : [];
  const base = defaultDraft(Math.max(6, Math.min(10, segments.length || 6)));
  const fallbackSegments = base.segments.map((s) => ({ ...s, prizeId: finalPrizes[0]?.id ?? null }));
  const participation = (x?.participation ?? {}) as Partial<NonNullable<RouletteConfig['participation']>>;
  const branding = x?.branding && typeof x.branding === 'object' && !Array.isArray(x.branding) ? { logoUrl: x.branding.logoUrl ?? null, backgroundImageUrl: x.branding.backgroundImageUrl ?? null } : undefined;
  const content = x?.content && typeof x.content === 'object' && !Array.isArray(x.content) ? { title: x.content.title, intro: x.content.intro, spinButtonLabel: x.content.spinButtonLabel, winMessage: x.content.winMessage, noPrizeMessage: x.content.noPrizeMessage } : undefined;
  return { schemaVersion: 1, backgroundColor: typeof x?.backgroundColor === 'string' ? x.backgroundColor : base.backgroundColor, branding, content, prizes: finalPrizes, segments: segments.length ? segments : fallbackSegments, effects: x?.effects ?? { sound: true, vibration: true, celebration: true }, resultCta: x?.resultCta, participation: { maxSpinsPerDevice: participation.maxSpinsPerDevice ?? null, maxSpinsPerSession: participation.maxSpinsPerSession ?? null, cooldownSeconds: participation.cooldownSeconds ?? 0 } };
}

export function isValidRouletteDraft(draft: RouletteConfig) {
  return Object.keys(rouletteDraftFieldErrors(draft)).length === 0;
}

export function useRouletteDraft(initialValue?: unknown) {
  const [draft, setDraft] = useState<RouletteConfig>(() => normalizeRouletteDraft(initialValue));
  const [original, setOriginal] = useState(() => JSON.stringify(initialValue));
  const reset = useCallback((value: unknown) => { const normalized = normalizeRouletteDraft(value); setDraft(normalized); setOriginal(JSON.stringify(normalized)); }, []);
  const resize = useCallback((count: number) => setDraft((d) => { const segments = d.segments.slice(0, count); while (segments.length < count) segments.push({ id: `seg-${crypto.randomUUID()}`, prizeId: d.prizes[0]?.id ?? null, color: palette[segments.length] }); return { ...d, segments }; }), []);
  const updateSegment = useCallback((index: number, key: 'prizeId' | 'color', value: string) => setDraft((d) => ({ ...d, segments: d.segments.map((s, i) => i === index ? { ...s, [key]: key === 'prizeId' && value === '' ? null : value } : s) })), []);
  const updatePrize = useCallback((index: number, prize: RoulettePrize) => setDraft((d) => ({ ...d, prizes: d.prizes.map((p, i) => i === index ? prize : p) })), []);
  const addPrize = useCallback(() => setDraft((d) => ({ ...d, prizes: [...d.prizes, { id: `prize-${crypto.randomUUID()}`, name: `Premio ${d.prizes.length + 1}`, enabled: true, weight: 1, stockMode: 'unlimited' as const }] })), []);
  const removePrize = useCallback((index: number) => setDraft((d) => { const removed = d.prizes[index]?.id; return { ...d, prizes: d.prizes.filter((_, i) => i !== index), segments: d.segments.map((s) => s.prizeId === removed ? { ...s, prizeId: null } : s) }; }), []);
  return { draft, setDraft, reset, resize, updateSegment, updatePrize, addPrize, removePrize, dirty: JSON.stringify(draft) !== original, valid: isValidRouletteDraft(draft), validationErrors: rouletteDraftFieldErrors(draft) };
}
