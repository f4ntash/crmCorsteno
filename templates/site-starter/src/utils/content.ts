import type { PublicSiteContent } from '@corsteno/client';

export function hasPublishedContent(content: PublicSiteContent | null): content is PublicSiteContent {
  return content !== null;
}

export function shouldRenderPromotion(promotion: PublicSiteContent['sections']['promotion']) {
  return promotion.enabled;
}
