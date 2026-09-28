export const CLAIM_QR_PREFIX = 'corsteno:claim:v1:';

export function normalizeClaimCode(value: string): string | null {
  const code = value.trim().toUpperCase().replace(/\s+/g, '');
  return code && code.length <= 64 && /^[A-Z0-9-]+$/.test(code) ? code : null;
}

const NEW_REDEEMABLE_CODE = /^[A-Za-z][0-9][A-Za-z][0-9][A-Za-z][0-9][A-Za-z][0-9]$/;
const GENERATED_LEGACY_CODE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/;
const SEEDED_LEGACY_CODE = /^CANONICAL-[0-9]{8}$/;

export function normalizeRedeemableClaimCode(value: string): string | null {
  if (NEW_REDEEMABLE_CODE.test(value)) return value.toUpperCase();

  // Keep previously issued 8-8 codes and canonical demo claims redeemable.
  const legacyCode = value.trim().toUpperCase().replace(/\s+/g, '');
  return GENERATED_LEGACY_CODE.test(legacyCode) || SEEDED_LEGACY_CODE.test(legacyCode)
    ? legacyCode
    : null;
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
