import type { ReactNode } from 'react';

type RouletteExperiencePageProps = {
  children: ReactNode;
  returnToEditor?: string;
};

export function RouletteExperiencePage({ children, returnToEditor }: RouletteExperiencePageProps) {
  return (
    <main>
      <div className="roulette-page-toolbar">
        {returnToEditor
          ? <a className="secondary-cta roulette-preview-return" href={returnToEditor}>← Volver al editor</a>
          : <span className="roulette-page-toolbar-spacer" aria-hidden="true" />}
      </div>
      {children}
    </main>
  );
}
