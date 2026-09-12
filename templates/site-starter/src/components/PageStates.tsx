export function LoadingState({ label = 'Cargando…' }: { label?: string }) {
  return <div className="page-state" role="status"><span className="loading-dot" />{label}</div>;
}

export function ErrorState({ onRetry, label = 'No pudimos cargar este contenido.' }: { onRetry: () => void; label?: string }) {
  return <div className="page-state page-state-error" role="alert"><h1>Algo salió mal</h1><p>{label}</p><button type="button" className="site-button" onClick={onRetry}>Reintentar</button></div>;
}

export function NotFoundState() {
  return <div className="page-state"><h1>No encontramos ese producto</h1><p>Revisá el enlace o volvé a ver todos los productos.</p></div>;
}
