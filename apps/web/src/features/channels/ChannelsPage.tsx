import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../../shared/api/client';
import { Dialog } from '../../shared/ui/Dialog';
import { channelsApi, channelTypeLabels, isHttpUrl, type Channel, type ChannelType } from './api';

const channelStatusLabels: Record<Channel['status'], string> = {
  active: 'Activo',
  inactive: 'Inactivo',
};

function channelLocation(channel: Channel) {
  if (channel.type === 'hosted_runtime') return 'Entrega pública de Corsteno';
  return channel.url ?? 'Sin dominio registrado';
}

export function ChannelsPage({ org, canManage }: { org: string; canManage: boolean }) {
  const navigate = useNavigate();
  const nameRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState<{ name: string; type: ChannelType; url: string }>({ name: '', type: 'external_site', url: '' });

  async function load() {
    if (!org) return;
    setLoading(true);
    setError('');
    try {
      setItems(await channelsApi.list(org));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'No se pudieron cargar los sitios y canales.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [org]);

  function openCreate() {
    setForm({ name: '', type: 'external_site', url: '' });
    setFormError('');
    setDialog(true);
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    const name = form.name.trim();
    const url = form.url.trim();
    if (name.length < 2 || name.length > 120) {
      setFormError('El nombre debe tener entre 2 y 120 caracteres.');
      return;
    }
    if (form.type === 'external_site' && !isHttpUrl(url)) {
      setFormError('Ingresá una URL válida con http:// o https://.');
      return;
    }
    if (form.type === 'corsteno_site' && url && !isHttpUrl(url)) {
      setFormError('Ingresá una URL válida con http:// o https://.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const channel = await channelsApi.create(org, { name, type: form.type, url: form.type === 'hosted_runtime' ? null : url || null });
      setDialog(false);
      await load();
      navigate(`/app/channels/${channel.id}`);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'No se pudo registrar el canal.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page channels-page">
      <div className="page-heading">
        <div><p className="eyebrow">ESPACIO DE TRABAJO / ENTREGA</p><h1>Sitios y canales</h1><p className="page-description">Registrá los destinos donde se pueden consumir tus experiencias y contenido publicado.</p></div>
        {canManage && <button type="button" onClick={openCreate}>Nuevo sitio/canal</button>}
      </div>
      {loading ? <p className="loading-state"><span className="loading-mark" />Cargando sitios y canales…</p> : error ? <div className="empty"><h2>{error}</h2><button type="button" className="button button-secondary" onClick={() => void load()}>Reintentar</button></div> : items.length === 0 ? <div className="empty"><h2>No hay sitios o canales registrados.</h2><p>Agregá un destino para organizar dónde se entregan tus experiencias.</p>{canManage && <button type="button" onClick={openCreate}>Registrar primer sitio/canal</button>}</div> : (
        <section className="channel-list" aria-label="Sitios y canales de la organización">
          <div className="channel-list-head"><span>Destino</span><span>Tipo</span><span>Estado</span><span>Experiencias</span><span /></div>
          {items.map((channel) => <article className="channel-row" key={channel.id}>
            <div className="channel-row-name"><Link to={`/app/channels/${channel.id}`}><strong>{channel.name}</strong></Link><small>{channelLocation(channel)}</small></div>
            <span className="channel-type">{channelTypeLabels[channel.type]}</span>
            <span className={`status status-${channel.status}`}>{channelStatusLabels[channel.status]}</span>
            <span className="channel-count">{channel.linkedExperienceCount ?? 0} {channel.linkedExperienceCount === 1 ? 'experiencia' : 'experiencias'}</span>
            <Link className="button button-secondary channel-open" to={`/app/channels/${channel.id}`}>Abrir</Link>
          </article>)}
        </section>
      )}
      <Dialog open={dialog} title="Nuevo sitio o canal" description="Elegí un destino para organizar la entrega de tus experiencias." initialFocusRef={nameRef} onClose={() => !saving && setDialog(false)}>
        <form onSubmit={create}>
          <label>Nombre<input ref={nameRef} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Lumbre Norte Web" maxLength={120} /></label>
          <fieldset>
            <legend>Tipo de destino</legend>
            <div className="channel-type-options">
              {(Object.entries(channelTypeLabels) as Array<[ChannelType, string]>).map(([value, label]) => <label className="template-option" key={value}><input type="radio" name="channel-type" checked={form.type === value} onChange={() => setForm({ ...form, type: value, url: value === 'hosted_runtime' ? '' : form.url })} /><span><strong>{label}</strong><small>{value === 'external_site' ? 'Una web que ya existe y donde luego se podrá integrar contenido.' : value === 'corsteno_site' ? 'Un sitio que Corsteno podrá construir en una etapa posterior.' : 'El enlace público alojado por Corsteno para esta organización.'}</small></span></label>)}
            </div>
          </fieldset>
          {form.type !== 'hosted_runtime' && <label>{form.type === 'external_site' ? 'URL del sitio' : 'Dominio previsto (opcional)'}<input type="url" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} placeholder="https://lumbrenorte.com.ar" maxLength={2048} /><small className="field-help">Solo se aceptan direcciones http:// o https://. No verificamos que el sitio esté online.</small></label>}
          {formError && <p className="error" role="alert">{formError}</p>}
          <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={() => setDialog(false)}>Cancelar</button><button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Registrar canal'}</button></div>
        </form>
      </Dialog>
    </main>
  );
}
