import { useEffect, useState } from 'react';
import type { PublicSiteContent } from '@corsteno/client';
import { corsteno } from '../lib/corsteno';
import { ErrorState, LoadingState } from '../components/PageStates';
import { HeroSection } from '../components/HeroSection';
import { PromotionSection } from '../components/PromotionSection';
import { CtaLink } from '../utils/urls';

export function HomePage({ onSiteName }: { onSiteName: (name: string) => void }) {
  const [content, setContent] = useState<PublicSiteContent | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const load = () => {
    setState('loading');
    void corsteno.getContent().then((response) => { onSiteName(response.site.name); setContent(response.content); setState('ready'); }).catch(() => setState('error'));
  };
  useEffect(load, [onSiteName]);
  if (state === 'loading') return <LoadingState label="Cargando sitio…" />;
  if (state === 'error') return <ErrorState onRetry={load} label="El sitio no está disponible en este momento." />;
  if (!content) return <div className="page-state"><h1>Contenido próximamente</h1><p>Este sitio todavía no tiene contenido publicado.</p><CtaLink url="/productos">Ver productos</CtaLink></div>;
  return <div className="home-page"><HeroSection hero={content.sections.hero} /><PromotionSection promotion={content.sections.promotion} /></div>;
}
