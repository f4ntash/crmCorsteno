import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ConfigFields } from './ConfigFields';
import { validateConfigFields, type ConfigFieldErrors, type ConfigFieldValues } from './fields';
import type { ConfigSectionDefinition } from './sections';
import { useConfigEditorState } from './useConfigEditorState';

export type ConfigEditorProps = {
  sections: ConfigSectionDefinition[];
  initialValues: ConfigFieldValues;
  values: ConfigFieldValues;
  onChange: (key: string, value: unknown) => void;
  onSave?: () => void | boolean | Promise<void | boolean>;
  errors?: ConfigFieldErrors;
  showValidation?: boolean;
  loading?: boolean;
  saving?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  saveLabel?: string;
  saveMessage?: string;
  saveError?: string;
  secondaryAction?: ReactNode;
  onDirtyChange?: (dirty: boolean) => void;
};

type ConfigIssue = { key: string; label: string; section: string; error: string };

export function ConfigEditor({
  sections,
  initialValues,
  values,
  onChange,
  onSave,
  errors = {},
  showValidation = false,
  loading = false,
  saving = false,
  disabled = false,
  readOnly = false,
  saveLabel = 'Guardar',
  saveMessage,
  saveError,
  secondaryAction,
  onDirtyChange,
}: ConfigEditorProps) {
  const { dirty, reset } = useConfigEditorState(initialValues, values);
  const [localSaving, setLocalSaving] = useState(false);
  const [localSaveError, setLocalSaveError] = useState('');
  const isReadOnly = disabled || readOnly;
  const shouldValidate = showValidation || Boolean(onSave);
  const fieldDefinitions = useMemo(() => sections.flatMap((section) => section.fields), [sections]);
  const validationErrors = useMemo(() => validateConfigFields(fieldDefinitions, values), [fieldDefinitions, values]);
  const resolvedErrors = useMemo(() => Object.fromEntries(
    fieldDefinitions.map((field) => [field.key, errors[field.key] ?? (shouldValidate ? validationErrors[field.key] : undefined)]),
  ), [errors, fieldDefinitions, shouldValidate, validationErrors]);
  const issues = useMemo<ConfigIssue[]>(() => sections.flatMap((section) => section.fields.flatMap((field) => {
    const error = resolvedErrors[field.key];
    return error ? [{ key: field.key, label: field.label, section: section.title, error }] : [];
  })), [resolvedErrors, sections]);
  const hasErrors = issues.length > 0;
  const effectiveSaving = saving || localSaving;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  async function save() {
    if (!onSave || !dirty || effectiveSaving || isReadOnly || hasErrors) return;
    setLocalSaveError('');
    setLocalSaving(true);
    try {
      const saved = await onSave();
      if (saved !== false) reset(values);
    } catch (error) {
      setLocalSaveError(error instanceof Error ? error.message : 'No se pudo guardar.');
    } finally {
      setLocalSaving(false);
    }
  }

  if (loading) return <div className="loading-state" aria-live="polite"><span className="loading-mark" />Cargando configuración…</div>;

  return <div className="config-editor">
    {sections.map((section) => {
      const sectionFields = <ConfigFields
        fields={section.fields}
        values={values}
        onChange={onChange}
        errors={resolvedErrors}
        showValidation={shouldValidate}
        disabled={isReadOnly}
      />;
      if (section.collapsible) return <details className="config-editor-section" key={section.id} open>
        <summary className="config-editor-section-heading"><span><strong>{section.title}</strong>{section.description && <small>{section.description}</small>}</span></summary>
        {sectionFields}
      </details>;
      return <section className="config-editor-section" key={section.id} aria-labelledby={`config-section-${section.id}`}>
        <div className="config-editor-section-heading"><div><h5 id={`config-section-${section.id}`}>{section.title}</h5>{section.description && <p>{section.description}</p>}</div></div>
        {sectionFields}
      </section>;
    })}
    {shouldValidate && hasErrors && <div className="config-editor-validation" role="alert" aria-live="polite">
      <strong>Revisá estos campos antes de guardar:</strong>
      <ul>{issues.map((issue) => <li key={`${issue.section}-${issue.key}`}><span>{issue.section} · {issue.label}: </span>{issue.error}</li>)}</ul>
    </div>}
    {onSave && <div className="config-editor-save-row">
      {dirty && <span className="dirty">Cambios sin guardar</span>}
      {saveMessage && <span className="success" role="status">{saveMessage}</span>}
      {(saveError || localSaveError) && <span className="error" role="alert">{saveError || localSaveError}</span>}
      {secondaryAction}
      {!isReadOnly && <button type="button" disabled={!dirty || effectiveSaving || hasErrors} onClick={() => void save()}>{effectiveSaving ? 'Guardando…' : saveLabel}</button>}
    </div>}
  </div>;
}
