import { useEffect, useState, type ReactNode } from 'react';
import { formatPublicationDate, fromDateTimeLocal, publicationStatusView, toDateTimeLocal, validateAvailabilityWindow } from './status';

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

  async function saveAvailability() {
    if (!onSaveAvailability || readOnly || availabilitySaving || localAction) return;
    const validationError = validateAvailabilityWindow(startInput, endInput);
    if (validationError) {
      setAvailabilityError(validationError);
      setAvailabilityMessage('');
      return;
    }
    setAvailabilityError('');
    setAvailabilityMessage('');
    setLocalAction(true);
    try {
      const saved = await onSaveAvailability(fromDateTimeLocal(startInput), fromDateTimeLocal(endInput));
      if (saved !== false) setAvailabilityMessage('Disponibilidad actualizada.');
    } catch (saveError) {
      setAvailabilityError(saveError instanceof Error ? saveError.message : 'No se pudo actualizar la disponibilidad.');
    } finally {
      setLocalAction(false);
    }
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

  const actionBusy = publishing || localAction;
  return <section className="publication-control" aria-label="Publicación y disponibilidad">
    {showStatus && <div className="publication-control-heading"><div><p className="eyebrow">PUBLICACIÓN</p><h3>Disponibilidad</h3></div><span className={`status status-${view.status}`}>{view.label}</span></div>}
    {!showStatus && <p className="eyebrow">PUBLICACIÓN</p>}
    {hasUnpublishedChanges && <p className="publication-change-note">Hay cambios de configuración sin publicar.</p>}
    {(startsAt || endsAt || onSaveAvailability) && <div className="publication-dates"><span><small>Inicio</small>{startsAt ? formatPublicationDate(startsAt) : 'Inmediato'}</span><span><small>Fin</small>{endsAt ? formatPublicationDate(endsAt) : 'Sin vencimiento'}</span></div>}
    {onSaveAvailability && canEditAvailability && !readOnly && <details className="publication-availability"><summary>Editar disponibilidad</summary><p className="field-help">Dejá el inicio vacío para comenzar de inmediato y el fin vacío para no establecer vencimiento.</p><div className="publication-availability-form"><label>Inicio<input type="datetime-local" value={startInput} onChange={(event) => setStartInput(event.target.value)} /></label><label>Fin<input type="datetime-local" value={endInput} onChange={(event) => setEndInput(event.target.value)} /></label><div className="publication-availability-actions"><button type="button" className="secondary" disabled={actionBusy || availabilitySaving} onClick={() => { setStartInput(''); setEndInput(''); setAvailabilityError(''); }}>Limpiar fechas</button><button type="button" disabled={actionBusy || availabilitySaving} onClick={() => void saveAvailability()}>{availabilitySaving || localAction ? 'Guardando…' : 'Guardar disponibilidad'}</button></div></div></details>}
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
