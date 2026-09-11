import type React from 'react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { Dialog } from '../../shared/ui/Dialog';
import { experiencesApi } from '../experiences/api';
import type { Experience } from '../experiences/types';
import { channelsApi, channelTypeLabels, isHttpUrl, type Channel } from './api';

const experienceTypeLabels: Record<string, string> = {
  roulette: 'Roulette',
  'product-catalog': 'Catálogo de productos',
};

function experienceLabel(experience: Pick<Experience, 'type'>) {
  return experienceTypeLabels[experience.type] ?? experience.type;
}

export function ChannelDetailPage({ org, canManage }: { org: string; canManage: boolean }) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [channel, setChannel] = useState<Channel>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({ name: '', url: '', status: 'active' as Channel['status'] });
  const [connectOpen, setConnectOpen] = useState(false);
  const [availableExperiences, setAvailableExperiences] = useState<Experience[]>([]);
  const [selectedExperience, setSelectedExperience] = useState('');
  const [loadingExperiences, setLoadingExperiences] = useState(false);
  const [connectError, setConnectError] = useState('');

  async function load() {
    if (!org || !id) return;
    setLoading(true);
    setError('');
    try {
      const result = await channelsApi.get(id, org);
      setChannel(result);
      setForm({ name: result.name, url: result.url ?? '', status: result.status });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'No se pudo cargar el sitio o canal.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [org, id]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!channel || saving) return;
    const name = form.name.trim();
    const url = form.url.trim();
    if (name.length < 2 || name.length > 120) {
      setFormError('El nombre debe tener entre 2 y 120 caracteres.');
      return;
    }
    if (channel.type === 'external_site' && !isHttpUrl(url)) {
      setFormError('Ingresá una URL válida con http:// o https://.');
      return;
    }
    if (channel.type === 'corsteno_site' && url && !isHttpUrl(url)) {
      setFormError('Ingresá una URL válida con http:// o https://.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const updated = await channelsApi.update(channel.id, org, { name, status: form.status, url: channel.type === 'hosted_runtime' ? null : url || null });
      setChannel(updated);
      setForm({ name: updated.name, url: updated.url ?? '', status: updated.status });
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'No se pudo guardar el canal.');
    } finally {
      setSaving(false);
    }
  }

  async function openConnect() {
    if (!channel || !canManage) return;
    setConnectError('');
    setSelectedExperience('');
    setLoadingExperiences(true);
    try {
      const experiences = await experiencesApi.list(org);
      const connected = new Set((channel.experiences ?? []).map((experience) => experience.id));
      setAvailableExperiences(experiences.filter((experience) => !connected.has(experience.id)));
      setConnectOpen(true);
    } catch (cause) {
      setConnectError(cause instanceof Error ? cause.message : 'No se pudieron cargar las experiencias.');
    } finally {
      setLoadingExperiences(false);
    }
  }

  async function connect(event: React.FormEvent) {
    event.preventDefault();
    if (!channel || !selectedExperience || loadingExperiences) return;
    setLoadingExperiences(true);
    setConnectError('');
    try {
      const updated = await channelsApi.linkExperience(channel.id, org, selectedExperience);
      setChannel(updated);
      setConnectOpen(false);
    } catch (cause) {
      setConnectError(cause instanceof Error ? cause.message : 'No se pudo conectar la experiencia.');
    } finally {
      setLoadingExperiences(false);
    }
  }

  async function unlink(experience: NonNullable<Channel['experiences']>[number]) {
    if (!channel || !canManage || !window.confirm(`¿Desconectar ${experience.name} de este canal?`)) return;
    try {
      setChannel(await channelsApi.unlinkExperience(channel.id, org, experience.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo desconectar la experiencia.');
    }
  }

  if (loading) return <main className="page"><p className="loading-state"><span className="loading-mark" />Cargando sitio o canal…</p></main>;
  if (!channel) return <main className="page"><div className="empty"><h2>{error || 'No se pudo cargar el sitio o canal.'}</h2><button type="button" className="button button-secondary" onClick={() => navigate('/app/channels')}>Volver a sitios y canales</button></div></main>;
  const experiences = channel.experiences ?? [];
  return (
    <main className="page channel-detail-page">
      <div className="page-heading">
        <div><p className="eyebrow">SITIOS Y CANALES / DESTINO</p><h1>{channel.name}</h1><p className="page-description">Gestioná este destino y las experiencias conectadas.</p></div>
        <Link className="button button-secondary" to="/app/channels">Volver a sitios y canales</Link>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="channel-detail-grid">
        <section className="card channel-edit-card">
          <div className="channel-detail-heading"><div><p className="eyebrow">DESTINO</p><h2>Datos del canal</h2></div><span className={`status status-${channel.status}`}>{channel.status === 'active' ? 'Activo' : 'Inactivo'}</span></div>
          <p className="channel-detail-type">{channelTypeLabels[channel.type]}</p>
          {channel.type === 'hosted_runtime' ? <p className="field-help">Este registro representa el enlace público alojado por Corsteno. La URL pública sigue siendo la de la experiencia.</p> : <p className="field-help">{channel.type === 'external_site' ? 'Sitio registrado. La integración de contenido queda pendiente de una etapa posterior.' : 'Sitio registrado para una futura construcción de Corsteno. Todavía no se genera un sitio.'}</p>}
          {canManage ? <form onSubmit={save} className="channel-edit-form">
            <label>Nombre<input value={form.name} maxLength={120} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            {channel.type !== 'hosted_runtime' && <label>{channel.type === 'external_site' ? 'URL del sitio' : 'Dominio previsto (opcional)'}<input type="url" value={form.url} maxLength={2048} onChange={(event) => setForm({ ...form, url: event.target.value })} /><small className="field-help">Solo http:// o https://. No verificamos que el sitio esté online.</small></label>}
            <label>Estado<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Channel['status'] })}><option value="active">Activo</option><option value="inactive">Inactivo</option></select></label>
            {formError && <p className="error" role="alert">{formError}</p>}
            <button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
          </form> : <p className="field-help">Tu acceso permite consultar este destino, pero no modificarlo.</p>}
        </section>
        <section className="card channel-experiences-card">
          <div className="channel-detail-heading"><div><p className="eyebrow">CONTENIDO CONECTADO</p><h2>Experiencias</h2></div>{canManage && <button type="button" className="button button-secondary" onClick={() => void openConnect()} disabled={loadingExperiences}>{loadingExperiences ? 'Cargando…' : 'Conectar experiencia'}</button>}</div>
          {experiences.length ? <div className="linked-experience-list">{experiences.map((experience) => <div className="linked-experience-row" key={experience.id}><div><Link to={`/app/experiences/${experience.id}`}><strong>{experience.name}</strong></Link><small>{experienceLabel(experience)} · {experience.status === 'published' ? 'Publicada' : 'Borrador'}</small></div>{canManage && <button type="button" className="button button-quiet" onClick={() => void unlink(experience)}>Desconectar</button>}</div>)}</div> : <div className="empty channel-empty"><h3>No hay experiencias conectadas.</h3><p>Conectá una experiencia existente para dejar registrado este destino.</p></div>}
        </section>
      </div>
      <Dialog open={connectOpen} title="Conectar experiencia" description="Solo podés elegir experiencias de la organización actual." onClose={() => !loadingExperiences && setConnectOpen(false)}>
        <form onSubmit={connect}>
          {availableExperiences.length ? <label>Experiencia<select autoFocus value={selectedExperience} onChange={(event) => setSelectedExperience(event.target.value)}><option value="">Elegí una experiencia</option>{availableExperiences.map((experience) => <option value={experience.id} key={experience.id}>{experience.name} · {experienceLabel(experience)}</option>)}</select></label> : <p className="field-help">No hay experiencias disponibles para conectar.</p>}
          {connectError && <p className="error" role="alert">{connectError}</p>}
          <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={() => setConnectOpen(false)}>Cancelar</button><button type="submit" disabled={loadingExperiences || !selectedExperience || !availableExperiences.length}>{loadingExperiences ? 'Guardando…' : 'Conectar'}</button></div>
        </form>
      </Dialog>
    </main>
  );
}
