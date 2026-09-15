import { useState } from 'react';
import { formatStoredUtcDateTime } from '../../dashboard/analytics-format';
import { experiencesApi, type PrizeClaim } from '../api';

export function ClaimsPanel({ experienceId, organizationId, canRedeem }: { experienceId: string; organizationId: string; canRedeem: boolean }) {
  const [code, setCode] = useState('');
  const [claim, setClaim] = useState<PrizeClaim>();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  async function search() { if (!code.trim()) return; setLoading(true); setMessage(''); try { const result = await experiencesApi.claims(experienceId, organizationId, code.trim()); setClaim(result.items[0]); if (!result.items[0]) setMessage('No encontramos un claim con ese código.'); } catch (error) { setMessage((error as Error).message); } finally { setLoading(false); } }
  async function redeem() { if (!claim || !canRedeem) return; setLoading(true); setMessage(''); try { setClaim(await experiencesApi.redeemClaim(experienceId, organizationId, claim.id)); } catch (error) { setMessage((error as Error).message); } finally { setLoading(false); } }
  return <section className="card claims-panel"><h2>Premios a canjear</h2><div className="claim-search"><input aria-label="Código de claim" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="7KQ9-W2MF" /><button type="button" onClick={() => void search()} disabled={loading || !code.trim()}>Buscar</button></div>{claim && <div className="claim-result"><p><strong>Premio:</strong> {claim.prizeName}</p><p><strong>Estado:</strong> {claim.status === 'active' ? 'Activo' : 'Canjeado'}</p><p><strong>Generado:</strong> {formatStoredUtcDateTime(claim.createdAt)}</p>{canRedeem && <button type="button" disabled={loading || claim.status !== 'active'} onClick={() => void redeem()}>{claim.status === 'active' ? 'Canjear premio' : 'Ya canjeado'}</button>}</div>}{message && <p className="field-help">{message}</p>}</section>;
}
