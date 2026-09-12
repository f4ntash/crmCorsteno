import { useCallback, useEffect, useState } from 'react';
import type { PublicProduct } from '@corsteno/client';
import { Product3DViewer } from './Product3DViewer';
import { ProductGallery } from './ProductGallery';
import { preferredMedia } from '../utils/media';

export function ProductMedia({ product }: { product: PublicProduct }) {
  const [showModel, setShowModel] = useState(preferredMedia(product.model3d) === '3d');
  useEffect(() => setShowModel(preferredMedia(product.model3d) === '3d'), [product.key, product.model3d]);
  const fallback = useCallback(() => setShowModel(false), []);
  if (showModel && product.model3d.available) return <div className="product-media-stack"><Product3DViewer model={product.model3d} onError={fallback} /><ProductGallery product={product} /></div>;
  return <ProductGallery product={product} />;
}
