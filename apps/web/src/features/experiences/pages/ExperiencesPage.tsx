import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../../../shared/api/client';
import type { Experience } from '../types';
import { rouletteTemplates } from '../../roulette/templates';
import { Dialog } from '../../../shared/ui/Dialog';
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
const experienceTypes: Record<string, { label: string; description: string }> = {
  roulette: { label: 'Roulette', description: 'Una experiencia de premios con giros.' },
  'product-catalog': { label: 'Catálogo de productos', description: 'Mostrá productos, precios y disponibilidad.' },
};
const accessStatuses: Record<string, string> = { legacy_unrestricted: 'Sin restricciones', scheduled: 'Vigencia programada', active: 'Vigencia activa', expired: 'Vigencia vencida', no_access: 'Sin acceso' };
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
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Experience[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [modal, setModal] = useState(false),
    [name, setName] = useState(''),
    [saving, setSaving] = useState(false),
    [saveError, setSaveError] = useState(''),
    [templateId, setTemplateId] = useState<string | null>(null),
    [type, setType] = useState<'roulette' | 'product-catalog'>('roulette');
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
          type,
          ...(type === 'roulette' && templateId ? { draft_config: rouletteTemplates.find((item) => item.id === templateId)?.config } : {}),
        }),
      });
      setModal(false);
      setName('');
      setTemplateId(null);
      setType('roulette');
      navigate(`/app/experiences/${created.id}`);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className="page experiences-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ESPACIO DE TRABAJO</p>
          <h1>Experiencias</h1>
          <p className="page-description">Configurá, publicá y supervisá las experiencias de esta organización.</p>
        </div>
        {canCreate && (
          <button className="button button-primary"
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
        <div className="loading-state" aria-live="polite"><span className="loading-mark" />Cargando experiencias…</div>
      ) : error ? (
        <div className="empty">
          <h2>No se pudieron cargar las experiencias.</h2>
          <button onClick={load}>Reintentar</button>
        </div>
      ) : items.length ? (
        <div className="experience-list">
          {items.map((item) => (
            <article className="experience-card" key={item.id}>
              <div>
                <h2>{item.name}</h2>
                <p>{experienceTypes[item.type]?.label ?? item.type}</p>
              </div>
              <span className={`status status-${item.effective_status}`}>
                {experienceStatuses[item.effective_status] ??
                  item.effective_status}
              </span>
              <span className={`status access-status status-${item.access_status ?? 'legacy_unrestricted'}`}>
                {accessStatuses[item.access_status ?? 'legacy_unrestricted']}
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
              <Link className="button button-secondary configure" to={`/app/experiences/${item.id}`}>
                Abrir
              </Link>
            </article>
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
      <Dialog open={modal} title="Nueva experiencia" description="Elegí el tipo de experiencia para el workspace actual." initialFocusRef={nameInputRef} onClose={() => !saving && setModal(false)}>
            <form onSubmit={create}>
              <label>
                Nombre
                <input
                  ref={nameInputRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ruleta Evento Septiembre"
                />
              </label>
              <fieldset>
                <legend>Tipo de experiencia</legend>
                {Object.entries(experienceTypes).map(([value, option]) => <label key={value}><input type="radio" name="experience-type" checked={type === value} onChange={() => { setType(value as 'roulette' | 'product-catalog'); if (value !== 'roulette') setTemplateId(null); }} />{option.label}<small>{option.description}</small></label>)}
              </fieldset>
              {type === 'roulette' && <fieldset>
                <legend>Plantilla inicial</legend>
                <label><input type="radio" name="template" checked={templateId === null} onChange={() => setTemplateId(null)} />Desde cero</label>
                {rouletteTemplates.map((template) => <label key={template.id}><input type="radio" name="template" checked={templateId === template.id} onChange={() => setTemplateId(template.id)} />{template.name} <small>{template.description}</small></label>)}
              </fieldset>}
              {saveError && <p className="error">{saveError}</p>}
              <div className="dialog-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setModal(false)}
                >
                  Cancelar
                </button>
                <button className="button button-primary" disabled={saving || !name.trim()}>
                  {saving ? 'Creando…' : 'Crear experiencia'}
                </button>
              </div>
            </form>
      </Dialog>
    </main>
  );
}
