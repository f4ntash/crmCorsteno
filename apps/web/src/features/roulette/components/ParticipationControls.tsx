import type { RouletteConfig } from '../types';

type Props = { draft: RouletteConfig; onChange: (participation: NonNullable<RouletteConfig['participation']>) => void };
const defaults = { maxSpinsPerDevice: null, maxSpinsPerSession: null, cooldownSeconds: 0 };

export function ParticipationControls({ draft, onChange }: Props) {
  const participation = { ...defaults, ...draft.participation };
  const update = (key: keyof typeof participation, value: string) => onChange({ ...participation, [key]: value === '' ? key === 'cooldownSeconds' ? 0 : null : Number(value) });
  return <fieldset><legend>Participación</legend><p className="field-help">Controlá cuántas veces puede participar una persona.</p><label>Límite por dispositivo<input type="number" min="1" max="100" placeholder="Sin límite" value={participation.maxSpinsPerDevice ?? ''} onChange={(e) => update('maxSpinsPerDevice', e.target.value)} /></label><label>Límite por sesión<input type="number" min="1" max="100" placeholder="Sin límite" value={participation.maxSpinsPerSession ?? ''} onChange={(e) => update('maxSpinsPerSession', e.target.value)} /></label><label>Tiempo entre giros (segundos)<input type="number" min="0" max="604800" value={participation.cooldownSeconds} onChange={(e) => update('cooldownSeconds', e.target.value)} /></label></fieldset>;
}
