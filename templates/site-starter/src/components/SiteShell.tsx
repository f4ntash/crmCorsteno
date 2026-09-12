import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { brand } from '../config/brand';

export function SiteShell({ siteName, children }: { siteName?: string; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const displayName = siteName?.trim() || brand.siteName;
  return <div className="site-shell">
    <header className="site-header">
      <Link className="site-brand" to="/" onClick={() => setMenuOpen(false)} aria-label={`Inicio de ${displayName}`}>
        {brand.logoPath ? <img src={brand.logoPath} alt={displayName} /> : <span>{displayName}</span>}
      </Link>
      <button className="site-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="site-navigation" onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? 'Cerrar' : 'Menú'}</button>
      <nav id="site-navigation" className={`site-navigation${menuOpen ? ' is-open' : ''}`} aria-label="Navegación principal">
        <Link to="/" onClick={() => setMenuOpen(false)}>Inicio</Link>
        <Link to="/productos" onClick={() => setMenuOpen(false)}>Productos</Link>
      </nav>
    </header>
    <main>{children}</main>
    <footer className="site-footer"><span>{displayName}</span></footer>
  </div>;
}
