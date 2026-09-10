import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ApiError, apiRequest } from '../../../shared/api/client';
type LegacyJson = ReturnType<JSON['parse']>;
async function get<T = LegacyJson>(path: string, org?: string, init?: RequestInit) { return apiRequest<T>(path, org, init); }
export function PublishControls({ organizationId, canPublish }: { organizationId: string; canPublish: boolean }) {
  const location = useLocation();
  const [state, setState] = useState<{ draft: unknown; published: unknown; status: string }>();
  const [message, setMessage] = useState('');
  const [readinessIssues, setReadinessIssues] = useState<Array<{ message: string }>>([]);
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
    setPublishing(true); setMessage(''); setReadinessIssues([]);
    try { await get(`/experiences/${id}/publish`, organizationId, { method: 'POST' }); setMessage('Publicado correctamente.'); setState({ draft: currentState.draft, published: currentState.draft, status: 'published' }); } catch (error) {
      const issues = error instanceof ApiError && Array.isArray(error.details) ? error.details.filter((item): item is { message: string } => !!item && typeof item === 'object' && typeof (item as { message?: unknown }).message === 'string') : [];
      setReadinessIssues(issues);
      if (!issues.length) setMessage((error as Error).message);
    } finally { setPublishing(false); }
  }
  return <div className="publish-control"><span>{state.status === 'published' ? (hasUnpublishedChanges ? 'Cambios sin publicar' : 'Publicado') : 'Borrador'}</span>{canPublish && <button disabled={!hasUnpublishedChanges || publishing} onClick={() => void publish()}>{publishing ? 'Publicando…' : 'Publicar'}</button>}{readinessIssues.length > 0 && <div className="publish-readiness" role="alert"><strong>Antes de publicar</strong><ul>{readinessIssues.map((issue, index) => <li key={`${issue.message}-${index}`}>{issue.message}</li>)}</ul></div>}{message && <small>{message}</small>}</div>;
}
