const MAX_CLOCK_SKEW_SECONDS = 300;

function hex(bytes: ArrayBuffer) { return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join(''); }
async function digest(body: string) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))); }
async function hmac(secret: string, value: string) { return hex(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), new TextEncoder().encode(value))); }
function equal(left: string, right: string) { if (left.length !== right.length) return false; let result = 0; for (let i = 0; i < left.length; i += 1) result |= left.charCodeAt(i) ^ right.charCodeAt(i); return result === 0; }

export async function verifyFinderSignature(request: Request, body: string, secret: string | undefined, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!secret) return false;
  const timestamp = Number(request.headers.get('X-Finder-Timestamp'));
  const signature = request.headers.get('X-Finder-Signature') ?? '';
  if (!Number.isInteger(timestamp) || Math.abs(nowSeconds - timestamp) > MAX_CLOCK_SKEW_SECONDS || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const bodyHash = await digest(body);
  const canonical = `${request.method.toUpperCase()}\n${new URL(request.url).pathname}\n${timestamp}\n${bodyHash}`;
  return equal(signature.toLowerCase(), await hmac(secret, canonical));
}

export async function signFinderRequest(method: string, path: string, body: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const bodyHash = await digest(body);
  const canonical = `${method.toUpperCase()}\n${path}\n${timestamp}\n${bodyHash}`;
  return { timestamp: String(timestamp), signature: await hmac(secret, canonical) };
}
