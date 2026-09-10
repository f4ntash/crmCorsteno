import { FormEvent, useEffect, useRef, useState } from 'react';
import { decodeClaimQrPayload, normalizeClaimCode } from '@corsteno/types';
import { experiencesApi, type PrizeClaim } from '../../experiences/api';

type Detector = { detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>> };
type BarcodeWindow = Window & { BarcodeDetector?: new (options?: { formats?: string[] }) => Detector };

export function RedeemPage({ org, canRedeem = true }: { org: string; canRedeem?: boolean }) {
  const [code, setCode] = useState(''); const [claim, setClaim] = useState<PrizeClaim | null>(null);
  const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false); const [scannerError, setScannerError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null); const streamRef = useRef<MediaStream | null>(null);
  const lastScannedRef = useRef(''); const experienceIdRef = useRef('');
  const stopCamera = () => { streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; if (videoRef.current) videoRef.current.srcObject = null; };
  async function lookup(rawCode: string) {
    const normalized = normalizeClaimCode(rawCode); if (!normalized) { setError('Ingresá un código válido.'); return; }
    setLoading(true); setMessage(''); setError(''); setClaim(null); setCode(normalized);
    try { const result = await experiencesApi.lookupClaim(org, normalized); experienceIdRef.current = result.experienceId; setClaim(result.claim); }
    catch (cause) { setError((cause as Error).message); } finally { setLoading(false); }
  }
  async function handleScan(rawValue: string) {
    const scannedCode = decodeClaimQrPayload(rawValue);
    if (!scannedCode) { setScannerError('Este QR no es un código de premio válido.'); return; }
    if (lastScannedRef.current === scannedCode) { setScannerError('Este QR ya fue leído.'); setScanning(false); return; }
    lastScannedRef.current = scannedCode; setScanning(false); await lookup(scannedCode);
  }
  useEffect(() => {
    if (!scanning) { stopCamera(); return; } let cancelled = false; let frame = 0;
    const start = async () => {
      const BarcodeDetector = (window as BarcodeWindow).BarcodeDetector;
      if (!BarcodeDetector) { setScannerError('Tu navegador no puede leer QR desde la cámara. Usá el código manual.'); return; }
      if (!navigator.mediaDevices?.getUserMedia) { setScannerError('La cámara no está disponible. Usá el código manual.'); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        streamRef.current = stream; if (!videoRef.current) return; videoRef.current.srcObject = stream; await videoRef.current.play();
        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        const scan = async () => { if (cancelled || !videoRef.current) return; try { const value = (await detector.detect(videoRef.current))[0]?.rawValue; if (value) { await handleScan(value); return; } } catch { /* transient camera frame */ } frame = requestAnimationFrame(() => void scan()); };
        await scan();
      } catch (cause) { if (!cancelled) setScannerError((cause as DOMException).name === 'NotAllowedError' ? 'No permitiste el acceso a la cámara. Usá el código manual.' : 'No pudimos acceder a la cámara. Usá el código manual.'); }
    };
    void start(); return () => { cancelled = true; cancelAnimationFrame(frame); stopCamera(); };
  }, [scanning]);
  async function submit(event: FormEvent) { event.preventDefault(); await lookup(code); }
  async function redeem() { if (!claim || claim.status !== 'active' || !canRedeem || loading || !experienceIdRef.current) return; setLoading(true); setMessage(''); setError(''); try { setClaim(await experiencesApi.redeemClaim(experienceIdRef.current, org, claim.id)); setMessage(`Premio canjeado correctamente · ${claim.prizeName}`); } catch (cause) { setError((cause as Error).message); } finally { setLoading(false); } }
  return <main className="page"><div className="page-heading"><div><p className="eyebrow">OPERACIÓN</p><h1>Canjear premio</h1></div></div><section className="experience-card redeem-card"><div className="redeem-actions"><button type="button" onClick={() => { setScannerError(''); setScanning(true); }} disabled={loading || scanning}>Escanear QR</button><span>o ingresá el código manualmente</span></div>{scanning && <div className="qr-scanner" role="dialog" aria-label="Escanear QR"><video ref={videoRef} muted playsInline /><button type="button" className="button button-secondary" onClick={() => setScanning(false)}>Cerrar escáner</button>{scannerError && <p className="error" role="alert">{scannerError}</p>}<button type="button" className="button button-secondary" onClick={() => { setScanning(false); window.setTimeout(() => setScanning(true), 0); }}>Reintentar cámara</button></div>}<form onSubmit={submit}><label>Código<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="KQV2BY3F-2CBTH9D5" autoFocus /></label><button disabled={loading || !code.trim()}>Buscar código</button></form>{claim && <div className="claim-result"><p><strong>Premio:</strong> {claim.prizeName}</p><p><strong>Código:</strong> {claim.code}</p><p><strong>Estado:</strong> {claim.status === 'active' ? 'Activo' : 'Canjeado'}</p>{canRedeem && <button type="button" disabled={loading || claim.status !== 'active'} onClick={() => void redeem()}>{claim.status === 'active' ? 'Canjear premio' : 'Ya canjeado'}</button>}{!canRedeem && <p className="field-help">No tenés permiso para canjear premios.</p>}</div>}{message && <p role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}</section></main>;
}
