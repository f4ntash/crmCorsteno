import type { ReactNode } from 'react';

type ClipboardWriter = Pick<Clipboard, 'writeText'>;

export async function copyPublicExperienceUrl(publicUrl: string, clipboard?: ClipboardWriter) {
  const writer = clipboard ?? (typeof navigator === 'undefined' ? undefined : navigator.clipboard);
  if (!writer) return false;
  try {
    await writer.writeText(publicUrl);
    return true;
  } catch {
    return false;
  }
}

export function PublicExperienceActions({
  publicUrl,
  qrAction,
  onCopy,
  disabled = false,
  openLabel = 'Abrir experiencia',
  className = 'publication-actions',
}: {
  publicUrl: string;
  qrAction?: ReactNode;
  onCopy: () => void | Promise<void>;
  disabled?: boolean;
  openLabel?: string;
  className?: string | null;
}) {
  const actions = <>
      <a className="secondary publication-link" href={publicUrl} target="_blank" rel="noreferrer">{openLabel}</a>
      <button type="button" className="secondary" disabled={disabled} onClick={() => void onCopy()}>Copiar enlace</button>
      {qrAction}
  </>;
  return className ? <div className={className}>{actions}</div> : actions;
}
