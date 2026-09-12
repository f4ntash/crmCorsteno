import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../shared/api/client';
import { ConfigEditor } from '../../shared/config/ConfigEditor';
import type { ConfigFieldValues } from '../../shared/config/fields';
import type { ConfigSectionDefinition } from '../../shared/config/sections';
import type { Channel, ChannelContent, SiteContent } from './api';
import { channelsApi } from './api';

const emptyContent: SiteContent = {
  hero: { title: '', description: '', image: null, ctaLabel: '', ctaUrl: '' },
  promotion: { enabled: false, title: '', description: '', image: null, ctaLabel: '', ctaUrl: '' },
};

function flatten(content: SiteContent): ConfigFieldValues {
  return {
    'hero.title': content.hero.title,
    'hero.description': content.hero.description,
    'hero.image': content.hero.image ?? null,
    'hero.ctaLabel': content.hero.ctaLabel,
    'hero.ctaUrl': content.hero.ctaUrl,
    'promotion.enabled': content.promotion.enabled,
    'promotion.title': content.promotion.title,
    'promotion.description': content.promotion.description,
    'promotion.image': content.promotion.image ?? null,
    'promotion.ctaLabel': content.promotion.ctaLabel,
    'promotion.ctaUrl': content.promotion.ctaUrl,
  };
}

function value(values: ConfigFieldValues, key: string) {
  return typeof values[key] === 'string' ? values[key] as string : '';
}

function toContent(values: ConfigFieldValues): SiteContent {
  return {
    hero: {
      title: value(values, 'hero.title'),
      description: value(values, 'hero.description'),
      image: typeof values['hero.image'] === 'string' ? values['hero.image'] as string : null,
      ctaLabel: value(values, 'hero.ctaLabel'),
      ctaUrl: value(values, 'hero.ctaUrl'),
    },
    promotion: {
      enabled: Boolean(values['promotion.enabled']),
      title: value(values, 'promotion.title'),
      description: value(values, 'promotion.description'),
      image: typeof values['promotion.image'] === 'string' ? values['promotion.image'] as string : null,
      ctaLabel: value(values, 'promotion.ctaLabel'),
      ctaUrl: value(values, 'promotion.ctaUrl'),
    },
  };
}

function draftFor(content: ChannelContent) {
  return content.draftContent ?? emptyContent;
}

function statusLabel(content: ChannelContent, dirty: boolean) {
  if (dirty) return 'Cambios sin guardar';
  if (!content.publishedContent) return 'Sin publicar';
  return content.hasUnpublishedChanges ? 'Hay cambios sin publicar' : 'Publicado';
}

export function SiteContentEditor({ org, channel, content, canEdit, canManageAssets, onContentChange }: { org: string; channel: Channel; content: ChannelContent; canEdit: boolean; canManageAssets: boolean; onContentChange: (content: ChannelContent) => void }) {
  const initialDraft = useMemo(() => flatten(draftFor(content)), [content.draftContent]);
  const [initialValues, setInitialValues] = useState<ConfigFieldValues>(initialDraft);
  const [values, setValues] = useState<ConfigFieldValues>(initialDraft);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setInitialValues(initialDraft);
    setValues(initialDraft);
    setDirty(false);
  }, [initialDraft]);

  const sections = useMemo<ConfigSectionDefinition[]>(() => content.profile?.sections.map((section) => ({ ...section, fields: section.fields })) ?? [], [content.profile]);
  const draft = toContent(values);
  const hasUnpublishedStructure = Boolean(channel.products?.hasUnpublishedChanges);
  const hasPendingChanges = content.hasUnpublishedChanges || hasUnpublishedStructure;

  async function save() {
    if (saving || !canEdit) return false;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const result = await channelsApi.saveContent(channel.id, org, draft);
      onContentChange(result);
      setInitialValues(flatten(draftFor(result)));
      setValues(flatten(draftFor(result)));
      setDirty(false);
      setMessage('Borrador guardado.');
      return true;
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'No se pudo guardar el contenido.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (publishing || saving || dirty || !canEdit) {
      if (dirty) setError('Guardá el borrador antes de publicar.');
      return;
    }
    setPublishing(true);
    setMessage('');
    setError('');
    try {
      const result = await channelsApi.publishContent(channel.id, org);
      onContentChange(result);
      setMessage('Contenido publicado.');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'No se pudo publicar el contenido.');
    } finally {
      setPublishing(false);
    }
  }

  const hero = draft.hero;
  const promotion = draft.promotion;
  return <div className="site-content-editor">
    <div className="site-content-status-row">
      <div><strong>{content.profile?.name}</strong><small>{content.profile?.description}</small></div>
      <span className={`content-state ${hasPendingChanges || dirty ? 'content-state-pending' : 'content-state-ready'}`}>{dirty ? statusLabel(content, dirty) : hasPendingChanges ? 'Hay cambios sin publicar' : statusLabel(content, dirty)}</span>
    </div>
    <div className="site-content-preview" aria-label="Vista previa del contenido">
      <div className="site-content-preview-copy">
        <small>VISTA PREVIA</small>
        <h3>{hero.title || 'Tu título principal'}</h3>
        <p>{hero.description || 'La descripción principal aparecerá acá.'}</p>
        {hero.ctaLabel && <span className="button button-secondary site-content-preview-cta">{hero.ctaLabel}</span>}
      </div>
      {hero.image ? <img src={hero.image} alt="" /> : <div className="site-content-preview-placeholder">Imagen principal</div>}
      {promotion.enabled && <div className="site-content-preview-promotion"><strong>{promotion.title || 'Promoción'}</strong><span>{promotion.description || 'Una promoción destacada.'}</span></div>}
    </div>
    <ConfigEditor
      sections={sections}
      initialValues={initialValues}
      values={values}
      onChange={(key, next) => { setValues((current) => ({ ...current, [key]: next })); setMessage(''); setError(''); }}
      onSave={save}
      saving={saving}
      readOnly={!canEdit}
      saveLabel="Guardar borrador"
      saveMessage={message}
      saveError={error}
      assetContext={{ org, canUpload: canManageAssets }}
      onDirtyChange={setDirty}
      secondaryAction={<div className="site-content-publish-action"><span>{content.publishedAt ? `Última publicación: ${new Date(content.publishedAt).toLocaleDateString('es-AR')}` : 'Todavía no hay una versión publicada.'}</span>{canEdit && <button type="button" className="button button-secondary" disabled={publishing || saving || dirty || !hasPendingChanges} onClick={() => void publish()}>{publishing ? 'Publicando…' : content.publishedContent ? 'Publicar cambios' : 'Publicar contenido'}</button>}</div>}
    />
    {!canEdit && <p className="field-help">Tu acceso permite consultar este contenido, pero no modificarlo.</p>}
  </div>;
}
