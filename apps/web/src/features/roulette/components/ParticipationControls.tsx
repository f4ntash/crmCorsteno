import { useEffect, useMemo, useState } from 'react';
import { ROULETTE_LIMITS } from '@corsteno/types';
import type { RouletteConfig } from '../types';

type ParticipationKey = 'maxSpinsPerDevice' | 'maxSpinsPerSession' | 'cooldownSeconds';
type RawValues = Record<ParticipationKey, string>;

function valuesFromDraft(draft: RouletteConfig): RawValues {
  const participation = draft.participation ?? { maxSpinsPerDevice: null, maxSpinsPerSession: null, cooldownSeconds: 0 };
  return {
    maxSpinsPerDevice: participation.maxSpinsPerDevice == null ? '' : String(participation.maxSpinsPerDevice),
    maxSpinsPerSession: participation.maxSpinsPerSession == null ? '' : String(participation.maxSpinsPerSession),
    cooldownSeconds: String(participation.cooldownSeconds ?? 0),
  };
}

function errorFor(key: ParticipationKey, value: string) {
  if (value === '' && key !== 'cooldownSeconds') return '';
  if (!/^\d+$/.test(value)) return key === 'cooldownSeconds' ? 'Ingresá segundos enteros.' : 'Ingresá un número entero o dejá el campo vacío.';
  const number = Number(value);
  if (key === 'cooldownSeconds') return number > ROULETTE_LIMITS.cooldownSeconds ? 'El máximo es 604800 segundos.' : '';
  return number < 1 || number > ROULETTE_LIMITS.participationLimit ? 'Usá un límite entre 1 y 100.' : '';
}

export function ParticipationControls({
  draft,
  onChange,
  showValidation = false,
  onValidityChange,
}: {
  draft: RouletteConfig;
  onChange: (participation: NonNullable<RouletteConfig['participation']>) => void;
  showValidation?: boolean;
  onValidityChange?: (valid: boolean) => void;
}) {
  const [raw, setRaw] = useState<RawValues>(() => valuesFromDraft(draft));
  useEffect(() => setRaw(valuesFromDraft(draft)), [draft.participation?.maxSpinsPerDevice, draft.participation?.maxSpinsPerSession, draft.participation?.cooldownSeconds]);
  const errors = useMemo(() => Object.fromEntries((Object.keys(raw) as ParticipationKey[]).map((key) => [key, errorFor(key, raw[key])])), [raw]);
  const isValid = Object.values(errors).every((value) => !value);

  function update(key: ParticipationKey, value: string) {
    const next = { ...raw, [key]: value };
    setRaw(next);
    const nextErrors = Object.fromEntries((Object.keys(next) as ParticipationKey[]).map((item) => [item, errorFor(item, next[item])]));
    const nextValid = Object.values(nextErrors).every((item) => !item);
    onValidityChange?.(nextValid);
    if (!nextValid) return;
    const toNumber = (item: string, fallback: number | null) => item === '' ? fallback : Number(item);
    onChange({
      maxSpinsPerDevice: toNumber(next.maxSpinsPerDevice, null),
      maxSpinsPerSession: toNumber(next.maxSpinsPerSession, null),
      cooldownSeconds: toNumber(next.cooldownSeconds, 0) ?? 0,
    });
  }

  const fields: Array<{ key: ParticipationKey; label: string; help: string; placeholder?: string }> = [
    { key: 'maxSpinsPerDevice', label: 'Límite por dispositivo', help: 'Cantidad máxima de giros desde un mismo dispositivo.', placeholder: 'Sin límite' },
    { key: 'maxSpinsPerSession', label: 'Límite por sesión', help: 'Cantidad máxima de giros dentro de una sesión.', placeholder: 'Sin límite' },
    { key: 'cooldownSeconds', label: 'Tiempo entre giros', help: 'Esperá este tiempo antes de permitir otro giro.', placeholder: '0' },
  ];

  return (
    <fieldset className="participation-controls">
      <legend className="sr-only">Límites de participación</legend>
      <p className="field-help">Estos límites se aplican en el runtime público y no cambian la selección de premios.</p>
      <div className="participation-fields">
        {fields.map(({ key, label, help, placeholder }) => {
          const error = errors[key];
          const errorId = `roulette-${key}-error`;
          return <label key={key} className="compact-field">
            <span>{label}</span>
            <input type="text" inputMode="numeric" value={raw[key]} placeholder={placeholder} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={(event) => update(key, event.target.value)} />
            <small>{help}</small>
            {error && <span className="field-error" id={errorId}>{error}</span>}
          </label>;
        })}
      </div>
      {!isValid && showValidation && <p className="field-error" role="alert">Revisá los límites de participación antes de guardar.</p>}
    </fieldset>
  );
}
