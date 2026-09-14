export const FINDER_QUEUE_NAME = 'corsteno-finder-jobs';
export const FINDER_EXTERNAL_MODE = 'external_dry_run';
export const FINDER_PERSIST_TEST_MODE = 'external_persist_test';
export const FINDER_PERSIST_MODE = 'external_persist';
export const FINDER_DRY_RUN_LIMITS = { min: 1, max: 3 } as const;
export const FINDER_PERSIST_TEST_LIMIT = 1;
export const FINDER_PERSIST_LIMITS = [5, 10, 25] as const;
export const FINDER_PERSIST_BATCH_SIZE = 5;
export const FINDER_PERSIST_SAFETY_MULTIPLIER = 3;

export const FINDER_CATEGORIES = [
  'inmobiliaria', 'desarrolladora inmobiliaria', 'constructora', 'estudio de arquitectura', 'arquitecto',
  'diseño de interiores', 'mueblería', 'fábrica de muebles', 'aberturas', 'carpintería de aluminio',
  'iluminación', 'casa de electricidad', 'pisos y revestimientos', 'cerámicos', 'sanitarios', 'cocinas',
  'decoración', 'piscinas', 'paisajismo', 'hotel', 'hotel boutique', 'cabañas', 'complejo turístico',
  'agencia de turismo', 'salón de eventos', 'centro de convenciones', 'productora de eventos',
  'concesionaria de autos', 'concesionaria de motos', 'maquinaria agrícola', 'maquinaria industrial',
  'fábrica', 'empresa industrial', 'showroom', 'local de diseño', 'bodega', 'restaurante premium',
] as const;

export type FinderJobMessage = { version: 1; jobId: string; organizationId: string };
export type FinderDiscoverySummary = {
  candidatesSeen: number;
  uniqueCandidates: number;
  errors: number;
  blocked: boolean;
  durationSeconds: number;
  leadsCreated: 0;
};

export function isFinderCategory(value: unknown): value is typeof FINDER_CATEGORIES[number] {
  return typeof value === 'string' && FINDER_CATEGORIES.includes(value.trim().toLowerCase() as typeof FINDER_CATEGORIES[number]);
}
