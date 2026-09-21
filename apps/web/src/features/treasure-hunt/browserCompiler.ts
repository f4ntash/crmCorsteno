import { compileImage, packMarkers } from '@tracear/sdk/compiler';
import type { TreasureHuntBrowserCompilationTarget } from './api';

export type BrowserCompilationProgress = {
  completed: number;
  total: number;
  stepId: string;
};

/**
 * Compiles the authenticated draft targets in the PEC browser. The API owns
 * target access and artifact validation; this module only owns TraceAR work.
 */
export async function compileTreasureHuntTargets(
  targets: TreasureHuntBrowserCompilationTarget[],
  loadTarget: (stepId: string) => Promise<Blob>,
  onProgress?: (progress: BrowserCompilationProgress) => void,
): Promise<ArrayBuffer> {
  const orderedTargets = [...targets].sort((left, right) => left.order - right.order);
  const markers: Uint8Array[] = [];

  for (let index = 0; index < orderedTargets.length; index += 1) {
    const target = orderedTargets[index];
    if (!target) throw new Error('La API devolvió un objetivo incompleto para compilar.');
    onProgress?.({ completed: index, total: orderedTargets.length, stepId: target.stepId });
    const source = await loadTarget(target.stepId);
    if (!source.size) throw new Error(`El objetivo ${index + 1} está vacío.`);
    const result = await compileImage(source);
    if (!result.data.byteLength) throw new Error(`El objetivo ${index + 1} no produjo un marker válido.`);
    markers.push(result.data);
    onProgress?.({ completed: index + 1, total: orderedTargets.length, stepId: target.stepId });
  }

  if (!markers.length) throw new Error('La compilación necesita al menos un objetivo.');
  const artifact = packMarkers(markers);
  return new Uint8Array(artifact).buffer;
}
