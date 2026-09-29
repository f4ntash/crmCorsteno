import { useState } from 'react';
import { publicExperienceUrl } from '../../../shared/runtime/publicExperienceUrl';
import { generateExperienceQr } from '../../../shared/publication/experienceQr';

export function ExperienceQrModal({ slug, publicUrl, label = 'QR' }: { slug?: string; publicUrl?: string; label?: string }) {
  const [image, setImage] = useState('');
  const url = publicUrl ?? (slug ? publicExperienceUrl(slug) : '');
  if (!url) return null;
  async function open() { setImage(await generateExperienceQr(url)); }
  return <><button type="button" className="secondary qr-button" onClick={() => void open()}>{label}</button>{image && <div className="modal-backdrop" role="presentation" onClick={() => setImage('')}><div className="modal qr-modal" role="dialog" aria-modal="true" aria-label="Código QR" onClick={(e) => e.stopPropagation()}><h2>Acceso público</h2><img src={image} alt={`Código QR para ${url}`} /><a href={url} target="_blank" rel="noreferrer">{url}</a><div className="modal-actions"><button type="button" className="secondary" onClick={() => setImage('')}>Cerrar</button></div></div></div>}</>;
}
