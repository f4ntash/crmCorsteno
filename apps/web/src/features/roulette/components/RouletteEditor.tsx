import { useEffect, useMemo, useState } from 'react';
import { calculateEffectiveRouletteProbabilities, ROULETTE_LIMITS } from '@corsteno/types';
import { apiRequest } from '../../../shared/api/client';
import { experiencesApi } from '../../experiences/api';
import type { Experience } from '../../experiences/types';
import type { RouletteConfig, RoulettePrize as Prize } from '../types';
import { useRouletteDraft } from '../hooks/useRouletteDraft';
import { ParticipationControls } from './ParticipationControls';
import { previewExperienceUrl } from '../../../shared/runtime/publicExperienceUrl';
import { ProbabilitySummary } from './ProbabilitySummary';
import { AssetPicker } from '../../assets/AssetPicker';
import { Roulette3DPreview } from './Roulette3DPreview';
import { Dialog } from '../../../shared/ui/Dialog';

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
type StepId = 'configuration' | 'prizes' | 'roulette' | 'appearance' | 'publish';
type ReadinessIssue = { code?: string; path?: string; message: string };
type PublicationState = {
  status?: string;
  accessStatus?: string;
  hasUnpublishedChanges?: boolean;
  readinessIssues?: ReadinessIssue[];
  canPublish?: boolean;
  publishing?: boolean;
  message?: string;
  error?: string;
};

const steps: Array<{ id: StepId; label: string; description: string }> = [
  { id: 'configuration', label: 'Configuración', description: 'Participación y límites' },
  { id: 'prizes', label: 'Premios', description: 'Premios, stock y canje' },
  { id: 'roulette', label: 'Ruleta', description: 'Segmentos y distribución' },
  { id: 'appearance', label: 'Apariencia', description: 'Marca y mensajes' },
  { id: 'publish', label: 'Publicar', description: 'Revisión final' },
];

function statusLabel(value?: string) {
  return value === 'published' || value === 'active' ? 'Publicada' : value === 'scheduled' ? 'Programada' : value === 'expired' ? 'Finalizada' : 'Borrador';
}

function fieldError(errors: Record<string, string>, path: string) {
  return errors[path];
}

