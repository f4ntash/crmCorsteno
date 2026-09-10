import { describe, expect, it } from 'vitest';
import { decodeClaimQrPayload, encodeClaimQrPayload } from '@corsteno/types';

describe('claim QR payloads', () => {
  it('encodes and decodes only the versioned public claim identifier', () => {
    const code = 'ABCD2345-EFGH6789';
    expect(encodeClaimQrPayload(code)).toBe('corsteno:claim:v1:ABCD2345-EFGH6789');
    expect(decodeClaimQrPayload(encodeClaimQrPayload(code))).toBe(code);
    expect(decodeClaimQrPayload('corsteno:claim:v1:abcd2345-efgh6789')).toBe(code);
  });
  it('rejects malformed or unrelated QR values', () => {
    expect(decodeClaimQrPayload('https://example.com/claim/ABCD')).toBeNull();
    expect(decodeClaimQrPayload('corsteno:claim:v2:ABCD')).toBeNull();
    expect(decodeClaimQrPayload('corsteno:claim:v1:')).toBeNull();
    expect(decodeClaimQrPayload('corsteno:claim:v1:ABC/123')).toBeNull();
  });
  it('is deterministic for a recovered claim', () => {
    expect(encodeClaimQrPayload('ABCD2345-EFGH6789')).toBe(encodeClaimQrPayload('ABCD2345-EFGH6789'));
  });
});
