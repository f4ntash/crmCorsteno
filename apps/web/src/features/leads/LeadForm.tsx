import { useEffect, useState } from 'react';

export type LeadFormValues = {
  businessName: string;
  category: string;
  subcategory: string;
  description: string;
  website: string;
  city: string;
  provinceState: string;
  country: string;
  address: string;
  googleMapsUrl: string;
  instagramUrl: string;
  linkedinUrl: string;
  phone: string;
  contactName: string;
  contactRole: string;
  contactEmail: string;
  source: string;
  sourceReference: string;
  score: string;
  recommendedOffer: string;
  recommendedDemo: string;
  status: string;
  notes: string;
};

type LeadLike = Partial<Record<Exclude<keyof LeadFormValues, 'score'>, string | null>> & { score?: number | string | null };

const emptyValues: LeadFormValues = {
  businessName: '', category: '', subcategory: '', description: '', website: '', city: '', provinceState: '', country: '', address: '',
  googleMapsUrl: '', instagramUrl: '', linkedinUrl: '', phone: '', contactName: '', contactRole: '', contactEmail: '', source: 'manual',
  sourceReference: '', score: '', recommendedOffer: '', recommendedDemo: '', status: 'NEW', notes: '',
};

function formValues(initial?: LeadLike): LeadFormValues {
  return Object.fromEntries(Object.keys(emptyValues).map((key) => {
    const value = initial?.[key as keyof LeadLike];
    return [key, key === 'score' ? (value === null || value === undefined ? '' : String(value)) : String(value ?? emptyValues[key as keyof LeadFormValues])];
  })) as unknown as LeadFormValues;
}

export function leadPayload(values: LeadFormValues) {
  return { ...values, score: values.score === '' ? null : Number(values.score) };
}

export function LeadForm({ title, initial, submitLabel, submitting, error, onSubmit, onCancel }: {
  title: string;
  initial?: LeadLike;
  submitLabel: string;
  submitting: boolean;
  error: string;
  onSubmit: (values: LeadFormValues) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState(() => formValues(initial));
  const [validationError, setValidationError] = useState('');
  useEffect(() => { setValues(formValues(initial)); setValidationError(''); }, [initial]);
  const set = (key: keyof LeadFormValues, value: string) => setValues((current) => ({ ...current, [key]: value }));
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const required = ['businessName', 'category', 'website', 'city', 'provinceState', 'country', 'source'] as const;
    if (required.some((key) => !values[key].trim())) { setValidationError('Completá empresa, categoría, sitio web, ciudad, provincia/estado, país y fuente.'); return; }
    if (values.score !== '' && (!Number.isInteger(Number(values.score)) || Number(values.score) < 0 || Number(values.score) > 100)) { setValidationError('El score debe ser un número entero entre 0 y 100.'); return; }
    setValidationError('');
    onSubmit(values);
  }
  const field = (key: keyof LeadFormValues, label: string, options: { required?: boolean; type?: string; placeholder?: string } = {}) => { const id = `lead-form-${key}`; return <label key={key} htmlFor={id}>{label}{options.required ? ' *' : ''}<input id={id} autoFocus={key === 'businessName'} type={options.type ?? 'text'} value={values[key]} onChange={(event) => set(key, event.target.value)} placeholder={options.placeholder} required={options.required} /></label>; };
  return <section className="modal-card lead-form-modal" role="dialog" aria-modal="true" aria-labelledby="lead-form-title" onClick={(event) => event.stopPropagation()}>
    <div className="lead-drawer-head"><div><p className="eyebrow">CRM · LEADS</p><h2 id="lead-form-title">{title}</h2></div><button className="button button-quiet" type="button" onClick={onCancel}>Cerrar</button></div>
    <form className="lead-form" onSubmit={submit}>
      {(validationError || error) && <p className="finder-error" id="lead-form-error" role="alert">{validationError || error}</p>}
      <div className="lead-form-grid">{field('businessName', 'Empresa', { required: true })}{field('website', 'Sitio web', { required: true, placeholder: 'https://ejemplo.com' })}{field('category', 'Categoría', { required: true })}{field('subcategory', 'Subcategoría')}{field('city', 'Ciudad', { required: true })}{field('provinceState', 'Provincia / estado', { required: true })}{field('country', 'País', { required: true })}{field('address', 'Dirección')}{field('source', 'Fuente', { required: true })}{field('sourceReference', 'Referencia de fuente')}{field('contactName', 'Contacto')}{field('contactRole', 'Rol del contacto')}{field('contactEmail', 'Email', { type: 'email' })}{field('phone', 'Teléfono')}{field('recommendedOffer', 'Oferta recomendada')}{field('recommendedDemo', 'Demo recomendada')}{field('score', 'Score', { type: 'number', placeholder: '0 a 100' })}<label htmlFor="lead-form-status">Estado<select id="lead-form-status" value={values.status} onChange={(event) => set('status', event.target.value)}>{['NEW', 'ENRICHING', 'QUALIFIED', 'TO_CONTACT', 'CONTACTED', 'REPLIED', 'MEETING', 'OPPORTUNITY', 'WON', 'LOST'].map((status) => <option key={status} value={status}>{status}</option>)}</select></label></div>
      <label htmlFor="lead-form-description">Descripción<textarea id="lead-form-description" value={values.description} onChange={(event) => set('description', event.target.value)} rows={3} /></label>
      <label htmlFor="lead-form-notes">Notas<textarea id="lead-form-notes" value={values.notes} onChange={(event) => set('notes', event.target.value)} rows={3} /></label>
      <div className="lead-form-actions"><button className="button button-quiet" type="button" onClick={onCancel}>Cancelar</button><button className="button button-primary" type="submit" disabled={submitting}>{submitting ? 'Guardando…' : submitLabel}</button></div>
    </form>
  </section>;
}
