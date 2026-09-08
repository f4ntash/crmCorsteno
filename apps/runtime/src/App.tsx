import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { RoulettePreview } from '../../web/src/RoulettePreview';

const api = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';
type Prize = { id: string; name: string; iconUrl?: string | null };
type Config = { schemaVersion: 1; backgroundColor: string; prizes: Prize[]; segments: Array<{ id: string; color: string; prizeId: string | null }> };
type PublicResponse = { active: boolean; reason?: string; experience?: { type: string; config: Config; startsAt: string | null; endsAt: string | null } };

function Viewer() {
  const { slug } = useParams();
  const [state, setState] = useState<{ loading: boolean; data?: PublicResponse; error?: boolean }>({ loading: true });
  useEffect(() => { fetch(`${api}/public/experiences/${slug}`).then(async (response) => { const data = await response.json() as PublicResponse; if (!response.ok && response.status !== 404) throw new Error(); setState({ loading: false, data }); }).catch(() => setState({ loading: false, error: true })); }, [slug]);
  if (state.loading) return <main><p>Cargando experiencia…</p></main>;
  if (state.error || !state.data) return <main><h1>No pudimos cargar esta experiencia.</h1></main>;
  if (!state.data.active) return <main><h1>{state.data.reason === 'scheduled' ? 'Esta experiencia todavía no está disponible.' : state.data.reason === 'expired' ? 'Esta experiencia finalizó.' : 'Esta experiencia no está disponible.'}</h1></main>;
  const config = state.data.experience!.config;
  const segments = config.segments.map((segment) => { const prize = config.prizes.find((item) => item.id === segment.prizeId); return { ...segment, label: prize?.name ?? 'Sin premio', iconUrl: prize?.iconUrl ?? null }; });
  return <main><RoulettePreview segments={segments} backgroundColor={config.backgroundColor} /></main>;
}

export function App() { return <Routes><Route path="/r/:slug" element={<Viewer />} /><Route path="*" element={<Navigate to="/r/" replace />} /></Routes>; }
