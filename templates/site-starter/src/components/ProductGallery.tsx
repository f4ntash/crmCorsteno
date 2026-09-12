import { useEffect, useState } from 'react';
import type { PublicProduct } from '@corsteno/client';

export function ProductGallery({ product }: { product: PublicProduct }) {
  const images = [product.images.main, ...product.images.gallery].filter((image): image is { url: string } => Boolean(image));
  const [selected, setSelected] = useState(0);
  useEffect(() => setSelected(0), [product.key, images.map((image) => image.url).join('|')]);
  const image = images[selected];
  if (!image) return <div className="product-detail-media product-image-empty">Sin imagen</div>;
  return <div className="product-detail-media"><div className="product-detail-image"><img src={image.url} alt={product.name} /></div>{images.length > 1 && <div className="product-gallery" role="list" aria-label={`Imágenes de ${product.name}`}>{images.map((item, index) => <button className={selected === index ? 'is-selected' : ''} type="button" key={`${item.url}-${index}`} onClick={() => setSelected(index)} aria-label={`Ver imagen ${index + 1} de ${product.name}`} aria-current={selected === index ? 'true' : undefined}><img src={item.url} alt="" /></button>)}</div>}</div>;
}
