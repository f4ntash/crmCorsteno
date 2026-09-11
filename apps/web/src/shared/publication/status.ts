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

export function getBrowserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Zona horaria local';
}

export function formatPublicationDate(
  value: string | null | undefined,
  locale = 'es-AR',
  timeZone = getBrowserTimeZone(),
) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha inválida';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(date);
}

export function publicationStatusExplanation(
  effectiveStatus: string | null | undefined,
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
  accessStatus?: string | null,
  locale = 'es-AR',
  timeZone = getBrowserTimeZone(),
) {
  if (accessStatus === 'no_access') return 'El acceso no está disponible.';
  if (accessStatus === 'expired') return 'El acceso está vencido.';
  if (accessStatus === 'scheduled') return 'El acceso está programado.';

  switch (publicationStatusView(effectiveStatus, accessStatus).status) {
    case 'draft':
      return 'Todavía no está publicada.';
    case 'paused':
      return 'La experiencia está pausada.';
    case 'scheduled':
      return startsAt ? `Comienza el ${formatPublicationDate(startsAt, locale, timeZone)}.` : 'Comienza cuando se publique.';
    case 'expired':
      return endsAt ? `Finalizó el ${formatPublicationDate(endsAt, locale, timeZone)}.` : 'La experiencia ya no está disponible.';
    case 'active':
      return endsAt ? `Disponible hasta el ${formatPublicationDate(endsAt, locale, timeZone)}.` : 'Disponible ahora.';
    case 'published':
      return 'Publicada y disponible según la configuración actual.';
    case 'unavailable':
      return 'La experiencia no está disponible.';
  }

  return 'La experiencia no está disponible.';
}

export function canEditPublicationAvailability(canEditAvailability: boolean, readOnly: boolean) {
  return canEditAvailability && !readOnly;
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
