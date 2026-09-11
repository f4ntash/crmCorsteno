import { AssetPicker } from '../../features/assets/AssetPicker';
import { validateConfigField, type ConfigFieldDefinition, type ConfigFieldErrors, type ConfigFieldValues } from './fields';

export type ConfigFieldsProps = {
  fields: ConfigFieldDefinition[];
  values: ConfigFieldValues;
  onChange: (key: string, value: unknown) => void;
  errors?: ConfigFieldErrors;
  showValidation?: boolean;
  disabled?: boolean;
  assetContext?: { org: string; canUpload?: boolean };
};

function fieldValue(value: unknown) {
  return value === undefined || value === null ? '' : String(value);
}

export function ConfigFields({ fields, values, onChange, errors = {}, showValidation = false, disabled = false, assetContext }: ConfigFieldsProps) {
  return <div className="config-fields">
    {fields.map((field) => {
      const value = values[field.key];
      const validationError = showValidation ? validateConfigField(field, value) : undefined;
      const error = errors[field.key] ?? validationError;
      const inputId = `config-field-${field.key}`;
      return <div className="config-field" key={field.key}>
        {field.type !== 'boolean' && <label htmlFor={inputId}>{field.label}</label>}
        {field.type === 'text' && <input id={inputId} type="text" value={fieldValue(value)} disabled={disabled} required={field.required} maxLength={field.maxLength} placeholder={field.placeholder} onChange={(event) => onChange(field.key, event.target.value)} />}
        {field.type === 'textarea' && <textarea id={inputId} value={fieldValue(value)} disabled={disabled} required={field.required} maxLength={field.maxLength} placeholder={field.placeholder} onChange={(event) => onChange(field.key, event.target.value)} />}
        {field.type === 'number' && <input id={inputId} type="number" value={fieldValue(value)} disabled={disabled} required={field.required} min={field.min} max={field.max} step={field.step ?? (field.integer ? 1 : undefined)} placeholder={field.placeholder} onChange={(event) => onChange(field.key, event.target.value === '' ? undefined : Number(event.target.value))} />}
        {field.type === 'boolean' && <label className="config-field-boolean"><input id={inputId} type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(event) => onChange(field.key, event.target.checked)} />{field.label}</label>}
        {field.type === 'select' && <select id={inputId} value={fieldValue(value)} disabled={disabled} required={field.required} onChange={(event) => onChange(field.key, event.target.value)}><option value="" disabled>{field.placeholder ?? 'Seleccionar'}</option>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}
        {field.type === 'asset' && (assetContext ? <AssetPicker org={assetContext.org} value={typeof value === 'string' ? value : null} onChange={(next) => onChange(field.key, next)} categories={field.categories} canUpload={assetContext.canUpload} disabled={disabled} label={field.placeholder ?? 'Seleccionar archivo'} /> : <p className="config-field-missing">Se necesita una organización para seleccionar archivos.</p>)}
        {field.description && <small className="config-field-description">{field.description}</small>}
        {error && <small className="config-field-error" role="alert">{error}</small>}
      </div>;
    })}
  </div>;
}