export function RouletteEditor({
  org,
  id,
  redemptionAvailable = false,
  brandingAvailable = false,
  canEdit = true,
  canAdjustInventory = true,
  canManageAssets = false,
  onUnpublishedChange,
  onDirtyChange,
  onDraftSaved,
  publication,
  onPublish,
}: {
  org: string;
  id: string;
  redemptionAvailable?: boolean;
  brandingAvailable?: boolean;
  canEdit?: boolean;
  canAdjustInventory?: boolean;
  canManageAssets?: boolean;
  onUnpublishedChange?: (dirty: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onDraftSaved?: (draft: RouletteConfig) => void;
  publication?: PublicationState;
  onPublish?: () => void;
}) {
  return (
    <div className={!canEdit || !canAdjustInventory ? 'permission-readonly' : ''} aria-readonly={!canEdit || !canAdjustInventory}>
      {!canEdit && <p className="field-help">Esta experiencia es de solo lectura para tu rol.</p>}
      <RouletteEditorContent
        org={org}
        id={id}
        redemptionAvailable={redemptionAvailable}
        brandingAvailable={brandingAvailable}
        canEdit={canEdit}
        canAdjustInventory={canAdjustInventory}
        canManageAssets={canManageAssets}
        onUnpublishedChange={onUnpublishedChange}
        onDirtyChange={onDirtyChange}
        onDraftSaved={onDraftSaved}
        publication={publication}
        onPublish={onPublish}
      />
    </div>
  );
}

function RouletteEditorContent({
  org,
  id,
  redemptionAvailable,
  brandingAvailable,
  canEdit,
  canAdjustInventory,
  canManageAssets,
  onUnpublishedChange,
  onDirtyChange,
  onDraftSaved,
  publication,
  onPublish,
}: {
  org: string;
  id: string;
  redemptionAvailable: boolean;
  brandingAvailable: boolean;
  canEdit: boolean;
  canAdjustInventory: boolean;
  canManageAssets: boolean;
  onUnpublishedChange?: (dirty: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onDraftSaved?: (draft: RouletteConfig) => void;
  publication?: PublicationState;
  onPublish?: () => void;
}) {
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [operations, setOperations] = useState<Record<string, PrizeOperations>>({});
  const [operationsReady, setOperationsReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState<StepId>('configuration');
  const [validationRequested, setValidationRequested] = useState(false);
  const [inputValidity, setInputValidityState] = useState<Record<string, boolean>>({});
  const [adjusting, setAdjusting] = useState<{ prizeId: string; name: string; sign: 1 | -1 } | null>(null);
  const [amount, setAmount] = useState('1');
  const [adjustError, setAdjustError] = useState('');
  const { draft, setDraft, reset, resize, updateSegment, updatePrize, addPrize, dirty, valid, validationErrors } = useRouletteDraft();

  function setInputValidity(key: string, next: boolean) {
    setInputValidityState((current) => current[key] === next ? current : { ...current, [key]: next });
  }

  async function reloadInventory() {
    try {
      const result = await experiencesApi.inventory(id, org);
      setInventory(result.items);
    } catch {
      setInventory([]);
    }
  }

  async function reloadOperations() {
    const [spinsResult, claimsResult] = await Promise.allSettled([
      experiencesApi.spins(id, org, { limit: 1 }),
      experiencesApi.claims(id, org),
    ]);
    const next: Record<string, PrizeOperations> = {};
    if (spinsResult.status === 'fulfilled') Object.entries(spinsResult.value.summary.byPrize ?? {}).forEach(([prizeId, wins]) => { next[prizeId] = { wins, claimsGenerated: 0, claimsRedeemed: 0, claimsPending: 0 }; });
    if (claimsResult.status === 'fulfilled') Object.entries(claimsResult.value.summary.byPrize ?? {}).forEach(([prizeId, counts]) => { next[prizeId] = { ...(next[prizeId] ?? { wins: 0 }), claimsGenerated: counts.generated, claimsRedeemed: counts.redeemed, claimsPending: counts.pending }; });
    setOperations(next);
    setOperationsReady(true);
  }

  useEffect(() => {
    onDirtyChange?.(dirty);
    onUnpublishedChange?.(dirty);
  }, [dirty, onDirtyChange, onUnpublishedChange]);

  useEffect(() => {
    const syncWorkspaceHash = () => {
      if (window.location.hash === '#configuration') setStep('configuration');
      if (window.location.hash === '#inventory') setStep('prizes');
    };
    syncWorkspaceHash();
    window.addEventListener('hashchange', syncWorkspaceHash);
    return () => window.removeEventListener('hashchange', syncWorkspaceHash);
  }, []);

  useEffect(() => {
    if (!org) return;
    setLoading(true);
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

  const fieldErrors = validationErrors;
  const formValid = valid && Object.values(inputValidity).every(Boolean);
  const firstInvalidStep: StepId = Object.keys(fieldErrors).some((key) => key.startsWith('participation')) ? 'configuration' : Object.keys(fieldErrors).some((key) => key.startsWith('prizes')) ? 'prizes' : Object.keys(fieldErrors).some((key) => key.startsWith('segments')) ? 'roulette' : 'appearance';
  const preview = useMemo(() => ({ ...draft, effects: { sound: true, vibration: true, celebration: true, ...draft.effects } }), [draft]);
  const previewUrl = previewExperienceUrl(id, org, window.location.href);
  const probability = calculateEffectiveRouletteProbabilities(draft, new Map(inventory.map((item) => [item.prizeId, item])));
  const probabilityByPrize = new Map(probability.outcomes.filter((outcome) => outcome.prizeId !== null).map((outcome) => [outcome.prizeId!, outcome.probability]));

  if (loading) return <div className="loading-state" aria-live="polite"><span className="loading-mark" />Cargando configuración…</div>;

  async function save() {
    setValidationRequested(true);
    setMessage('');
    setError('');
    if (!canEdit || !dirty || saving) return;
    if (!formValid) {
      setStep(firstInvalidStep);
      setError('Revisá los campos marcados antes de guardar.');
      return;
    }
    setSaving(true);
    try {
      await apiRequest(`/experiences/${id}`, org, { method: 'PATCH', body: JSON.stringify({ draft_config: draft }) });
      reset(draft);
      onDraftSaved?.(draft);
      onUnpublishedChange?.(false);
      setMessage('Borrador guardado.');
    } catch (caught) {
      setError((caught as Error).message);
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
      const result = await experiencesApi.adjustInventory(id, org, adjusting.prizeId, adjusting.sign * value);
      setInventory((items) => items.map((entry) => entry.prizeId === adjusting.prizeId ? { ...entry, ...result.item } : entry));
      setAdjusting(null);
      setAdjustError('');
    } catch (caught) {
      setAdjustError((caught as Error).message);
    }
  }

  function openTest() {
    if (dirty) {
      setMessage('Guardá el borrador para probar los últimos cambios.');
      return;
    }
    window.open(previewUrl, '_blank', 'noopener,noreferrer');
  }

  function updateContent(key: 'title' | 'intro' | 'spinButtonLabel' | 'winMessage' | 'noPrizeMessage', value: string) {
    setDraft({ ...draft, content: { ...draft.content, [key]: value } });
  }

  function updateCta(key: 'label' | 'url', value: string) {
    setDraft({ ...draft, resultCta: { ...draft.resultCta, enabled: draft.resultCta?.enabled ?? false, [key]: value } });
  }

  function goToIssue(path?: string) {
    setStep(path?.startsWith('prizes') ? 'prizes' : path?.startsWith('segments') ? 'roulette' : path?.startsWith('content') || path?.startsWith('branding') || path?.startsWith('resultCta') ? 'appearance' : 'configuration');
  }

  function previewPanel() {
    return <section className="card roulette-preview-panel">
      <div className="workspace-section-heading"><div><p className="eyebrow">VISTA PREVIA</p><h3>Experiencia pública</h3><p className="field-help">Previsualización del borrador; no publica cambios.</p></div><button type="button" className="secondary" onClick={openTest}>Probar experiencia</button></div>
      <div className="campaign-preview" style={{ backgroundColor: preview.backgroundColor, ...(preview.branding?.backgroundImageUrl ? { backgroundImage: `linear-gradient(#0d141bcc,#0d141bcc), url("${preview.branding.backgroundImageUrl}")` } : {}) }}>
        {preview.branding?.logoUrl && <img src={preview.branding.logoUrl} alt="Logo de la experiencia" />}
        <strong>{preview.content?.title || 'Ruleta de premios'}</strong>
        <span>{preview.content?.intro || 'Girá la ruleta y descubrí tu premio.'}</span>
        <Roulette3DPreview config={preview} />
      </div>
    </section>;
  }

  return <div className="roulette-workspace roulette-step-workspace">
    <div className="roulette-editor-topline"><div><p className="eyebrow">EDITOR DE CAMPAÑA</p><h3>Configuración de Roulette</h3><p className="field-help">Avanzá por cada sección. Tus cambios se mantienen hasta guardar el borrador.</p></div><div className="roulette-save-status" aria-live="polite">{dirty ? <span className="dirty">Cambios sin guardar</span> : message ? <span className="success">{message}</span> : <span>Sin cambios pendientes</span>}</div></div>
    <nav className="roulette-step-nav" aria-label="Pasos de configuración">
      {steps.map((item, index) => <button key={item.id} type="button" className={step === item.id ? 'active' : ''} aria-current={step === item.id ? 'step' : undefined} onClick={() => setStep(item.id)}><span className="roulette-step-number">{index + 1}</span><span><strong>{item.label}</strong><small>{item.description}</small></span></button>)}
    </nav>
    {(error || !formValid && validationRequested) && <p className="alert alert-danger" role="alert">{error || 'Hay campos pendientes de corregir antes de guardar.'}</p>}

    <section className="roulette-step-panel" hidden={step !== 'configuration'} aria-labelledby="roulette-step-configuration">
      <div className="step-panel-heading"><p className="eyebrow">PASO 1</p><h4 id="roulette-step-configuration">Configuración</h4><p>Definí cuántas veces puede participar una persona. Los valores vacíos mantienen el límite sin restricción.</p></div>
      <ParticipationControls draft={draft} showValidation={validationRequested} onValidityChange={(next) => setInputValidity('participation', next)} onChange={(participation) => setDraft({ ...draft, participation })} />
    </section>

    <section className="roulette-step-panel" hidden={step !== 'prizes'} aria-labelledby="roulette-step-prizes">
      <div className="step-panel-heading"><p className="eyebrow">PASO 2</p><h4 id="roulette-step-prizes">Premios</h4><p>Administrá los resultados, su disponibilidad y la operación de canje desde una vista compacta.</p></div>
      <div className="prize-list-heading"><div><strong>{draft.prizes.length} {draft.prizes.length === 1 ? 'premio configurado' : 'premios configurados'}</strong><small>El stock inicial pertenece al borrador; el inventario operativo se ajusta por separado.</small></div>{draft.prizes.length < 5 && canEdit && <button type="button" className="secondary" onClick={addPrize}>+ Agregar premio</button>}</div>
      <div className="roulette-prize-list">
        {draft.prizes.map((prize, index) => <PrizeEditor key={prize.id} prize={prize} inventory={inventory.find((item) => item.prizeId === prize.id)} operations={operations[prize.id]} operationsReady={operationsReady} probability={probabilityByPrize.get(prize.id)} experienceId={id} organizationId={org} redemptionAvailable={redemptionAvailable} canEdit={canEdit} canManageAssets={canManageAssets} showValidation={validationRequested} onValidityChange={(next) => setInputValidity(`prize:${prize.id}`, next)} onChange={(next) => updatePrize(index, next)} />)}
      </div>
    </section>

    <section className="roulette-step-panel" hidden={step !== 'roulette'} aria-labelledby="roulette-step-roulette">
      <div className="step-panel-heading"><p className="eyebrow">PASO 3</p><h4 id="roulette-step-roulette">Ruleta</h4><p>Ordená los segmentos y asigná el resultado que corresponde a cada uno.</p></div>
      <div className="roulette-step-grid"><div className="roulette-step-editor">
        <label className="compact-field"><span>Cantidad de segmentos</span><select aria-label="Cantidad de segmentos" value={draft.segments.length} disabled={!canEdit} onChange={(event) => resize(Number(event.target.value))}>{[6, 7, 8, 9, 10].map((count) => <option key={count}>{count}</option>)}</select><small>Elegí entre 6 y 10 segmentos.</small></label>
        <div className="segment-list">{draft.segments.map((segment, index) => <div className="segment-editor" key={segment.id}><strong>Segmento {index + 1}</strong><label><span>Resultado</span><select value={segment.prizeId ?? ''} disabled={!canEdit} aria-label={`Resultado del segmento ${index + 1}`} onChange={(event) => updateSegment(index, 'prizeId', event.target.value)}><option value="">Sin premio</option>{draft.prizes.map((prize) => <option key={prize.id} value={prize.id}>{prize.name}</option>)}</select></label><label><span>Color</span><input type="color" value={segment.color} disabled={!canEdit} aria-label={`Color del segmento ${index + 1}`} onChange={(event) => updateSegment(index, 'color', event.target.value)} /></label></div>)}</div>
        <ProbabilitySummary draft={draft} inventory={inventory} valid={valid} />
      </div>{step === 'roulette' && previewPanel()}</div>
    </section>

    <section className="roulette-step-panel" hidden={step !== 'appearance'} aria-labelledby="roulette-step-appearance">
      <div className="step-panel-heading"><p className="eyebrow">PASO 4</p><h4 id="roulette-step-appearance">Apariencia</h4><p>Personalizá la experiencia pública con la marca y los textos que ya soporta Roulette.</p></div>
      <div className="roulette-appearance-grid"><div className="roulette-appearance-editor">
        <section className="appearance-section"><div className="appearance-section-heading"><h5>Branding &amp; Content</h5>{!brandingAvailable && <p className="field-help">Disponible en planes con Branding y CTA avanzados.</p>}</div><div className="branding-upload-grid"><div><span className="field-label">Logo</span><AssetPicker org={org} value={draft.branding?.logoUrl} onChange={(url) => setDraft({ ...draft, branding: { ...draft.branding, logoUrl: url } })} categories={['logo', 'image']} canUpload={canEdit && canManageAssets && brandingAvailable} disabled={!canEdit || !brandingAvailable} label="Elegir logo" /></div><div><span className="field-label">Imagen de fondo</span><AssetPicker org={org} value={draft.branding?.backgroundImageUrl} onChange={(url) => setDraft({ ...draft, branding: { ...draft.branding, backgroundImageUrl: url } })} categories={['background', 'image']} canUpload={canEdit && canManageAssets && brandingAvailable} disabled={!canEdit || !brandingAvailable} label="Elegir fondo" /></div></div><p className="field-help">Los campos vacíos usan los textos actuales del runtime. Los cambios se aplican al publicar.</p>
          <div className="appearance-copy-fields">
            <CopyField label="Título de la experiencia" value={draft.content?.title ?? ''} placeholder="Ruleta de premios" maxLength={ROULETTE_LIMITS.title} error={validationRequested ? fieldError(fieldErrors, 'content.title') : undefined} disabled={!canEdit || !brandingAvailable} onChange={(value) => updateContent('title', value)} />
            <CopyField label="Intro e instrucciones" value={draft.content?.intro ?? ''} placeholder="Girá la ruleta y descubrí tu premio." maxLength={ROULETTE_LIMITS.intro} multiline error={validationRequested ? fieldError(fieldErrors, 'content.intro') : undefined} disabled={!canEdit || !brandingAvailable} onChange={(value) => updateContent('intro', value)} />
            <CopyField label="Texto del botón de giro" value={draft.content?.spinButtonLabel ?? ''} placeholder="Girar" maxLength={ROULETTE_LIMITS.spinButtonLabel} error={validationRequested ? fieldError(fieldErrors, 'content.spinButtonLabel') : undefined} disabled={!canEdit || !brandingAvailable} onChange={(value) => updateContent('spinButtonLabel', value)} />
            <CopyField label="Mensaje de premio" value={draft.content?.winMessage ?? ''} placeholder="¡GANASTE!" maxLength={ROULETTE_LIMITS.resultMessage} error={validationRequested ? fieldError(fieldErrors, 'content.winMessage') : undefined} disabled={!canEdit || !brandingAvailable} onChange={(value) => updateContent('winMessage', value)} />
            <CopyField label="Mensaje sin premio" value={draft.content?.noPrizeMessage ?? ''} placeholder="¡GRACIAS POR JUGAR!" maxLength={ROULETTE_LIMITS.resultMessage} error={validationRequested ? fieldError(fieldErrors, 'content.noPrizeMessage') : undefined} disabled={!canEdit || !brandingAvailable} onChange={(value) => updateContent('noPrizeMessage', value)} />
          </div>
        </section>
        <div className="appearance-control-grid"><label className="compact-field"><span>Color de fondo</span><input type="color" value={draft.backgroundColor} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, backgroundColor: event.target.value })} /><small>Se usa como fallback cuando no hay imagen.</small></label><fieldset><legend>Efectos</legend>{(['sound', 'vibration', 'celebration'] as const).map((key) => <label key={key}><input type="checkbox" checked={preview.effects[key]} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, effects: { ...preview.effects, [key]: event.target.checked } })} />{key === 'sound' ? 'Sonido' : key === 'vibration' ? 'Vibración' : 'Celebración'}</label>)}</fieldset></div>
        <fieldset className="result-cta-fieldset" disabled={!canEdit}><legend>Después del premio</legend><label><input type="checkbox" checked={draft.resultCta?.enabled ?? false} onChange={(event) => setDraft({ ...draft, resultCta: { enabled: event.target.checked, label: draft.resultCta?.label ?? 'Ver producto', url: draft.resultCta?.url ?? '' } })} />Mostrar botón</label>{draft.resultCta?.enabled && <div className="copy-field-grid"><CopyField label="Texto del botón" value={draft.resultCta.label ?? ''} maxLength={ROULETTE_LIMITS.ctaLabel} error={validationRequested ? fieldError(fieldErrors, 'resultCta.label') : undefined} disabled={!canEdit} onChange={(value) => updateCta('label', value)} /><CopyField label="Destino" value={draft.resultCta.url ?? ''} type="url" placeholder="https://ejemplo.com" error={validationRequested ? fieldError(fieldErrors, 'resultCta.url') : undefined} disabled={!canEdit} onChange={(value) => updateCta('url', value)} /></div>}</fieldset>
      </div>{step === 'appearance' && previewPanel()}</div>
    </section>

    <section className="roulette-step-panel" hidden={step !== 'publish'} aria-labelledby="roulette-step-publish">
      <div className="step-panel-heading"><p className="eyebrow">PASO 5</p><h4 id="roulette-step-publish">Publicar</h4><p>Revisá el estado actual y publicá usando la validación y el ciclo de vida existentes.</p></div>
      <div className="publish-step-content"><div className="publish-step-status"><span className={`status status-${publication?.status ?? 'draft'}`}>{statusLabel(publication?.status)}</span><strong>{publication?.hasUnpublishedChanges ? 'Hay cambios de borrador pendientes' : 'No hay cambios pendientes'}</strong><p className="field-help">La validación definitiva se realiza en el servidor con las mismas reglas de publicación.</p></div>{publication?.readinessIssues?.length ? <div className="readiness-area" role="alert"><strong>Antes de publicar</strong><ul>{publication.readinessIssues.map((issue, index) => <li key={`${issue.path}-${index}`}><button type="button" className="link" onClick={() => goToIssue(issue.path)}>{issue.message}</button></li>)}</ul></div> : <p className="field-help">Cuando el borrador esté listo, podés publicarlo. Una experiencia incompleta sigue siendo guardable como borrador.</p>}{publication?.error && <p className="error" role="alert">{publication.error}</p>}{publication?.message && <p className="success" role="status">{publication.message}</p>}<div className="publish-step-actions">{canEdit && onPublish && <button type="button" disabled={!formValid || publication?.publishing || publication?.canPublish === false} onClick={onPublish}>{publication?.publishing ? 'Publicando…' : 'Publicar experiencia'}</button>}<button type="button" className="secondary" onClick={openTest}>Probar experiencia</button></div></div>
    </section>

    <div className="save-row roulette-save-row">{message && <span className="success" role="status">{message}</span>}{error && <span className="error" role="alert">{error}</span>}<button type="button" disabled={!canEdit || !dirty || saving} onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar borrador'}</button></div>

    <section id="inventory" className="card inventory-panel roulette-inventory-panel"><div className="workspace-section-heading"><div><p className="eyebrow">OPERACIÓN</p><h3>Inventario en vivo</h3><p className="field-help">Los ajustes cambian el saldo actual; republicar no lo reinicia.</p></div><button type="button" className="link" onClick={() => setStep('prizes')}>Volver a premios</button></div>{draft.prizes.map((prize) => { const entry = inventory.find((item) => item.prizeId === prize.id); const ops = operations[prize.id]; return <div className="inventory-row" key={prize.id}><span className="inventory-prize-name">{prize.iconUrl && <img src={prize.iconUrl} alt="" width="32" height="32" />}{prize.name}</span><span>{prize.enabled === false ? 'Inactivo' : 'Activo'}</span><span>Peso {prize.weight ?? 1}</span><span>{entry?.stockMode === 'unlimited' || (entry?.stockMode === undefined && prize.stockMode !== 'limited') ? 'Ilimitado' : `${entry?.stockAvailable ?? 0} disponibles`}</span><span>{entry?.deliveredCount ?? 0} ganados</span>{operationsReady && ops && <span className="inventory-claim-summary">{ops.claimsGenerated} claims · {ops.claimsPending} pendientes · {ops.claimsRedeemed} canjeados</span>}{prize.stockMode === 'limited' && <><button type="button" className="secondary" disabled={!canAdjustInventory} onClick={() => { setAdjusting({ prizeId: prize.id, name: prize.name, sign: 1 }); setAmount('1'); }}>Agregar stock</button><button type="button" className="secondary" disabled={!canAdjustInventory} onClick={() => { setAdjusting({ prizeId: prize.id, name: prize.name, sign: -1 }); setAmount('1'); }}>Retirar stock</button></>}</div>; })}</section>

    {adjusting && canAdjustInventory && <div className="adjust-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-adjust-title"><div className="card"><h2 id="inventory-adjust-title">{adjusting.sign > 0 ? 'Agregar' : 'Retirar'} stock · {adjusting.name}</h2><label>Cantidad<input autoFocus type="text" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} aria-describedby="inventory-adjust-help" /></label>{(() => { const current = inventory.find((entry) => entry.prizeId === adjusting.prizeId)?.stockAvailable ?? 0; const change = Number(amount); const next = Number.isInteger(change) ? current + adjusting.sign * change : current; return <p className="field-help" id="inventory-adjust-help">Stock actual: <strong>{current}</strong> → después: <strong>{next}</strong>{next < 0 && ' · No puede quedar negativo'}</p>; })()}{adjustError && <p className="error" role="alert">{adjustError}</p>}<button type="button" disabled={(() => { const current = inventory.find((entry) => entry.prizeId === adjusting.prizeId)?.stockAvailable ?? 0; const value = Number(amount); return !/^\d+$/.test(amount) || !Number.isInteger(value) || value < 1 || current + adjusting.sign * value < 0; })()} onClick={() => void adjust()}>Confirmar</button><button type="button" className="secondary" onClick={() => setAdjusting(null)}>Cancelar</button></div></div>}
  </div>;
}

