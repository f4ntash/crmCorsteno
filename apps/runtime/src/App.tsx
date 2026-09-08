import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Roulette3DView } from './features/roulette3d/Roulette3DView';
import { publicExperiencesApi, type PublicExperienceResponse } from './api/publicExperiencesApi';


function Viewer() {
  const { slug } = useParams();
  const [state, setState] = useState<{ loading: boolean; data?: PublicExperienceResponse; error?: boolean }>({ loading: true });
  useEffect(() => { if (!slug) return; publicExperiencesApi.getExperience(slug).then((data) => setState({ loading: false, data })).catch(() => setState({ loading: false, error: true })); }, [slug]);
  if (state.loading) return <main><p>Cargando experiencia…</p></main>;
  if (state.error || !state.data) return <main><h1>No pudimos cargar esta experiencia.</h1></main>;
  if (!state.data.active) return <main><h1>{state.data.reason === 'scheduled' ? 'Esta experiencia todavía no está disponible.' : state.data.reason === 'expired' ? 'Esta experiencia finalizó.' : 'Esta experiencia no está disponible.'}</h1></main>;
  const config = state.data.experience!.config;
  return <main><Roulette3DView config={config} slug={slug ?? ''} /></main>;
}

export function App() { return <Routes><Route path="/r/:slug" element={<Viewer />} /><Route path="*" element={<Navigate to="/r/" replace />} /></Routes>; }
