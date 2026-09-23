import type { SpinResult } from '../../api/publicExperiencesApi';
import type { Roulette3DConfig } from '@corsteno/roulette-3d';
import { RouletteResult } from '../roulette/components/RouletteResult';
import styles from './RouletteReferenceResult.module.css';

type RouletteReferenceResultProps = {
  result: SpinResult | null;
  config: Roulette3DConfig;
  onCta: () => void;
};

export function RouletteReferenceResult({ result, config, onCta }: RouletteReferenceResultProps) {
  if (!result) return null;
  return <div className={styles.resultScope}><RouletteResult result={result} config={config} onCta={onCta} /></div>;
}
