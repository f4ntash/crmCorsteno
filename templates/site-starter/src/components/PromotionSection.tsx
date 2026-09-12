import type { PublicSiteContent } from '@corsteno/client';
import { CtaLink } from '../utils/urls';
import { shouldRenderPromotion } from '../utils/content';

export function PromotionSection({ promotion }: { promotion: PublicSiteContent['sections']['promotion'] }) {
  if (!shouldRenderPromotion(promotion)) return null;
  return <section className="promotion-section"><div className="promotion-copy"><p className="section-kicker">Destacado</p><h2>{promotion.title || 'Una propuesta especial'}</h2><p>{promotion.description}</p>{promotion.ctaLabel && promotion.ctaUrl && <CtaLink url={promotion.ctaUrl} className="site-button site-button-light">{promotion.ctaLabel}</CtaLink>}</div>{promotion.image ? <img src={promotion.image.url} alt={promotion.title || 'Destacado'} /> : null}</section>;
}
