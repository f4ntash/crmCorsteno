import type { PublicSiteContent } from '@corsteno/client';
import { CtaLink } from '../utils/urls';

export function HeroSection({ hero }: { hero: PublicSiteContent['sections']['hero'] }) {
  return <section className="hero-section">
    <div className="hero-copy"><p className="section-kicker">Presentación</p><h1>{hero.title || 'Una experiencia hecha para vos'}</h1><p>{hero.description}</p>{hero.ctaLabel && hero.ctaUrl && <CtaLink url={hero.ctaUrl}>{hero.ctaLabel}</CtaLink>}</div>
    {hero.image ? <img className="hero-image" src={hero.image.url} alt={hero.title || 'Presentación'} /> : <div className="hero-image hero-image-empty" aria-hidden="true" />}
  </section>;
}
