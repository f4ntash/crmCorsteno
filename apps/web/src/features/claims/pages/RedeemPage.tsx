import { FormEvent, useState } from 'react';
import { experiencesApi } from '../../experiences/api';

export function RedeemPage({ org }: { org: string }) {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage(''); setError('');
    try { const result = await experiencesApi.redeemByCode(org, code); setMessage(`Premio canjeado correctamente · ${result.prizeName}`); setCode(''); }
    catch (cause) { setError((cause as Error).message); }
  }
  return <main className="page"><div className="page-heading"><div><p className="eyebrow">OPERACIÓN</p><h1>Canjear premio</h1></div></div><form className="experience-card" onSubmit={submit}><label>Código<input value={code} onChange={(event) => setCode(event.target.value)} placeholder="KQV2BY3F-2CBTH9D5" autoFocus /></label><button disabled={!code.trim()}>Validar y canjear</button>{message && <p role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}</form></main>;
}
