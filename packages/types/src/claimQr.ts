export const CLAIM_QR_PREFIX = 'corsteno:claim:v1:';

export function normalizeClaimCode(value: string): string | null {
  const code = value.trim().toUpperCase().replace(/\s+/g, '');
  return code && code.length <= 64 && /^[A-Z0-9-]+$/.test(code) ? code : null;
}

export function encodeClaimQrPayload(code: string): string {
  const normalized = normalizeClaimCode(code);
  if (!normalized) throw new Error('Invalid claim code');
  return `${CLAIM_QR_PREFIX}${normalized}`;
}

export function decodeClaimQrPayload(value: string): string | null {
  const payload = value.trim();
  if (!payload.startsWith(CLAIM_QR_PREFIX)) return null;
  return normalizeClaimCode(payload.slice(CLAIM_QR_PREFIX.length));
}
