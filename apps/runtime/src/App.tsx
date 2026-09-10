import { Route, Routes, useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Roulette3DView } from './features/roulette3d/Roulette3DView';
import { publicExperiencesApi, type PublicExperienceResponse } from './api/publicExperiencesApi';
import { getParticipantIdentity } from './analytics/experienceAnalytics';
import './claim.css';
import { resolveRuntimeConfig } from './config/runtimeConfig';
import { availabilityMessage } from './config/runtimeState';


function Viewer() {
  const { slug } = useParams();
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; data?: PublicExperienceResponse }>({ status: 'loading' });
  useEffect(() => {
    if (!slug) return;
    let active = true;
    setState({ status: 'loading' });
    const identity = getParticipantIdentity();
    publicExperiencesApi.getExperience(slug, identity).then((data) => { if (active) setState({ status: 'ready', data }); }).catch(() => { if (active) setState({ status: 'error' }); });
    return () => { active = false; };
  }, [slug, reloadKey]);
  if (!slug) return <MissingSlugState />;
  if (state.status === 'loading') return <main aria-live="polite"><p>Cargando experiencia…</p></main>;
  if (state.status === 'error' || !state.data) return <main aria-live="polite"><h1>No pudimos cargar esta experiencia.</h1><button className="spin-cta" type="button" onClick={() => { setState({ status: 'loading' }); setReloadKey((value) => value + 1); }}>Reintentar</button></main>;
  if (!state.data.active) return <AvailabilityState reason={state.data.reason} />;
  const experience = state.data.experience!;
  const config = resolveRuntimeConfig(experience.config, experience.featureEntitlements);
  return <main><Roulette3DView config={config} slug={slug} entitlements={experience.featureEntitlements} prizeAvailability={experience.prizeAvailability} initialResult={experience.recovery} /></main>;
}

function PreviewViewer() {
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

function MissingSlugState() { return <main><h1>Falta el enlace de la experiencia.</h1><p>Usá un enlace público válido para abrir esta ruleta.</p></main>; }
function AvailabilityState({ reason }: { reason?: string }) { return <main><h1>{availabilityMessage(reason)}</h1></main>; }

export function App() { return <Routes><Route path="/r/" element={<MissingSlugState />} /><Route path="/r/:slug" element={<Viewer />} /><Route path="/test/experiences/:id" element={<PreviewViewer />} /><Route path="*" element={<MissingSlugState />} /></Routes>; }
