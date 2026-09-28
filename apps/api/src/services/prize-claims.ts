const CLAIM_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CLAIM_DIGITS = '0123456789';

export function generateClaimCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte, index) => {
    const alphabet = index % 2 === 0 ? CLAIM_LETTERS : CLAIM_DIGITS;
    return alphabet[byte % alphabet.length];
  }).join('');
}
