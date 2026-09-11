import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { publicExperiencesApi } from '../../api/publicExperiencesApi';
import { Roulette3DView } from '../roulette3d/Roulette3DView';
import { resolveRuntimeConfig } from '../../config/runtimeConfig';

export function PreviewViewer() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const organizationId = searchParams.get('org') ?? '';
  const returnTo = searchParams.get('returnTo');
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; data?: Awaited<ReturnType<typeof publicExperiencesApi.getPreview>> }>({ status: 'loading' });

  useEffect(() => {
    if (!id || !organizationId) { setState({ status: 'error' }); return; }
    let active = true;
    publicExperiencesApi.getPreview(id, organizationId).then((data) => { if (active) setState({ status: 'ready', data }); }).catch(() => { if (active) setState({ status: 'error' }); });
    return () => { active = false; };
  }, [id, organizationId]);

  if (state.status === 'loading') return <main aria-live="polite"><p>Cargando prueba…</p></main>;
  if (state.status === 'error' || !state.data) return <main aria-live="polite"><h1>No se pudo abrir la prueba.</h1><p>Volvé al editor e intentá nuevamente.</p></main>;
  const config = resolveRuntimeConfig(state.data.config, state.data.featureEntitlements);
  const safeReturnTo = returnTo && /^https?:\/\//i.test(returnTo) ? returnTo : null;
  return <main><a className="secondary-cta" href={safeReturnTo ?? '/app/experiences'}>← Volver al editor</a><Roulette3DView config={config} slug={`preview-${id}`} entitlements={state.data.featureEntitlements} prizeAvailability={state.data.prizeAvailability} testMode /></main>;
}
