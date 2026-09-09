import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Roulette3DPreview } from './Roulette3DPreview';
import { apiRequest } from '../../../shared/api/client';
import { experiencesApi } from '../../experiences/api';
import type { Experience } from '../../experiences/types';
import type { RoulettePrize as Prize } from '../types';
import { useRouletteDraft } from '../hooks/useRouletteDraft';
import { ParticipationControls } from './ParticipationControls';

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
export function RouletteEditor({
  org,
  id,
  redemptionAvailable = false,
  canEdit = true,
  canAdjustInventory = true,
}: {
  org: string;
  id: string;
  redemptionAvailable?: boolean;
  canEdit?: boolean;
  canAdjustInventory?: boolean;
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
      <RouletteEditorContent org={org} id={id} redemptionAvailable={redemptionAvailable} />
    </div>
  );
}
function RouletteEditorContent({ org, id, redemptionAvailable }: { org: string; id: string; redemptionAvailable: boolean }) {
  const navigate = useNavigate();
  const [item, setItem] = useState<Experience>();
  const [inventory, setInventory] = useState<Inventory[]>([]);
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
  useEffect(() => {
    if (!org) return;
    apiRequest<Experience & { draftConfig: unknown }>(`/experiences/${id}`, org)
      .then((experience) => {
        reset(experience.draftConfig);
        setItem(experience);
        void reloadInventory();
      })
      .catch(() => setError('No se pudo cargar la experiencia.'))
      .finally(() => setLoading(false));
  }, [org, id]);
  if (loading)
    return (
      <main className="page">
        <p>Cargando configuración…</p>
      </main>
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
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">EXPERIENCE / CONFIGURACIÓN</p>
          <h1>{item?.name}</h1>
        </div>
        <button
          className="secondary"
          onClick={() => navigate('/app/experiences')}
        >
          Volver
        </button>
      </div>
      <div className="editor-grid">
        <section className="card editor-panel">
          <h2>Configuración</h2>
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
          <ParticipationControls
            draft={draft}
            onChange={(participation) => setDraft({ ...draft, participation })}
          />
          <h3>Premios</h3>
          {draft.prizes.map((prize, index) => (
            <PrizeEditor
              key={prize.id}
              prize={prize}
              inventory={inventory.find((x) => x.prizeId === prize.id)}
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
          <div className="save-row">
            {dirty && <span className="dirty">Cambios sin guardar</span>}
            {message && <span className="success">{message}</span>}
            {error && <span className="error">{error}</span>}
            <button
              disabled={!valid || !dirty || saving}
              onClick={() => void save()}
            >
              {saving ? 'Guardando…' : 'Guardar borrador'}
            </button>
          </div>
        </section>
        <section className="card preview-panel">
          <h2>Preview 3D</h2>
          <Roulette3DPreview config={preview} />
        </section>
      </div>
      <section className="card inventory-panel">
        <h2>Gestión de premios</h2>
        <p>
          El stock se administra operativamente y no se reinicia al republicar.
        </p>
        {draft.prizes.map((prize) => {
          const entry = inventory.find((x) => x.prizeId === prize.id);
          return (
            <div className="inventory-row" key={prize.id}>
              <span>{prize.name}</span>
              <span>{prize.enabled === false ? 'Inactivo' : 'Activo'}</span>
              <span>Peso {prize.weight ?? 1}</span>
              <span>
                {entry?.stockMode === 'unlimited' ||
                prize.stockMode !== 'limited'
                  ? 'Ilimitado'
                  : `${entry?.stockAvailable ?? 0} disponibles`}
              </span>
              <span>{entry?.deliveredCount ?? 0} entregados</span>
              {prize.stockMode === 'limited' && (
                <>
                  <button
                    className="secondary"
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
                    className="secondary"
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
      {adjusting && (
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
            {adjustError && <p className="error">{adjustError}</p>}
            <button onClick={() => void adjust()}>Confirmar</button>
            <button className="secondary" onClick={() => setAdjusting(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
function PrizeEditor({
  prize,
  inventory,
  experienceId,
  organizationId,
  redemptionAvailable,
  onChange,
}: {
  prize: Prize;
  inventory?: Inventory;
  experienceId: string;
  organizationId: string;
  redemptionAvailable: boolean;
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
