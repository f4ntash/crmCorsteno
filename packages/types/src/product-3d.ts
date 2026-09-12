export const PRODUCT_3D_SCHEMA_VERSION = 1 as const;

export const PRODUCT_3D_LIMITS = {
  scaleMin: 0.01,
  scaleMax: 100,
  positionMaxAbs: 100,
  rotationMaxAbs: 360,
} as const;

export type Product3DTransform = {
  scale: number;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
};

export type Product3DConfig = {
  schemaVersion: typeof PRODUCT_3D_SCHEMA_VERSION;
  transform: Product3DTransform;
  viewer: { framing: 'auto' };
  arEnabled: boolean;
};

export type Product3DValidationIssue = {
  code: string;
  path: string;
  message: string;
};

export function defaultProduct3DConfig(): Product3DConfig {
  return {
    schemaVersion: PRODUCT_3D_SCHEMA_VERSION,
    transform: {
      scale: 1,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 180, z: 0 },
    },
    viewer: { framing: 'auto' },
    arEnabled: false,
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value);
}

function issue(code: string, path: string, message: string): Product3DValidationIssue {
  return { code, path, message };
}

export function product3DConfigIssues(value: unknown, path = 'config'): Product3DValidationIssue[] {
  const root = record(value);
  if (!root) return [issue('PRODUCT_3D_CONFIG_INVALID', path, 'La configuración 3D debe ser un objeto válido.')];
  const issues: Product3DValidationIssue[] = [];
  if (root.schemaVersion !== PRODUCT_3D_SCHEMA_VERSION) issues.push(issue('PRODUCT_3D_SCHEMA_UNSUPPORTED', `${path}.schemaVersion`, 'La configuración 3D no es compatible.'));

  const transform = record(root.transform);
  if (!transform) {
    issues.push(issue('PRODUCT_3D_TRANSFORM_INVALID', `${path}.transform`, 'Falta la transformación del modelo.'));
  } else {
    const scale = transform.scale;
    if (!finiteNumber(scale) || (scale as number) < PRODUCT_3D_LIMITS.scaleMin || (scale as number) > PRODUCT_3D_LIMITS.scaleMax) issues.push(issue('PRODUCT_3D_SCALE_INVALID', `${path}.transform.scale`, `La escala debe ser un número entre ${PRODUCT_3D_LIMITS.scaleMin} y ${PRODUCT_3D_LIMITS.scaleMax}.`));
    for (const axis of ['x', 'y', 'z'] as const) {
      const position = record(transform.position);
      if (!position || !finiteNumber(position[axis]) || Math.abs(position[axis] as number) > PRODUCT_3D_LIMITS.positionMaxAbs) issues.push(issue('PRODUCT_3D_POSITION_INVALID', `${path}.transform.position.${axis}`, `La posición ${axis.toUpperCase()} debe ser un número entre -${PRODUCT_3D_LIMITS.positionMaxAbs} y ${PRODUCT_3D_LIMITS.positionMaxAbs}.`));
      const rotation = record(transform.rotation);
      if (!rotation || !finiteNumber(rotation[axis]) || Math.abs(rotation[axis] as number) > PRODUCT_3D_LIMITS.rotationMaxAbs) issues.push(issue('PRODUCT_3D_ROTATION_INVALID', `${path}.transform.rotation.${axis}`, `La rotación ${axis.toUpperCase()} debe estar expresada en grados entre -${PRODUCT_3D_LIMITS.rotationMaxAbs} y ${PRODUCT_3D_LIMITS.rotationMaxAbs}.`));
    }
  }

  const viewer = record(root.viewer);
  if (!viewer || viewer.framing !== 'auto') issues.push(issue('PRODUCT_3D_VIEWER_INVALID', `${path}.viewer.framing`, 'El encuadre inicial debe usar el modo automático.'));
  if (typeof root.arEnabled !== 'boolean') issues.push(issue('PRODUCT_3D_AR_INVALID', `${path}.arEnabled`, 'La configuración de AR debe indicar si está habilitada.'));
  return issues;
}

export function parseProduct3DConfig(value: unknown): Product3DConfig | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return product3DConfigIssues(parsed).length ? null : parsed as Product3DConfig;
  } catch {
    return null;
  }
}
