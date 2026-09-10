import { useState } from 'react';
import QRCode from 'qrcode';
import { publicExperienceUrl } from '../../../shared/runtime/publicExperienceUrl';

export function ExperienceQrModal({ slug }: { slug: string }) {
  const [image, setImage] = useState('');
  const url = publicExperienceUrl(slug);
  async function open() { setImage(await QRCode.toDataURL(url, { width: 320, margin: 2 })); }
  return <><button type="button" className="secondary qr-button" onClick={() => void open()}>QR</button>{image && <div className="modal-backdrop" role="presentation" onClick={() => setImage('')}><div className="modal qr-modal" role="dialog" aria-modal="true" aria-label="Código QR" onClick={(e) => e.stopPropagation()}><h2>Acceso público</h2><img src={image} alt={`Código QR para ${url}`} /><a href={url} target="_blank" rel="noreferrer">{url}</a><div className="modal-actions"><button type="button" className="secondary" onClick={() => setImage('')}>Cerrar</button></div></div></div>}</>;
}
