import { useState } from 'react';
import { normalizeRedeemableClaimCode } from '@corsteno/types';
import { formatStoredUtcDateTime } from '../../dashboard/analytics-format';
import { experiencesApi, type PrizeClaim } from '../api';

export function ClaimsPanel({ experienceId, organizationId, canRedeem }: { experienceId: string; organizationId: string; canRedeem: boolean }) {
  const [code, setCode] = useState('');
  const [claim, setClaim] = useState<PrizeClaim>();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const normalizedCode = normalizeRedeemableClaimCode(code);
  const invalidCode = code.length > 0 && !normalizedCode;
  async function search() { if (!normalizedCode) return; setLoading(true); setMessage(''); setClaim(undefined); try { const result = await experiencesApi.claims(experienceId, organizationId, normalizedCode); setClaim(result.items[0]); if (!result.items[0]) setMessage('No encontramos un claim con ese código.'); } catch (error) { setMessage((error as Error).message); } finally { setLoading(false); } }
  async function redeem() { if (!claim || !canRedeem || !normalizeRedeemableClaimCode(code)) return; setLoading(true); setMessage(''); try { setClaim(await experiencesApi.redeemClaim(experienceId, organizationId, claim.id)); } catch (error) { setMessage((error as Error).message); } finally { setLoading(false); } }
  return <section className="card claims-panel"><h2>Premios a canjear</h2><div className="claim-search"><input aria-label="Código de claim" aria-invalid={invalidCode} aria-describedby="claim-code-format-help" value={code} onChange={(event) => { setCode(event.target.value.toUpperCase()); setClaim(undefined); setMessage(''); }} placeholder="A1B2C3D4" /><button type="button" onClick={() => void search()} disabled={loading || !normalizedCode}>Buscar</button></div><small id="claim-code-format-help" className={invalidCode ? 'field-error' : 'field-help'}>{invalidCode ? 'Usá A1B2C3D4 para códigos nuevos. También se aceptan claims anteriores.' : 'Nuevo formato: 4 letras y 4 números alternados (A1B2C3D4). Se aceptan códigos anteriores.'}</small>{claim && <div className="claim-result"><p><strong>Premio:</strong> {claim.prizeName}</p><p><strong>Estado:</strong> {claim.status === 'active' ? 'Activo' : 'Canjeado'}</p><p><strong>Generado:</strong> {formatStoredUtcDateTime(claim.createdAt)}</p>{canRedeem && <button type="button" disabled={loading || claim.status !== 'active' || !normalizedCode} onClick={() => void redeem()}>{claim.status === 'active' ? 'Canjear premio' : 'Ya canjeado'}</button>}</div>}{message && <p className="field-help">{message}</p>}</section>;
}
