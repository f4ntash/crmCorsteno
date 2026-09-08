const CLAIM_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function generateClaimCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `${Array.from(bytes.slice(0, 8), (byte) => CLAIM_ALPHABET[byte % CLAIM_ALPHABET.length]).join('')}-${Array.from(bytes.slice(8), (byte) => CLAIM_ALPHABET[byte % CLAIM_ALPHABET.length]).join('')}`;
}
