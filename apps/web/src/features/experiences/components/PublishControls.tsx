import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { apiRequest } from '../../../shared/api/client';
type LegacyJson = ReturnType<JSON['parse']>;
async function get<T = LegacyJson>(path: string, org?: string, init?: RequestInit) { return apiRequest<T>(path, org, init); }
export function PublishControls({ organizationId }: { organizationId: string }) {
  const location = useLocation();
  const [state, setState] = useState<{ draft: unknown; published: unknown; status: string }>();
  const [message, setMessage] = useState('');
  const [publishing, setPublishing] = useState(false);
  const match = location.pathname.match(/^\/app\/experiences\/([^/]+)$/);
  const id = match?.[1];
  useEffect(() => {
    if (!id || !organizationId) return;
    get(`/experiences/${id}`, organizationId).then((experience: { draftConfig: unknown; publishedConfig: unknown; status: string }) => setState({ draft: experience.draftConfig, published: experience.publishedConfig, status: experience.status })).catch(() => setState(undefined));
  }, [id, organizationId]);
  if (!id || !state) return null;
  const currentState = state;
  const hasUnpublishedChanges = JSON.stringify(currentState.draft) !== JSON.stringify(currentState.published);
  async function publish() {
    if (!window.confirm('¿Publicar la configuración actual?')) return;
    setPublishing(true); setMessage('');
    try { await get(`/experiences/${id}/publish`, organizationId, { method: 'POST' }); setMessage('Publicado correctamente.'); setState({ draft: currentState.draft, published: currentState.draft, status: 'published' }); } catch (error) { setMessage((error as Error).message); } finally { setPublishing(false); }
  }
  return <div className="publish-control"><span>{state.status === 'published' ? (hasUnpublishedChanges ? 'Cambios sin publicar' : 'Publicado') : 'Borrador'}</span><button disabled={!hasUnpublishedChanges || publishing} onClick={() => void publish()}>{publishing ? 'Publicando…' : 'Publicar'}</button>{message && <small>{message}</small>}</div>;
}
