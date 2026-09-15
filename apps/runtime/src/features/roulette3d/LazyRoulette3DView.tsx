import { lazy, Suspense, type ComponentProps } from 'react';
import type { Roulette3DView as Roulette3DViewComponent } from './Roulette3DView';

const Roulette3DView = lazy(() => import('./Roulette3DView').then(({ Roulette3DView: view }) => ({ default: view })));

type Props = ComponentProps<typeof Roulette3DViewComponent>;

export function LazyRoulette3DView(props: Props) {
  return <Suspense fallback={<div role="status" aria-live="polite">Cargando experiencia 3D…</div>}><Roulette3DView {...props} /></Suspense>;
}
