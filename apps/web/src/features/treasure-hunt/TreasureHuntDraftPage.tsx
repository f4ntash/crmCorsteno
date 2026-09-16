import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { formatPublicationDate } from '../../shared/publication/status';
import { treasureHuntApi, type TreasureHuntDraft, type TreasureHuntDraftInput, type TreasureHuntDraftStep } from './api';
import './treasure-hunt-draft.css';

type Props = { org: string; organizationName?: string; campaignId?: string };
type SaveStatus = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';

function blankDraft(): TreasureHuntDraft {
  const now = new Date().toISOString();
  return {
    id: '', campaignId: '', organizationId: '', baseCampaignVersionId: null, basePublishedVersion: null,
    revision: 0, name: '', slug: '', description: '', progressionMode: 'SEQUENTIAL', steps: [], reward: null,
    issues: [], incomplete: true, readiness: 'INCOMPLETE', compilation: null, createdAt: now, updatedAt: now,
  };
}

function newStep(order: number): TreasureHuntDraftStep {
  const suffix = Math.random().toString(36).slice(2, 9);
  return { stepId: `step-${suffix}`, order, title: '', clue: '', triggerType: 'IMAGE_TARGET', triggerId: `target-${suffix}`, targetRef: null, targetStatus: 'PENDING', target: null };
}

function inputFromDraft(draft: TreasureHuntDraft): TreasureHuntDraftInput {
  return { name: draft.name, slug: draft.slug, description: draft.description, progressionMode: 'SEQUENTIAL', steps: draft.steps.map((step, index) => ({ ...step, order: index + 1 })), reward: draft.reward };
}

function errorText(error: unknown) {
  if (error instanceof ApiError && error.code === 'DRAFT_STALE') return 'El borrador cambió en otra sesión. Recargá para continuar.';
  if (error instanceof ApiError && error.details && Array.isArray(error.details)) return (error.details as Array<{ message?: string }>).map((issue) => issue.message).filter(Boolean).join(' ');
  if (error instanceof ApiError) return error.message;
  return 'No se pudo guardar el borrador. Intentá nuevamente.';
}

