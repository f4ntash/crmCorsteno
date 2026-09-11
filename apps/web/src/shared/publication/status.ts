export type PublicationStatus =
  | 'draft'
  | 'published'
  | 'active'
  | 'scheduled'
  | 'expired'
  | 'paused'
  | 'unavailable';

export type PublicationStatusView = {
  status: PublicationStatus;
  label: string;
};

const labels: Record<PublicationStatus, string> = {
  draft: 'Borrador',
  published: 'Publicada',
  active: 'Activa',
  scheduled: 'Programada',
  expired: 'Vencida',
  paused: 'Pausada',
  unavailable: 'Sin acceso',
};

export function publicationStatusView(effectiveStatus: string | null | undefined, accessStatus?: string | null): PublicationStatusView {
  if (accessStatus === 'no_access') return { status: 'unavailable', label: labels.unavailable };
  const status = effectiveStatus && effectiveStatus in labels ? effectiveStatus as PublicationStatus : 'unavailable';
  return { status, label: labels[status] };
}

export function formatPublicationDate(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha inválida' : date.toLocaleString('es-AR');
}

export function toDateTimeLocal(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function fromDateTimeLocal(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function validateAvailabilityWindow(startsAt: string, endsAt: string) {
  if (startsAt && Number.isNaN(new Date(startsAt).getTime())) return 'La fecha de inicio no es válida.';
  if (endsAt && Number.isNaN(new Date(endsAt).getTime())) return 'La fecha de fin no es válida.';
  if (startsAt && endsAt && new Date(startsAt).getTime() >= new Date(endsAt).getTime()) return 'La fecha de fin debe ser posterior al inicio.';
  return undefined;
}
