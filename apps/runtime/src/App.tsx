import { Route, Routes, useParams } from 'react-router-dom';
import { lazy, Suspense, useEffect, useState } from 'react';
import { publicExperiencesApi, type PublicExperienceResponse } from './api/publicExperiencesApi';
import { getParticipantIdentity } from './analytics/experienceAnalytics';
import './claim.css';
import { availabilityMessage } from './config/runtimeState';
import { resolveRuntimeRenderer } from './renderers/registry';
import { PreviewViewer } from './features/preview/PreviewViewer';
import { SurfaceVisualizerErrorBoundary } from './features/surface-visualizer/state/SurfaceVisualizerErrorBoundary';

const SurfaceVisualizerRoute = lazy(() => import('./features/surface-visualizer/SurfaceVisualizerRoute').then(({ SurfaceVisualizerRoute: route }) => ({ default: route })));


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
  const experience = state.data.experience;
  const renderer = resolveRuntimeRenderer(experience.type);
  if (!renderer) return <AvailabilityState reason="unavailable" />;
  return <main className="runtime-experience-page">{renderer.render({ type: experience.type, config: experience.config, slug, entitlements: experience.featureEntitlements, prizeAvailability: experience.prizeAvailability, recovery: experience.recovery, catalogProducts: experience.products })}</main>;
}

function MissingSlugState() { return <main><h1>Falta el enlace de la experiencia.</h1><p>Usá un enlace público válido para abrir esta ruleta.</p></main>; }
function AvailabilityState({ reason }: { reason?: string }) { return <main><h1>{availabilityMessage(reason)}</h1></main>; }

function SurfaceVisualizerRouteFrame() {
  const { slug = '' } = useParams();
  return <SurfaceVisualizerErrorBoundary slug={slug}><Suspense fallback={<main aria-live="polite"><p>Cargando ambiente…</p></main>}><SurfaceVisualizerRoute /></Suspense></SurfaceVisualizerErrorBoundary>;
}

export function App() { return <Routes><Route path="/r/" element={<MissingSlugState />} /><Route path="/r/:slug/visualizer/:productId" element={<SurfaceVisualizerRouteFrame />} /><Route path="/r/:slug" element={<Viewer />} /><Route path="/test/experiences/:id" element={<PreviewViewer />} /><Route path="*" element={<MissingSlugState />} /></Routes>; }
