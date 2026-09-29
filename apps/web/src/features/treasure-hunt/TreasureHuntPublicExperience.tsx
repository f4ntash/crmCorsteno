import { useState } from 'react';
import { ExperienceQrModal } from '../experiences/components/ExperienceQrModal';
import { copyPublicExperienceUrl, PublicExperienceActions } from '../../shared/publication/PublicExperienceActions';
import { getTreasureHuntPublicUrl } from './publicExperienceUrl';

export function TreasureHuntPublicExperience({ slug, published }: { slug: string; published: boolean }) {
  const [copyMessage, setCopyMessage] = useState('');
  const publicUrl = published ? getTreasureHuntPublicUrl(slug) : null;

  async function copy() {
    if (!publicUrl) return;
    setCopyMessage(await copyPublicExperienceUrl(publicUrl) ? 'Enlace copiado.' : 'No se pudo copiar el enlace.');
  }

  return <section className="card treasure-hunt-section treasure-hunt-public-experience">
    <div className="workspace-section-heading">
      <div><p className="eyebrow">PUBLICACIÓN</p><h2>Experiencia pública</h2></div>
    </div>
    {publicUrl
      ? <>
        <div className="treasure-hunt-public-url">
          <small>URL pública</small>
          <a href={publicUrl} target="_blank" rel="noreferrer">{publicUrl}</a>
        </div>
        <PublicExperienceActions
          publicUrl={publicUrl}
          onCopy={copy}
          openLabel="Abrir"
          className="publication-actions treasure-hunt-public-actions"
          qrAction={<ExperienceQrModal publicUrl={publicUrl} label="Ver QR" />}
        />
        {copyMessage && <p className="publication-feedback" role="status">{copyMessage}</p>}
      </>
      : <p className="field-help">Publicá una versión para generar el enlace público.</p>}
  </section>;
}
