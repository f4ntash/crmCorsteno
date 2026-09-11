export type ConfigFieldOption = { value: string; label: string };

type ConfigFieldBase = {
  key: string;
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
};

export type ConfigFieldDefinition =
  | (ConfigFieldBase & { type: 'text' | 'textarea'; minLength?: number; maxLength?: number })
  | (ConfigFieldBase & { type: 'url'; maxLength?: number })
  | (ConfigFieldBase & { type: 'image'; categories?: string[] })
  | (ConfigFieldBase & { type: 'number'; min?: number; max?: number; integer?: boolean; step?: number })
  | (ConfigFieldBase & { type: 'boolean' })
  | (ConfigFieldBase & { type: 'select'; options: ConfigFieldOption[] })
  | (ConfigFieldBase & { type: 'asset'; categories?: string[] });

export type ConfigFieldValues = Record<string, unknown>;
export type ConfigFieldErrors = Record<string, string | undefined>;

function missing(value: unknown) {
  return value === undefined || value === null || typeof value === 'string' && value.trim() === '';
}

export function validateConfigField(field: ConfigFieldDefinition, value: unknown): string | undefined {
  if (field.required && missing(value)) return 'Este campo es obligatorio.';
  if (missing(value)) return undefined;
  if ((field.type === 'text' || field.type === 'textarea')) {
    if (typeof value !== 'string') return 'Ingresá un texto válido.';
    if (field.minLength !== undefined && value.length < field.minLength) return `Usá al menos ${field.minLength} caracteres.`;
    if (field.maxLength !== undefined && value.length > field.maxLength) return `Usá hasta ${field.maxLength} caracteres.`;
  }
  if (field.type === 'url') {
    if (typeof value !== 'string') return 'Ingresá un destino válido.';
    if (field.maxLength !== undefined && value.length > field.maxLength) return `Usá hasta ${field.maxLength} caracteres.`;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (trimmed.split('').some((character) => character.charCodeAt(0) < 32) || trimmed.includes('\\')) return 'Ingresá un destino válido.';
    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return undefined;
    try {
      const parsed = new URL(trimmed);
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) return 'Usá una URL http://, https:// o una ruta del sitio.';
    } catch {
      return 'Usá una URL http://, https:// o una ruta del sitio.';
    }
  }
  if (field.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'Ingresá un número válido.';
    if (field.min !== undefined && value < field.min) return `El valor mínimo es ${field.min}.`;
    if (field.max !== undefined && value > field.max) return `El valor máximo es ${field.max}.`;
    if (field.integer && !Number.isInteger(value)) return 'Ingresá un número entero.';
  }
  if (field.type === 'select' && (typeof value !== 'string' || !field.options.some((option) => option.value === value))) return 'Elegí una opción válida.';
  if ((field.type === 'asset' || field.type === 'image') && typeof value !== 'string') return 'Seleccioná un archivo válido.';
  return undefined;
}

export function validateConfigFields(fields: ConfigFieldDefinition[], values: ConfigFieldValues): ConfigFieldErrors {
  return Object.fromEntries(fields.map((field) => [field.key, validateConfigField(field, values[field.key])]));
}
