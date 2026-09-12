import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

export function isExternalUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

export function normalizeInternalPath(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function CtaLink({ url, children, className = 'site-button' }: { url: string; children: ReactNode; className?: string }) {
  if (isExternalUrl(url)) return <a className={className} href={url} target="_blank" rel="noreferrer">{children}</a>;
  return <Link className={className} to={normalizeInternalPath(url)}>{children}</Link>;
}
