import { useEffect, useState } from 'react';
import { Roulette3DPreview } from './Roulette3DPreview';
import { apiRequest } from '../../../shared/api/client';
import { experiencesApi } from '../../experiences/api';
import type { Experience } from '../../experiences/types';
import type { RoulettePrize as Prize } from '../types';
import { useRouletteDraft } from '../hooks/useRouletteDraft';
import { ParticipationControls } from './ParticipationControls';
import { runtimeBaseUrl } from '../../../shared/runtime/publicExperienceUrl';
import { ProbabilitySummary } from './ProbabilitySummary';
import { calculateEffectiveRouletteProbabilities } from '@corsteno/types';
import { AssetPicker } from '../../assets/AssetPicker';

type Inventory = {
  prizeId: string;
  name: string;
  iconUrl: string | null;
  enabled: boolean;
  weight: number;
  stockMode: 'limited' | 'unlimited';
  stockAvailable: number | null;
  deliveredCount: number;
};
type PrizeOperations = { wins: number; claimsGenerated: number; claimsRedeemed: number; claimsPending: number };
export function RouletteEditor({
  org,
  id,
  redemptionAvailable = false,
  brandingAvailable = false,
  canEdit = true,
  canAdjustInventory = true,
  onDirtyChange,
}: {
  org: string;
  id: string;
  redemptionAvailable?: boolean;
  brandingAvailable?: boolean;
  canEdit?: boolean;
  canAdjustInventory?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  return (
    <div
      className={!canEdit || !canAdjustInventory ? 'permission-readonly' : ''}
      aria-readonly={!canEdit || !canAdjustInventory}
    >
      {!canEdit && (
        <p className="field-help">
          Esta experiencia es de solo lectura para tu rol.
        </p>
      )}
      <RouletteEditorContent org={org} id={id} redemptionAvailable={redemptionAvailable} brandingAvailable={brandingAvailable} canEdit={canEdit} canAdjustInventory={canAdjustInventory} onDirtyChange={onDirtyChange} />
    </div>
  );
}
function RouletteEditorContent({ org, id, redemptionAvailable, brandingAvailable, canEdit, canAdjustInventory, onDirtyChange }: { org: string; id: string; redemptionAvailable: boolean; brandingAvailable: boolean; canEdit: boolean; canAdjustInventory: boolean; onDirtyChange?: (dirty: boolean) => void }) {
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [operations, setOperations] = useState<Record<string, PrizeOperations>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [adjusting, setAdjusting] = useState<{
    prizeId: string;
    name: string;
    sign: 1 | -1;
  } | null>(null);
  const [amount, setAmount] = useState('1');
  const [adjustError, setAdjustError] = useState('');
  const {
    draft,
    setDraft,
    reset,
    resize,
    updateSegment,
    updatePrize,
    addPrize,
    dirty,
    valid,
  } = useRouletteDraft();
  const reloadInventory = () =>
    experiencesApi
      .inventory(id, org)
      .then((result) => setInventory(result.items))
      .catch(() => setInventory([]));
  const reloadOperations = () => Promise.allSettled([
    experiencesApi.spins(id, org, { limit: 1 }),
    experiencesApi.claims(id, org),
  ]).then(([spinsResult, claimsResult]) => {
    const next: Record<string, PrizeOperations> = {};
    if (spinsResult.status === 'fulfilled') Object.entries(spinsResult.value.summary.byPrize ?? {}).forEach(([prizeId, wins]) => { next[prizeId] = { wins, claimsGenerated: 0, claimsRedeemed: 0, claimsPending: 0 }; });
    if (claimsResult.status === 'fulfilled') Object.entries(claimsResult.value.summary.byPrize ?? {}).forEach(([prizeId, counts]) => { next[prizeId] = { ...(next[prizeId] ?? { wins: 0 }), claimsGenerated: counts.generated, claimsRedeemed: counts.redeemed, claimsPending: counts.pending }; });
    setOperations(next);
  });
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!org) return;
    apiRequest<Experience & { draftConfig: unknown }>(`/experiences/${id}`, org)
      .then((experience) => {
        reset(experience.draftConfig);
        void Promise.all([reloadInventory(), reloadOperations()]);
      })
      .catch(() => setError('No se pudo cargar la experiencia.'))
      .finally(() => setLoading(false));
  }, [org, id]);
  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [dirty]);
  if (loading)
    return (
      <div className="loading-state" aria-live="polite"><span className="loading-mark" />Cargando configuración…</div>
    );
  async function save() {
    if (!valid || !dirty || saving) return;
    setSaving(true);
    try {
      await apiRequest(`/experiences/${id}`, org, {
        method: 'PATCH',
        body: JSON.stringify({ draft_config: draft }),
      });
      reset(draft);
      setMessage('Borrador guardado.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function adjust() {
    const value = Number(amount);
    if (!Number.isInteger(value) || value < 1 || !adjusting) {
      setAdjustError('Ingresá una cantidad entera positiva.');
      return;
    }
    try {
      const result = await experiencesApi.adjustInventory(
        id,
        org,
        adjusting.prizeId,
        adjusting.sign * value,
      );
      setInventory((items) =>
        items.map((entry) =>
          entry.prizeId === adjusting.prizeId
            ? { ...entry, ...result.item }
            : entry,
        ),
      );
      setAdjusting(null);
      setAdjustError('');
    } catch (e) {
      setAdjustError((e as Error).message);
    }
  }
  const preview = {
    ...draft,
    effects: {
      sound: true,
      vibration: true,
      celebration: true,
      ...draft.effects,
    },
  };
  const previewUrl = `${runtimeBaseUrl}/test/experiences/${encodeURIComponent(id)}?org=${encodeURIComponent(org)}&returnTo=${encodeURIComponent(window.location.href)}`;
  const probabilityByPrize = new Map(calculateEffectiveRouletteProbabilities(draft, new Map(inventory.map((item) => [item.prizeId, item]))).outcomes.filter((outcome) => outcome.prizeId !== null).map((outcome) => [outcome.prizeId!, outcome.probability]));
  return (
    <div className="roulette-workspace">
      <div className="editor-grid roulette-config-grid">
        <section className="card editor-panel">
          <fieldset className="roulette-draft-fields" disabled={!canEdit}>
          <legend className="sr-only">Configuración de borrador</legend>
          <h3>Diseño</h3>
          <section className="branding-content-section">
            <h4>Branding &amp; Content</h4>
            {!brandingAvailable && <p className="field-help">Disponible en planes con Branding y CTA avanzados.</p>}
            <div className="branding-upload-grid">
              <div><span className="field-label">Logo</span><AssetPicker org={org} value={draft.branding?.logoUrl} onChange={(url) => setDraft({ ...draft, branding: { ...draft.branding, logoUrl: url } })} categories={['logo', 'image']} canUpload={canEdit && brandingAvailable} disabled={!canEdit || !brandingAvailable} label="Elegir logo" /></div>
              <div><span className="field-label">Imagen de fondo</span><AssetPicker org={org} value={draft.branding?.backgroundImageUrl} onChange={(url) => setDraft({ ...draft, branding: { ...draft.branding, backgroundImageUrl: url } })} categories={['background', 'image']} canUpload={canEdit && brandingAvailable} disabled={!canEdit || !brandingAvailable} label="Elegir fondo" /></div>
            </div>
            {(draft.branding?.logoUrl || draft.branding?.backgroundImageUrl) && <p className="field-help">Los assets cargados se aplican al runtime al publicar.</p>}
            <label>Título de la experiencia<input maxLength={120} disabled={!canEdit || !brandingAvailable} value={draft.content?.title ?? ''} placeholder="Ruleta de premios" onChange={(e) => setDraft({ ...draft, content: { ...draft.content, title: e.target.value } })} /></label>
            <label>Intro e instrucciones<textarea maxLength={500} disabled={!canEdit || !brandingAvailable} value={draft.content?.intro ?? ''} placeholder="Girá la ruleta y descubrí tu premio." onChange={(e) => setDraft({ ...draft, content: { ...draft.content, intro: e.target.value } })} /></label>
            <label>Texto del botón de giro<input maxLength={40} disabled={!canEdit || !brandingAvailable} value={draft.content?.spinButtonLabel ?? ''} placeholder="Girar" onChange={(e) => setDraft({ ...draft, content: { ...draft.content, spinButtonLabel: e.target.value } })} /></label>
            <div className="branding-copy-grid"><label>Mensaje de premio<input maxLength={240} disabled={!canEdit || !brandingAvailable} value={draft.content?.winMessage ?? ''} placeholder="¡GANASTE!" onChange={(e) => setDraft({ ...draft, content: { ...draft.content, winMessage: e.target.value } })} /></label><label>Mensaje sin premio<input maxLength={240} disabled={!canEdit || !brandingAvailable} value={draft.content?.noPrizeMessage ?? ''} placeholder="¡GRACIAS POR JUGAR!" onChange={(e) => setDraft({ ...draft, content: { ...draft.content, noPrizeMessage: e.target.value } })} /></label></div>
          </section>
          <label>
            Fondo
            <input
              type="color"
              value={draft.backgroundColor}
              onChange={(e) =>
                setDraft({ ...draft, backgroundColor: e.target.value })
              }
            />
          </label>
          <fieldset>
            <legend>Efectos</legend>
            {(['sound', 'vibration', 'celebration'] as const).map((key) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={preview.effects[key]}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      effects: { ...preview.effects, [key]: e.target.checked },
                    })
                  }
                />{' '}
                {key === 'sound'
                  ? 'Sonido'
                  : key === 'vibration'
                    ? 'Vibración'
                    : 'Celebración'}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Después del premio</legend>
            <label>
              <input
                type="checkbox"
                checked={draft.resultCta?.enabled ?? false}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    resultCta: {
                      enabled: e.target.checked,
                      label: draft.resultCta?.label ?? 'Ver producto',
                      url: draft.resultCta?.url ?? '',
                    },
                  })
                }
              />{' '}
              Mostrar botón
            </label>
            {draft.resultCta?.enabled && (
              <>
                <label>
                  Texto del botón
                  <input
                    value={draft.resultCta.label ?? ''}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        resultCta: {
                          ...draft.resultCta,
                          label: e.target.value,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  Destino
                  <input
                    type="url"
                    value={draft.resultCta.url ?? ''}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        resultCta: { ...draft.resultCta, url: e.target.value },
                      })
                    }
                  />
                </label>
              </>
            )}
          </fieldset>
          <div className="roulette-participation"><h3>Participación</h3><ParticipationControls
            draft={draft}
            onChange={(participation) => setDraft({ ...draft, participation })}
          /></div>
          <h3>Premios</h3><p className="field-help">El stock inicial pertenece al borrador. El inventario operativo en vivo se ajusta por separado.</p>
          {draft.prizes.map((prize, index) => (
            <PrizeEditor
              key={prize.id}
              prize={prize}
              inventory={inventory.find((x) => x.prizeId === prize.id)}
              operations={operations[prize.id]}
              probability={probabilityByPrize.get(prize.id)}
              experienceId={id}
              organizationId={org}
              redemptionAvailable={redemptionAvailable}
              onChange={(next) => updatePrize(index, next)}
            />
          ))}
          {draft.prizes.length < 5 && (
            <button type="button" className="secondary" onClick={addPrize}>
              + Agregar premio
            </button>
          )}
          <label>
            Segmentos
            <select
              value={draft.segments.length}
              onChange={(e) => resize(Number(e.target.value))}
            >
              {[6, 7, 8, 9, 10].map((count) => (
                <option key={count}>{count}</option>
              ))}
            </select>
          </label>
          {draft.segments.map((segment, index) => (
            <div className="segment-editor" key={segment.id}>
              <strong>Segmento {index + 1}</strong>
              <select
                value={segment.prizeId ?? ''}
                onChange={(e) =>
                  updateSegment(index, 'prizeId', e.target.value)
                }
              >
                <option value="">Sin premio</option>
                {draft.prizes.map((prize) => (
                  <option key={prize.id} value={prize.id}>
                    {prize.name}
                  </option>
                ))}
              </select>
              <input
                type="color"
                value={segment.color}
                onChange={(e) => updateSegment(index, 'color', e.target.value)}
              />
            </div>
          ))}
          <ProbabilitySummary draft={draft} inventory={inventory} valid={valid} />
          </fieldset><div className="save-row">
            {dirty && <span className="dirty">Cambios sin guardar</span>}
            {message && <span className="success">{message}</span>}
            {error && <span className="error">{error}</span>}
            <button
              disabled={!canEdit || !valid || !dirty || saving}
              onClick={() => void save()}
            >
              {saving ? 'Guardando…' : 'Guardar borrador'}
            </button>
          </div>
        </section>
        <section className="card preview-panel roulette-preview-panel">
          <h3>Vista previa 3D</h3><p className="field-help">Previsualización del borrador; no publica cambios.</p><button type="button" className="secondary" onClick={() => { if (dirty) { setMessage('Guardá el borrador para probar los últimos cambios.'); return; } window.open(previewUrl, '_blank', 'noopener,noreferrer'); }}>Probar experiencia</button>
          <div className="campaign-preview" style={{ backgroundColor: preview.backgroundColor, ...(preview.branding?.backgroundImageUrl ? { backgroundImage: `linear-gradient(#0d141bcc,#0d141bcc), url("${preview.branding.backgroundImageUrl}")` } : {}) }}>
            {preview.branding?.logoUrl && <img src={preview.branding.logoUrl} alt="Logo de la experiencia" />}
            {preview.content?.title && <strong>{preview.content.title}</strong>}
            {preview.content?.intro && <span>{preview.content.intro}</span>}
            <Roulette3DPreview config={preview} />
          </div>
        </section>
      </div>
      <section id="inventory" className="card inventory-panel">
        <div className="workspace-section-heading"><div><h3>Inventario operativo en vivo</h3><p className="field-help">Los ajustes cambian el saldo actual; republicar no lo reinicia.</p></div></div>
        {draft.prizes.map((prize) => {
          const entry = inventory.find((x) => x.prizeId === prize.id);
          return (
            <div className="inventory-row" key={prize.id}>
              <span className="inventory-prize-name">{prize.iconUrl && <img src={prize.iconUrl} alt="" width="32" height="32" />}{prize.name}</span>
              <span>{prize.enabled === false ? 'Inactivo' : 'Activo'}</span>
              <span>Peso {prize.weight ?? 1}</span>
              <span>
                {entry?.stockMode === 'unlimited' ||
                (entry?.stockMode === undefined && prize.stockMode !== 'limited')
                  ? 'Ilimitado'
                  : `${entry?.stockAvailable ?? 0} disponibles`}
              </span>
              <span>{entry?.deliveredCount ?? 0} ganados</span>
              {operations[prize.id] && <span className="inventory-claim-summary">{operations[prize.id]!.claimsGenerated} claims · {operations[prize.id]!.claimsPending} pendientes · {operations[prize.id]!.claimsRedeemed} canjeados</span>}
              {prize.stockMode === 'limited' && (
                <>
                  <button
                    className="secondary" disabled={!canAdjustInventory}
                    onClick={() => {
                      setAdjusting({
                        prizeId: prize.id,
                        name: prize.name,
                        sign: 1,
                      });
                      setAmount('1');
                    }}
                  >
                    Agregar stock
                  </button>
                  <button
                    className="secondary" disabled={!canAdjustInventory}
                    onClick={() => {
                      setAdjusting({
                        prizeId: prize.id,
                        name: prize.name,
                        sign: -1,
                      });
                      setAmount('1');
                    }}
                  >
                    Retirar stock
                  </button>
                </>
              )}
            </div>
          );
        })}
      </section>
      {adjusting && canAdjustInventory && (
        <div className="adjust-modal" role="dialog" aria-modal="true">
          <div className="card">
            <h2>
              {adjusting.sign > 0 ? 'Agregar' : 'Retirar'} stock ·{' '}
              {adjusting.name}
            </h2>
            <label>
              Cantidad
              <input
                autoFocus
                type="number"
                min="1"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            {(() => { const current = inventory.find((entry) => entry.prizeId === adjusting.prizeId)?.stockAvailable ?? 0; const change = Number(amount); const next = Number.isInteger(change) ? current + adjusting.sign * change : current; return <p className="field-help">Stock actual: <strong>{current}</strong> → después: <strong>{next}</strong>{next < 0 && ' · No puede quedar negativo'}</p>; })()}
            {adjustError && <p className="error">{adjustError}</p>}
            <button disabled={(() => { const current = inventory.find((entry) => entry.prizeId === adjusting.prizeId)?.stockAvailable ?? 0; const value = Number(amount); return !Number.isInteger(value) || value < 1 || current + adjusting.sign * value < 0; })()} onClick={() => void adjust()}>Confirmar</button>
            <button className="secondary" onClick={() => setAdjusting(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
function PrizeEditor({
  prize,
  inventory,
  experienceId,
  organizationId,
  redemptionAvailable,
  operations,
  probability,
  onChange,
}: {
  prize: Prize;
  inventory?: Inventory;
  experienceId: string;
  organizationId: string;
  redemptionAvailable: boolean;
  operations?: PrizeOperations;
  probability?: number;
  onChange: (prize: Prize) => void;
}) {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  async function upload(file: File) {
    setError('');
    setSuccess('');
    if (file.type !== 'image/png' && file.type !== 'image/svg+xml') {
      setError('Solo se aceptan PNG o SVG.');
      return;
    }
    setIsUploading(true);
    try {
      const result = (await experiencesApi.uploadAsset(
        experienceId,
        organizationId,
        file,
      )) as { url: string };
      onChange({ ...prize, iconUrl: result.url });
      setSuccess('Ícono cargado.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsUploading(false);
    }
  }
  return (
    <div className="prize-editor">
      <div className="prize-operations-summary"><div className="prize-operations-title">{prize.iconUrl && <img src={prize.iconUrl} alt="" width="32" height="32" />}<strong>{prize.name || 'Premio sin nombre'}</strong></div><span>{probability === undefined ? 'Sin posibilidad de salir' : `${probability.toFixed(1)}% de probabilidad efectiva`}</span><span>{prize.enabled === false ? 'Premio desactivado' : (inventory?.stockMode ?? prize.stockMode ?? 'unlimited') === 'limited' ? `Stock limitado: ${inventory?.stockAvailable ?? 0} restantes${(inventory?.stockAvailable ?? 0) <= 0 ? ' · Agotado' : (inventory?.stockAvailable ?? 0) <= 3 ? ' · Stock bajo' : ''}` : 'Stock ilimitado'}</span>{operations && <small>{operations.wins} ganados · {operations.claimsGenerated} claims · {operations.claimsPending} pendientes · {operations.claimsRedeemed} canjeados</small>}</div>
      <input
        value={prize.name}
        onChange={(e) => onChange({ ...prize, name: e.target.value })}
      />
      <label>
        Peso
        <input
          type="number"
          min="1"
          max="1000"
          value={prize.weight ?? 1}
          onChange={(e) =>
            onChange({
              ...prize,
              weight: Math.max(1, Number(e.target.value) || 1),
            })
          }
        />
      </label>
      <label>
        Modo de stock
        <select
          value={prize.stockMode ?? 'unlimited'}
          onChange={(e) =>
            onChange({
              ...prize,
              stockMode: e.target.value as 'limited' | 'unlimited',
              initialStock:
                e.target.value === 'limited'
                  ? (prize.initialStock ?? 0)
                  : undefined,
            })
          }
        >
          <option value="unlimited">Ilimitado</option>
          <option value="limited">Limitado</option>
        </select>
      </label>
      {prize.stockMode === 'limited' && (
        <label>
          Stock inicial
          <input
            type="number"
            min="0"
            max="1000000000"
            value={prize.initialStock ?? 0}
            onChange={(e) =>
              onChange({
                ...prize,
                initialStock: Math.max(0, Number(e.target.value) || 0),
              })
            }
          />
        </label>
      )}
      <label>
        <input
          type="checkbox"
          checked={prize.enabled ?? true}
          onChange={(e) => onChange({ ...prize, enabled: e.target.checked })}
        />{' '}
        Activo
      </label>
      <label>
        <input
          type="checkbox"
          checked={prize.redemption?.enabled === true}
          disabled={!redemptionAvailable}
          onChange={(e) => onChange({ ...prize, redemption: { enabled: e.target.checked } })}
        />{' '}
        Canje con código
      </label>
      {redemptionAvailable ? (
        <small>Genera un código único cuando este premio sea ganado.</small>
      ) : (
        <small>Disponible en planes con Canje de premios.</small>
      )}
      {inventory && (
        <small>
          Operativo:{' '}
          {inventory.stockMode === 'unlimited'
            ? 'ilimitado'
            : `${inventory.stockAvailable ?? 0} disponibles`}{' '}
          · {inventory.deliveredCount} entregados
        </small>
      )}
      <small>Republicar no reinicia el stock.</small>
      {prize.iconUrl && (
        <img src={prize.iconUrl} alt="Ícono actual" width="32" height="32" />
      )}
      <label className="secondary">
        {isUploading ? 'Subiendo…' : 'Subir ícono'}
        <input
          type="file"
          accept="image/png,image/svg+xml"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.currentTarget.value = '';
          }}
        />
      </label>
      {error && <span className="error">{error}</span>}
      {success && <span className="success">{success}</span>}
      <small>Mayor peso = más posibilidades de salir.</small>
    </div>
  );
}
