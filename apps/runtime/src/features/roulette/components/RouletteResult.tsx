import type { SpinResult } from '../../../api/publicExperiencesApi';
import type { Roulette3DConfig } from '@corsteno/roulette-3d';

export function RouletteResult({ result, config, onCta }: { result: SpinResult; config: Roulette3DConfig; onCta: () => void }) {
  const cta = config.resultCta;
  const message = result.prize ? config.content?.winMessage ?? '¡GANASTE!' : config.content?.noPrizeMessage ?? '¡GRACIAS POR JUGAR!';
  return <section className={`roulette-result-card ${result.prize ? 'is-win' : 'is-neutral'}`} aria-live="polite"><strong>{message}</strong>{result.prize?.iconUrl ? <img src={result.prize.iconUrl} alt="" width="112" height="112" /> : result.prize ? <div className="result-prize-fallback">{result.prize.name}</div> : <span className="result-neutral-copy">Tu participación quedó registrada.</span>}{result.prize && <h2>{result.prize.name}</h2>}{result.claim && <ClaimCode code={result.claim.code} />}{cta?.enabled && cta.label && cta.url && <a className="result-cta" href={cta.url} target="_blank" rel="noreferrer" onClick={onCta}>{cta.label}</a>}</section>;
}

export function ClaimCode({ code }: { code: string }) { return <div className="claim-code"><span>Tu código para canjear el premio</span><strong>{code}</strong><button type="button" onClick={() => void navigator.clipboard?.writeText(code)}>Copiar código</button><small>Presentá este código para retirar tu premio.</small></div>; }
