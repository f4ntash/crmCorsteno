import { useEffect, useState, type ReactNode } from 'react';
import { canEditPublicationAvailability, formatPublicationDate, fromDateTimeLocal, getBrowserTimeZone, publicationStatusExplanation, publicationStatusView, toDateTimeLocal, validateAvailabilityWindow } from './status';

export type PublicationReadinessIssue = {
  code?: string;
  path?: string;
  message: string;
};

export type PublicationControlsProps = {
  status: string;
  accessStatus?: string | null;
  hasUnpublishedChanges: boolean;
  canPublish: boolean;
  onPublish?: () => void | Promise<void>;
  publishing?: boolean;
  readinessIssues?: PublicationReadinessIssue[];
  startsAt?: string | null;
  endsAt?: string | null;
  canEditAvailability?: boolean;
  availabilitySaving?: boolean;
  onSaveAvailability?: (startsAt: string | null, endsAt: string | null) => void | boolean | Promise<void | boolean>;
  publicUrl?: string;
  onTest?: () => void;
  qrAction?: ReactNode;
  onPause?: () => void | Promise<void>;
  onUnpublish?: () => void | Promise<void>;
  showStatus?: boolean;
  readOnly?: boolean;
  message?: string;
  error?: string;
};

export function PublicationControls({
  status,
  accessStatus,
  hasUnpublishedChanges,
  canPublish,
  onPublish,
  publishing = false,
  readinessIssues = [],
  startsAt = null,
  endsAt = null,
  canEditAvailability = false,
  availabilitySaving = false,
  onSaveAvailability,
  publicUrl,
  onTest,
  qrAction,
  onPause,
  onUnpublish,
  showStatus = true,
  readOnly = false,
  message,
  error,
}: PublicationControlsProps) {
  const view = publicationStatusView(status, accessStatus);
  const statusExplanation = publicationStatusExplanation(status, startsAt, endsAt, accessStatus);
  const localTimeZone = getBrowserTimeZone();
  const canChangeAvailability = Boolean(onSaveAvailability && canEditPublicationAvailability(canEditAvailability, readOnly));
  const [startInput, setStartInput] = useState(() => toDateTimeLocal(startsAt));
  const [endInput, setEndInput] = useState(() => toDateTimeLocal(endsAt));
  const [availabilityError, setAvailabilityError] = useState('');
  const [availabilityMessage, setAvailabilityMessage] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [localAction, setLocalAction] = useState(false);

  useEffect(() => {
    setStartInput(toDateTimeLocal(startsAt));
    setEndInput(toDateTimeLocal(endsAt));
  }, [startsAt, endsAt]);

  async function persistAvailability(nextStartsAt: string | null, nextEndsAt: string | null) {
    if (!onSaveAvailability || readOnly || availabilitySaving || localAction) return;
    const validationError = validateAvailabilityWindow(nextStartsAt ?? '', nextEndsAt ?? '');
    if (validationError) {
      setAvailabilityError(validationError);
      setAvailabilityMessage('');
      return;
    }
    setAvailabilityError('');
    setAvailabilityMessage('');
    setLocalAction(true);
    try {
      const saved = await onSaveAvailability(nextStartsAt, nextEndsAt);
      if (saved !== false) {
        setStartInput(toDateTimeLocal(nextStartsAt));
        setEndInput(toDateTimeLocal(nextEndsAt));
        setAvailabilityMessage('Disponibilidad actualizada.');
      }
    } catch (saveError) {
      setAvailabilityError(saveError instanceof Error ? saveError.message : 'No se pudo actualizar la disponibilidad.');
    } finally {
      setLocalAction(false);
    }
  }

  async function saveAvailability() {
    const validationError = validateAvailabilityWindow(startInput, endInput);
    if (validationError) {
      setAvailabilityError(validationError);
      setAvailabilityMessage('');
      return;
    }
    await persistAvailability(fromDateTimeLocal(startInput), fromDateTimeLocal(endInput));
  }

  async function startNow() {
    await persistAvailability(new Date().toISOString(), endsAt);
  }

  async function clearStart() {
    await persistAvailability(null, endsAt);
  }

  async function clearEnd() {
    await persistAvailability(startsAt, null);
  }

  async function copyPublicUrl() {
    if (!publicUrl || !navigator.clipboard) {
      setCopyMessage('No se pudo copiar el enlace.');
      return;
    }
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopyMessage('Enlace copiado.');
    } catch {
      setCopyMessage('No se pudo copiar el enlace.');
    }
  }

  const actionBusy = publishing || availabilitySaving || localAction;
  return <section className="publication-control" aria-label="Publicación y disponibilidad">
    {showStatus && <div className="publication-control-heading"><div><p className="eyebrow">PUBLICACIÓN</p><h3>Disponibilidad</h3></div><span className={`status status-${view.status}`}>{view.label}</span></div>}
    {!showStatus && <p className="eyebrow">PUBLICACIÓN</p>}
    <p className="publication-status-explanation">{statusExplanation}</p>
    {hasUnpublishedChanges && <p className="publication-change-note">Hay cambios de configuración sin publicar.</p>}
    {(startsAt || endsAt || onSaveAvailability) && <div className="publication-dates"><span><small>Inicio</small>{startsAt ? formatPublicationDate(startsAt) : 'Inmediato'}</span><span><small>Fin</small>{endsAt ? formatPublicationDate(endsAt) : 'Sin vencimiento'}</span></div>}
    {onSaveAvailability && <p className="publication-timezone">Hora local: {localTimeZone}</p>}
    {canChangeAvailability && (startsAt || endsAt) && <div className="publication-quick-actions" aria-label="Acciones rápidas de disponibilidad">
      {startsAt && view.status === 'scheduled' && <button type="button" className="secondary" disabled={actionBusy} onClick={() => void startNow()}>Empezar ahora</button>}
      {startsAt && view.status !== 'scheduled' && <button type="button" className="secondary" disabled={actionBusy} onClick={() => void clearStart()}>Quitar fecha de inicio</button>}
      {startsAt && view.status === 'scheduled' && <button type="button" className="secondary" disabled={actionBusy} onClick={() => void clearStart()}>Quitar fecha de inicio</button>}
      {endsAt && <button type="button" className="secondary" disabled={actionBusy} onClick={() => void clearEnd()}>Sin fecha de finalización</button>}
    </div>}
    {canChangeAvailability && <details className="publication-availability"><summary>Editar disponibilidad</summary><p className="field-help">Dejá el inicio vacío para comenzar de inmediato y el fin vacío para no establecer vencimiento. Las fechas se editan en tu zona horaria local.</p><div className="publication-availability-form"><label>Inicio<input type="datetime-local" value={startInput} onChange={(event) => setStartInput(event.target.value)} /></label><label>Fin<input type="datetime-local" value={endInput} onChange={(event) => setEndInput(event.target.value)} /></label><div className="publication-availability-actions"><button type="button" className="secondary" disabled={actionBusy} onClick={() => { setStartInput(''); setEndInput(''); setAvailabilityError(''); }}>Limpiar fechas</button><button type="button" disabled={actionBusy} onClick={() => void saveAvailability()}>{availabilitySaving || localAction ? 'Guardando…' : 'Guardar disponibilidad'}</button></div></div></details>}
    {readinessIssues.length > 0 && <div className="publication-readiness" role="alert"><strong>Antes de publicar</strong><ul>{readinessIssues.map((issue, index) => <li key={`${issue.code ?? 'issue'}-${issue.path ?? ''}-${index}`}>{issue.message}</li>)}</ul></div>}
    {(error || availabilityError) && <p className="error" role="alert">{error || availabilityError}</p>}
    {(message || availabilityMessage || copyMessage) && <p className="publication-feedback" role="status">{message || availabilityMessage || copyMessage}</p>}
    <div className="publication-actions">
      {canPublish && onPublish && !readOnly && <button type="button" disabled={!hasUnpublishedChanges || actionBusy} onClick={() => void onPublish()}>{publishing ? 'Publicando…' : 'Publicar'}</button>}
      {onPause && !readOnly && <button type="button" className="secondary" disabled={actionBusy} onClick={() => void onPause()}>Pausar</button>}
      {onUnpublish && !readOnly && <button type="button" className="secondary" disabled={actionBusy} onClick={() => void onUnpublish()}>Retirar publicación</button>}
      {publicUrl && <><a className="secondary publication-link" href={publicUrl} target="_blank" rel="noreferrer">Abrir experiencia</a><button type="button" className="secondary" disabled={actionBusy} onClick={() => void copyPublicUrl()}>Copiar enlace</button></>}
      {qrAction}
      {onTest && <button type="button" className="secondary" disabled={actionBusy} onClick={onTest}>Probar experiencia</button>}
    </div>
  </section>;
}