function CopyField({ label, value, onChange, maxLength, placeholder, multiline = false, type = 'text', disabled = false, error }: { label: string; value: string; onChange: (value: string) => void; maxLength?: number; placeholder?: string; multiline?: boolean; type?: string; disabled?: boolean; error?: string }) {
  const id = `roulette-copy-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const errorId = `${id}-error`;
  return <label className="copy-field"><span>{label}</span>{multiline ? <textarea id={id} value={value} placeholder={placeholder} maxLength={maxLength} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={(event) => onChange(event.target.value)} /> : <input id={id} type={type} value={value} placeholder={placeholder} maxLength={maxLength} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={(event) => onChange(event.target.value)} />}<small>{maxLength ? `${value.length}/${maxLength} caracteres` : label === 'Peso' ? 'Número entero entre 1 y 1000.' : 'Campo opcional.'}</small>{error && <span className="field-error" id={errorId}>{error}</span>}</label>;
}

function PrizeEditor({ prize, inventory, operations, operationsReady, probability, experienceId, organizationId, redemptionAvailable, canEdit, canManageAssets, showValidation, onValidityChange, onChange }: { prize: Prize; inventory?: Inventory; operations?: PrizeOperations; operationsReady: boolean; probability?: number; experienceId: string; organizationId: string; redemptionAvailable: boolean; canEdit: boolean; canManageAssets: boolean; showValidation: boolean; onValidityChange: (valid: boolean) => void; onChange: (prize: Prize) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(prize.name);
  const [weight, setWeight] = useState(String(prize.weight ?? 1));
  const [initialStock, setInitialStock] = useState(String(prize.initialStock ?? 0));
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const errors = useMemo(() => ({ name: !name.trim() ? 'Ingresá un nombre.' : name.trim().length > ROULETTE_LIMITS.prizeName ? `Usá hasta ${ROULETTE_LIMITS.prizeName} caracteres.` : '', weight: !/^\d+$/.test(weight) || Number(weight) < 1 || Number(weight) > ROULETTE_LIMITS.weight ? `Ingresá un peso entero entre 1 y ${ROULETTE_LIMITS.weight}.` : '', stock: prize.stockMode === 'limited' && (!/^\d+$/.test(initialStock) || Number(initialStock) > ROULETTE_LIMITS.stock) ? 'Ingresá un stock inicial entero entre 0 y 1.000.000.000.' : '' }), [name, weight, initialStock, prize.stockMode]);
  const validFields = !errors.name && !errors.weight && !errors.stock;
  useEffect(() => onValidityChange(validFields), [validFields, onValidityChange]);
  useEffect(() => { setName(prize.name); setWeight(String(prize.weight ?? 1)); setInitialStock(String(prize.initialStock ?? 0)); setError(''); setSuccess(''); }, [open, prize.id, prize.name, prize.weight, prize.initialStock]);

  function updateName(value: string) { setName(value); if (value.trim() && value.trim().length <= ROULETTE_LIMITS.prizeName) onChange({ ...prize, name: value.trim() }); }
  function updateWeight(value: string) { setWeight(value); if (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= ROULETTE_LIMITS.weight) onChange({ ...prize, weight: Number(value) }); }
  function updateStock(value: string) { setInitialStock(value); if (/^\d+$/.test(value) && Number(value) <= ROULETTE_LIMITS.stock) onChange({ ...prize, initialStock: Number(value) }); }
  async function upload(file: File) {
    setError(''); setSuccess('');
    if (file.type !== 'image/png' && file.type !== 'image/svg+xml') { setError('Solo se aceptan PNG o SVG.'); return; }
    setIsUploading(true);
    try { const result = await experiencesApi.uploadAsset(experienceId, organizationId, file) as { url: string }; onChange({ ...prize, iconUrl: result.url }); setSuccess('Ícono cargado.'); } catch (caught) { setError((caught as Error).message); } finally { setIsUploading(false); }
  }
  const stockLimited = (inventory?.stockMode ?? prize.stockMode ?? 'unlimited') === 'limited';
  const stockAvailable = inventory?.stockAvailable ?? prize.initialStock ?? 0;
  const title = prize.name || 'Premio sin nombre';
  return <article className={`prize-summary-row${prize.enabled === false ? ' is-disabled' : ''}`}><div className="prize-summary-main"><div className="prize-summary-icon">{prize.iconUrl ? <img src={prize.iconUrl} alt="" /> : <span aria-hidden="true">○</span>}</div><div><strong>{title}</strong><span>{prize.enabled === false ? 'Desactivado' : stockLimited ? `${stockAvailable} disponibles` : 'Stock ilimitado'}</span></div></div><div className="prize-summary-stat"><small>Probabilidad efectiva</small><strong>{probability === undefined ? '—' : `${probability.toFixed(1)}%`}</strong></div><div className="prize-summary-stat"><small>Operación</small><span>{operationsReady && operations ? `${operations.wins} ganados · ${operations.claimsPending} pendientes · ${operations.claimsRedeemed} canjeados` : 'Sin datos operativos'}</span></div><div className="prize-summary-state">{prize.enabled === false ? <span>Premio desactivado</span> : stockLimited && stockAvailable <= 0 ? <span className="warning">Agotado</span> : stockLimited && stockAvailable <= 3 ? <span className="warning">Stock bajo · {stockAvailable}</span> : <span>{stockLimited ? `Stock limitado · ${stockAvailable}` : 'Ilimitado'}</span>}</div><button type="button" className="secondary" disabled={!canEdit} onClick={() => setOpen(true)}>Editar</button><Dialog open={open} title={`Editar ${title}`} description="Los cambios quedan en el borrador hasta que los guardes." onClose={() => setOpen(false)}><form onSubmit={(event) => { event.preventDefault(); if (!validFields) { onValidityChange(false); return; } setOpen(false); }}><CopyField label="Nombre del premio" value={name} maxLength={ROULETTE_LIMITS.prizeName} error={showValidation || open ? errors.name : undefined} disabled={!canEdit} onChange={updateName} /><CopyField label="Peso" value={weight} type="text" error={showValidation || open ? errors.weight : undefined} disabled={!canEdit} onChange={updateWeight} /><label className="compact-field"><span>Modo de stock</span><select value={prize.stockMode ?? 'unlimited'} disabled={!canEdit} onChange={(event) => onChange({ ...prize, stockMode: event.target.value as 'limited' | 'unlimited', initialStock: event.target.value === 'limited' ? prize.initialStock ?? 0 : undefined })}><option value="unlimited">Ilimitado</option><option value="limited">Limitado</option></select><small>El stock inicial no modifica el inventario ya publicado.</small></label>{prize.stockMode === 'limited' && <CopyField label="Stock inicial" value={initialStock} type="text" error={showValidation || open ? errors.stock : undefined} disabled={!canEdit} onChange={updateStock} />}<label className="checkbox-field"><input type="checkbox" checked={prize.enabled ?? true} disabled={!canEdit} onChange={(event) => onChange({ ...prize, enabled: event.target.checked })} /><span>Premio activo</span></label><label className="checkbox-field"><input type="checkbox" checked={prize.redemption?.enabled === true} disabled={!canEdit || !redemptionAvailable} onChange={(event) => onChange({ ...prize, redemption: { enabled: event.target.checked } })} /><span>Canje con código</span></label>{redemptionAvailable ? <small>Genera un código único cuando este premio sea ganado.</small> : <small>Disponible en planes con Canje de premios.</small>}{inventory && <small>Operativo: {inventory.stockMode === 'unlimited' ? 'ilimitado' : `${inventory.stockAvailable ?? 0} disponibles`} · {inventory.deliveredCount} entregados</small>}<small>Republicar no reinicia el stock.</small>{prize.iconUrl && <img className="prize-editor-icon" src={prize.iconUrl} alt="Ícono actual" width="48" height="48" />}<label className="secondary upload-label">{isUploading ? 'Subiendo…' : 'Subir ícono'}<input type="file" accept="image/png,image/svg+xml" disabled={!canEdit || !canManageAssets} hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ''; }} /></label>{!canManageAssets && <small>Necesitás permiso para administrar assets.</small>}{error && <span className="error" role="alert">{error}</span>}{success && <span className="success" role="status">{success}</span>}<div className="dialog-actions"><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancelar</button><button type="submit" disabled={!validFields || !canEdit}>Listo</button></div></form></Dialog></article>;
}
