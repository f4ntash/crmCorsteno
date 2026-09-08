import { useEffect, useState } from 'react';
import { experiencesApi } from '../api';

type AccessPeriod = {
  id: string;
  startsAt: string;
  endsAt: string;
  source: string;
  note: string | null;
};
type AccessStatus =
  'legacy_unrestricted' | 'scheduled' | 'active' | 'expired' | 'no_access';
const labels: Record<AccessStatus, string> = {
  legacy_unrestricted: 'Sin restricciones',
  scheduled: 'Programada',
  active: 'Activa',
  expired: 'Vencida',
  no_access: 'Sin acceso',
};

function localInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
function utcValue(value: string) {
  return new Date(value).toISOString();
}
function displayDate(value: string) {
  return new Date(value).toLocaleString('es-AR');
}

export function AccessPeriodPanel({
  experienceId,
  organizationId,
  canManage,
}: {
  experienceId: string;
  organizationId: string;
  canManage: boolean;
}) {
  const [periods, setPeriods] = useState<AccessPeriod[]>([]);
  const [status, setStatus] = useState<AccessStatus>('legacy_unrestricted');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function load() {
    try {
      const result = await experiencesApi.accessPeriods(
        experienceId,
        organizationId,
      );
      setPeriods(result.items);
      setStatus(result.status);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [experienceId, organizationId]);
  async function addPeriod(start: string, end: string, periodNote = note) {
    if (
      !start ||
      !end ||
      new Date(start).getTime() >= new Date(end).getTime()
    ) {
      setError('La fecha de fin debe ser posterior al inicio.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await experiencesApi.createAccessPeriod(experienceId, organizationId, {
        starts_at: utcValue(start),
        ends_at: utcValue(end),
        note: periodNote || undefined,
      });
      setStartsAt('');
      setEndsAt('');
      setNote('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  function extend(days: number) {
    const latest = periods.reduce(
      (current, item) =>
        !current || item.endsAt > current.endsAt ? item : current,
      null as AccessPeriod | null,
    );
    if (!latest) {
      setError('Agregá una vigencia antes de extenderla.');
      return;
    }
    const start = new Date(latest.endsAt);
    const end = new Date(start.getTime() + days * 86400000);
    void addPeriod(
      localInput(start.toISOString()),
      localInput(end.toISOString()),
      `Extensión de ${days} días`,
    );
  }
  const latest = periods.reduce(
    (current, item) =>
      !current || item.endsAt > current.endsAt ? item : current,
    null as AccessPeriod | null,
  );
  return (
    <section className="card access-period-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ENTITLEMENT</p>
          <h2>Vigencia comercial</h2>
        </div>
        <span className={`status status-${status}`}>{labels[status]}</span>
      </div>
      {latest && (
        <p>
          <strong>Período actual</strong>
          <br />
          {displayDate(latest.startsAt)} → {displayDate(latest.endsAt)}
        </p>
      )}
      {periods.length > 0 && (
        <div>
          <h3>Historial</h3>
          <ul>
            {periods.map((period) => (
              <li key={period.id}>
                {displayDate(period.startsAt)} → {displayDate(period.endsAt)}
                {period.note ? ` · ${period.note}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {canManage && (
        <>
          <h3>Agregar vigencia</h3>
          <div className="access-period-form">
            <label>
              Desde
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </label>
            <label>
              Hasta
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </label>
            <label>
              Nota opcional
              <input
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={saving}
              onClick={() => void addPeriod(startsAt, endsAt)}
            >
              {saving ? 'Guardando…' : 'Agregar vigencia'}
            </button>
          </div>
          {latest && (
            <div className="access-period-extensions">
              <span>Extender vigencia:</span>
              <button
                type="button"
                className="secondary"
                disabled={saving}
                onClick={() => extend(7)}
              >
                +7 días
              </button>
              <button
                type="button"
                className="secondary"
                disabled={saving}
                onClick={() => extend(30)}
              >
                +30 días
              </button>
              <button
                type="button"
                className="secondary"
                disabled={saving}
                onClick={() => extend(90)}
              >
                +90 días
              </button>
            </div>
          )}
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
