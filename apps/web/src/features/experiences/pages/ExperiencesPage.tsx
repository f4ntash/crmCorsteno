import type React from 'react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../../../shared/api/client';
import type { Experience } from '../types';
import { rouletteTemplates } from '../../roulette/templates';
type LegacyJson = ReturnType<JSON['parse']>;
async function get<T = LegacyJson>(
  path: string,
  org?: string,
  init?: RequestInit,
) {
  return apiRequest<T>(path, org, init);
}
const experienceStatuses: Record<string, string> = {
  draft: 'Borrador',
  scheduled: 'Programada',
  active: 'Activa',
  paused: 'Pausada',
  expired: 'Vencida',
};
function experienceDate(value: string | null, empty: string) {
  if (!value) return empty;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Fecha inválida'
    : date.toLocaleString('es-AR');
}
export function ExperiencesPage({
  org,
  canCreate,
}: {
  org: string;
  canCreate: boolean;
}) {
  const navigate = useNavigate();
  const [items, setItems] = useState<Experience[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [modal, setModal] = useState(false),
    [name, setName] = useState(''),
    [saving, setSaving] = useState(false),
    [saveError, setSaveError] = useState(''),
    [templateId, setTemplateId] = useState<string | null>(null);
  const load = () => {
    if (!org) return;
    setLoading(true);
    setError(false);
    get('/experiences', org)
      .then(setItems)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    setItems([]);
    load();
  }, [org]);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const created = await get<{ id: string }>('/experiences', org, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          type: 'roulette',
          draft_config: rouletteTemplates.find((item) => item.id === templateId)?.config,
        }),
      });
      setModal(false);
      setName('');
      setTemplateId(null);
      navigate(`/app/experiences/${created.id}`);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">EXPERIENCES / GESTIÓN</p>
          <h1>Experiencias</h1>
        </div>
        {canCreate && (
          <button
            onClick={() => {
              setSaveError('');
              setModal(true);
            }}
          >
            Nueva experiencia
          </button>
        )}
      </div>
      {loading ? (
        <p>Cargando experiencias…</p>
      ) : error ? (
        <div className="empty">
          <h2>No se pudieron cargar las experiencias.</h2>
          <button onClick={load}>Reintentar</button>
        </div>
      ) : items.length ? (
        <div className="experience-list">
          {items.map((item) => (
            <div className="experience-card" key={item.id}>
              <div>
                <h2>{item.name}</h2>
                <p>{item.type}</p>
              </div>
              <span className={`status status-${item.effective_status}`}>
                {experienceStatuses[item.effective_status] ??
                  item.effective_status}
              </span>
              <div className="experience-dates">
                <span>
                  <small>Inicio</small>
                  {experienceDate(item.starts_at, 'Inicio inmediato')}
                </span>
                <span>
                  <small>Fin</small>
                  {experienceDate(item.ends_at, 'Sin vencimiento')}
                </span>
              </div>
              <Link className="configure" to={`/app/experiences/${item.id}`}>
                Configurar →
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">
          <h2>No tenés experiencias todavía.</h2>
          <p>Creá una experiencia para comenzar.</p>
          {canCreate && (
            <button onClick={() => setModal(true)}>Crear experiencia</button>
          )}
        </div>
      )}
      {modal && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true">
            <h2>Nueva experiencia</h2>
            <form onSubmit={create}>
              <label>
                Nombre
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ruleta Evento Septiembre"
                />
              </label>
              <fieldset>
                <legend>Plantilla inicial</legend>
                <label>
                  <input type="radio" name="template" checked={templateId === null} onChange={() => setTemplateId(null)} />
                  Desde cero
                </label>
                {rouletteTemplates.map((template) => (
                  <label key={template.id}>
                    <input type="radio" name="template" checked={templateId === template.id} onChange={() => setTemplateId(template.id)} />
                    {template.name} <small>{template.description}</small>
                  </label>
                ))}
              </fieldset>
              {saveError && <p className="error">{saveError}</p>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setModal(false)}
                >
                  Cancelar
                </button>
                <button disabled={saving || !name.trim()}>
                  {saving ? 'Creando…' : 'Crear experiencia'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
