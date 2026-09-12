export const PUBLIC_CHANNEL_TYPES = ['external_site', 'corsteno_site'] as const;

export function normalizeChannelUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) return null;
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '') || parsed.origin;
  } catch {
    return null;
  }
}

export function channelOrigin(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.hostname && !parsed.username && !parsed.password ? parsed.origin : null;
  } catch {
    return null;
  }
}