export function TreasureHuntDraftPage({ org, organizationName, campaignId }: Props) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<TreasureHuntDraft>(() => blankDraft());
  const [etag, setEtag] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(campaignId));
  const [message, setMessage] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(campaignId ? 'clean' : 'dirty');
  const [busyStep, setBusyStep] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [widthDraft, setWidthDraft] = useState<Record<string, string>>({});
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!campaignId) return;
    let active = true;
    setLoading(true);
    void treasureHuntApi.getDraft(org, campaignId).then((result) => {
      if (!active) return;
      setDraft(result.data.draft);
      setEtag(result.etag);
      setSaveStatus('clean');
    }).catch((error) => { if (active) setMessage(errorText(error)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [campaignId, org]);

  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    for (const step of draft.steps) {
      if (!draft.campaignId || !step.target) continue;
      void treasureHuntApi.previewTarget(org, draft.campaignId, step.stepId).then((blob) => {
        if (!active) return;
        const url = URL.createObjectURL(blob);
        urls.push(url);
        setPreviewUrls((current) => ({ ...current, [step.stepId]: url }));
      }).catch(() => undefined);
    }
    return () => { active = false; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [draft.campaignId, draft.steps.map((step) => `${step.stepId}:${step.targetRef}`).join('|'), org]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (saveStatus === 'dirty') { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveStatus]);

  const currentInput = useMemo(() => inputFromDraft(draft), [draft]);
  const update = <K extends keyof TreasureHuntDraft>(key: K, value: TreasureHuntDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaveStatus('dirty');
    setMessage('');
  };
  const updateStep = (stepId: string, patch: Partial<TreasureHuntDraftStep>) => update('steps', draft.steps.map((step) => step.stepId === stepId ? { ...step, ...patch } : step));
  const addStep = () => update('steps', [...draft.steps, newStep(draft.steps.length + 1)]);
  const removeStep = (stepId: string) => update('steps', draft.steps.filter((step) => step.stepId !== stepId).map((step, index) => ({ ...step, order: index + 1 })));
  const moveStep = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draft.steps.length) return;
    const steps = [...draft.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    update('steps', steps.map((step, stepIndex) => ({ ...step, order: stepIndex + 1 })));
  };
  const leave = () => {
    if (saveStatus === 'dirty' && !window.confirm('Hay cambios sin guardar. ¿Querés salir?')) return;
    navigate('/app/treasure-hunt');
  };
  const save = async () => {
    setSaveStatus('saving');
    setMessage('');
    try {
      if (!draft.id) {
        const result = await treasureHuntApi.create(org, { name: draft.name, slug: draft.slug, description: draft.description, progressionMode: 'SEQUENTIAL' });
        setDraft(result.data.draft);
        setEtag(result.etag);
        setSaveStatus('saved');
        navigate(`/app/treasure-hunt/${result.data.draft.campaignId}/draft`, { replace: true });
        return;
      }
      if (!etag) throw new Error('No se pudo obtener la revisión del borrador.');
      const result = await treasureHuntApi.saveDraft(org, draft.campaignId, currentInput, etag);
      setDraft(result.data.draft);
      setEtag(result.etag);
      setSaveStatus('saved');
    } catch (error) {
      setMessage(errorText(error));
      setSaveStatus('error');
    }
  };

  const upload = async (stepId: string, file: File | undefined) => {
    if (!file || !draft.id || !etag) return;
    setBusyStep(stepId); setMessage('');
    try {
      const width = Number(widthDraft[stepId] ?? 18);
      const result = await treasureHuntApi.uploadTarget(org, draft.campaignId, stepId, file, width, etag);
      setDraft(result.data.draft); setEtag(result.etag); setSaveStatus('clean');
    } catch (error) { setMessage(errorText(error)); } finally { setBusyStep(null); }
  };

  const removeTarget = async (stepId: string) => {
    if (!draft.id || !etag) return;
    setBusyStep(stepId); setMessage('');
    try {
      const result = await treasureHuntApi.removeTarget(org, draft.campaignId, stepId, etag);
      setDraft(result.data.draft); setEtag(result.etag); setSaveStatus('clean');
    } catch (error) { setMessage(errorText(error)); } finally { setBusyStep(null); }
  };

  const saveWidth = async (stepId: string) => {
    if (!draft.id || !etag) return;
    const width = Number(widthDraft[stepId]);
    if (!Number.isFinite(width) || width <= 0) { setMessage('El ancho físico debe ser mayor que 0 cm.'); return; }
    const current = draft.steps.find((step) => step.stepId === stepId)?.target?.physicalWidthCm;
    if (current === width) return;
    setBusyStep(stepId); setMessage('');
    try {
      const result = await treasureHuntApi.updateTargetWidth(org, draft.campaignId, stepId, width, etag);
      setDraft(result.data.draft); setEtag(result.etag); setSaveStatus('clean');
    } catch (error) { setMessage(errorText(error)); } finally { setBusyStep(null); }
  };

  const compile = async () => {
    if (!draft.id || !etag) return;
    setCompiling(true); setMessage('');
    try {
      const result = await treasureHuntApi.compile(org, draft.campaignId, etag);
      setDraft(result.data.draft); setEtag(result.etag); setSaveStatus('clean');
    } catch (error) { setMessage(errorText(error)); } finally { setCompiling(false); }
  };

  if (loading) return <main className="page access-state"><span className="loading-mark" />Cargando borrador…</main>;
  return <main className="page treasure-hunt-page treasure-hunt-editor-page">
    <div className="page-heading">
      <div><button type="button" className="back-link treasure-hunt-back-button" onClick={leave}>← Búsqueda del Tesoro</button><p className="eyebrow">EDITOR DE BORRADOR</p><h1>{draft.id ? 'Editar borrador' : 'Nueva búsqueda del tesoro'}</h1><p className="page-description">{organizationName ?? 'Organización actual'} · Solo lectura para versiones publicadas.</p></div>
      <span className="read-only-badge">Borrador sin publicar</span>
    </div>
    {message && <p className="error" role="alert">{message}</p>}
    <section className="card treasure-hunt-editor-section">
      <div className="workspace-section-heading"><div><p className="eyebrow">GENERAL</p><h2>Datos de la campaña</h2></div><span className="treasure-hunt-editor-state">Secuencial</span></div>
      <div className="treasure-hunt-form-grid">
        <label>Nombre<input value={draft.name} maxLength={120} onChange={(event) => update('name', event.target.value)} placeholder="Búsqueda de septiembre" /></label>
        <label>Slug<input value={draft.slug} maxLength={80} onChange={(event) => update('slug', event.target.value.toLowerCase())} placeholder="busqueda-septiembre" /></label>
        <label className="treasure-hunt-form-wide">Descripción<textarea value={draft.description} maxLength={2000} onChange={(event) => update('description', event.target.value)} rows={3} /></label>
      </div>
    </section>
    <section className="card treasure-hunt-editor-section">
      <div className="workspace-section-heading"><div><p className="eyebrow">RECORRIDO</p><h2>Pasos</h2><p className="field-help">Los pasos se guardan en el orden mostrado. La imagen objetivo se configurará antes de publicar.</p></div><button type="button" className="button button-secondary" onClick={addStep}>Agregar paso</button></div>
      <div className="treasure-hunt-draft-steps">{draft.steps.map((step, index) => <article className="treasure-hunt-draft-step" key={step.stepId}>
        <div className="treasure-hunt-draft-step-heading"><strong>Paso {index + 1}</strong><span>{step.target ? 'Imagen objetivo guardada' : 'Imagen objetivo pendiente'}</span></div>
        <div className="treasure-hunt-form-grid"><label>Título<input value={step.title} maxLength={160} onChange={(event) => updateStep(step.stepId, { title: event.target.value })} /></label><label className="treasure-hunt-form-wide">Pista<textarea value={step.clue} maxLength={1000} rows={2} onChange={(event) => updateStep(step.stepId, { clue: event.target.value })} /></label></div>
        <div className="treasure-hunt-target-editor">
          {previewUrls[step.stepId] && <img className="treasure-hunt-target-preview" src={previewUrls[step.stepId]} alt={`Vista previa del objetivo del Paso ${index + 1}`} />}
          <div className="treasure-hunt-target-fields"><label>Imagen objetivo<input type="file" accept="image/png,image/jpeg" disabled={!draft.id || saveStatus === 'dirty' || busyStep === step.stepId} onChange={(event) => { void upload(step.stepId, event.target.files?.[0]); event.currentTarget.value = ''; }} /><small>{saveStatus === 'dirty' ? 'Guardá el borrador antes de cargar una imagen.' : 'PNG o JPEG, hasta 10 MB. TraceAR no admite SVG/WebP.'}</small></label><label>Ancho físico (cm)<input type="number" min="0.1" max="1000" step="0.1" value={widthDraft[step.stepId] ?? String(step.target?.physicalWidthCm ?? 18)} disabled={!step.target || saveStatus === 'dirty' || busyStep === step.stepId} onChange={(event) => setWidthDraft((current) => ({ ...current, [step.stepId]: event.target.value }))} onBlur={() => void saveWidth(step.stepId)} /></label><div className="treasure-hunt-target-meta">{step.target ? <><strong>{step.target.originalFilename}</strong><span>{Math.round(step.target.byteSize / 1024)} KB · {step.target.widthPx}×{step.target.heightPx}px · {step.target.status}</span><button type="button" className="button button-quiet" disabled={saveStatus === 'dirty' || busyStep === step.stepId} onClick={() => void removeTarget(step.stepId)}>Quitar imagen</button></> : <span>Seleccioná una imagen para asociarla a este paso.</span>}</div></div>
        </div>
        <div className="treasure-hunt-draft-step-footer"><small>Imagen objetivo · {step.triggerId}</small><div><button type="button" className="button button-quiet" disabled={index === 0} onClick={() => moveStep(index, -1)} aria-label={`Subir paso ${index + 1}`}>↑</button><button type="button" className="button button-quiet" disabled={index === draft.steps.length - 1} onClick={() => moveStep(index, 1)} aria-label={`Bajar paso ${index + 1}`}>↓</button><button type="button" className="button button-quiet" onClick={() => removeStep(step.stepId)}>Eliminar</button></div></div>
      </article>)}</div>
      {!draft.steps.length && <p className="field-help">Todavía no hay pasos. Podés guardar el borrador incompleto.</p>}
    </section>
    <section className="card treasure-hunt-editor-section">
      <div className="workspace-section-heading"><div><p className="eyebrow">PREMIO</p><h2>Configuración del premio</h2></div></div>
      {draft.reward ? <div className="treasure-hunt-form-grid"><label>Tipo<select value="COUPON" disabled><option value="COUPON">Cupón</option></select></label><label>Nombre<input value={draft.reward.name} maxLength={160} onChange={(event) => update('reward', { ...draft.reward!, name: event.target.value })} /></label><label>Valor o texto<input value={draft.reward.displayValue} maxLength={500} onChange={(event) => update('reward', { ...draft.reward!, displayValue: event.target.value })} /></label><label>Expiración (horas)<input type="number" min={1} max={8760} value={draft.reward.expiresInSeconds === null ? '' : draft.reward.expiresInSeconds / 3600} onChange={(event) => update('reward', { ...draft.reward!, expiresInSeconds: event.target.value ? Number(event.target.value) * 3600 : null })} /><small>Horas después de obtenerlo.</small></label><button type="button" className="button button-quiet" onClick={() => update('reward', null)}>Quitar premio</button></div> : <div><p className="field-help">Esta campaña no tiene premio configurado.</p><button type="button" className="button button-secondary" onClick={() => update('reward', { type: 'COUPON', name: '', displayValue: '', expiresInSeconds: null })}>Configurar premio cupón</button></div>}
    </section>
    <section className={`treasure-hunt-draft-readiness ${draft.readiness === 'READY' ? 'is-ready' : ''}`} aria-live="polite"><strong>{draft.readiness === 'READY' ? 'Listo para publicar' : 'Borrador incompleto'}</strong>{draft.issues.length > 0 && <ul>{draft.issues.map((issue) => <li key={`${issue.code}-${issue.stepId ?? ''}`}>{issue.message}</li>)}</ul>}{draft.compilation?.status === 'COMPILED' && <small>Compilado para la revisión {draft.compilation.draftRevision} · {draft.compilation.compilerVersion}</small>}</section>
    <div className="treasure-hunt-editor-actions"><span>{saveStatus === 'dirty' ? 'Cambios sin guardar' : saveStatus === 'saving' ? 'Guardando…' : saveStatus === 'saved' ? `Borrador guardado · ${formatPublicationDate(draft.updatedAt)}` : 'Sin cambios'}</span><button type="button" className="button button-secondary" onClick={leave}>Salir</button><button type="button" className="button button-secondary" disabled={!draft.id || saveStatus === 'dirty' || compiling || Boolean(busyStep) || draft.steps.some((step) => !step.target)} onClick={() => void compile()}>{compiling ? 'Compilando…' : 'Compilar objetivos'}</button><button type="button" className="button" disabled={saveStatus === 'saving' || compiling || Boolean(busyStep)} onClick={() => void save()}>{saveStatus === 'saving' ? 'Guardando…' : 'Guardar borrador'}</button></div>
  </main>;
}
