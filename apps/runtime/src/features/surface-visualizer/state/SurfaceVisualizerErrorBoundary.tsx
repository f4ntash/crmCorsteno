import { Component, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

export class SurfaceVisualizerErrorBoundary extends Component<{ slug: string; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override componentDidCatch() { /* Keep implementation details out of the public fallback. */ }
  override render() {
    if (this.state.failed) return <main style={{ display: 'grid', minHeight: '100vh', placeItems: 'center', padding: 24, boxSizing: 'border-box', background: '#f3f0e9', color: '#202a29' }}><section style={{ maxWidth: 440, padding: 28, border: '1px solid #d9d3c8', background: '#fbfaf7', textAlign: 'center' }}><h1 style={{ font: '500 1.8rem Georgia,serif' }}>No pudimos cargar el visualizador.</h1><Link style={{ display: 'inline-flex', minHeight: 44, alignItems: 'center', padding: '0 16px', background: '#334c47', color: '#fbfaf7', fontSize: 13, fontWeight: 700, textDecoration: 'none' }} to={`/r/${encodeURIComponent(this.props.slug)}`}>Volver al catálogo</Link></section></main>;
    return this.props.children;
  }
}
