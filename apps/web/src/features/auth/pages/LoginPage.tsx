import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../../../shared/api/client';
type LegacyJson = ReturnType<JSON['parse']>;
async function get<T = LegacyJson>(path: string, org?: string, init?: RequestInit) { return apiRequest<T>(path, org, init); }

export function LoginPage() {
  const n = useNavigate();
  const [e, se] = useState('admin@corsteno.local'),
    [p, sp] = useState('ChangeMe123!'),
    [x, sx] = useState(''),
    [pending, setPending] = useState(false);
  return (
    <main className="login-layout">
      <section className="login-intro">
        <div className="brand-lockup"><b>CORSTENO</b><small>Operations</small></div>
        <div><p className="eyebrow">CONTROL DE EXPERIENCIAS</p><h1>Operaciones claras.<br />Decisiones rápidas.</h1><p>Gestioná experiencias, resultados y operaciones comerciales desde un único espacio de trabajo.</p></div>
        <small>Corsteno CRM</small>
      </section>
      <section className="login-panel">
        <div className="login-form-heading"><p className="eyebrow">ACCESO SEGURO</p><h2>Ingresá a tu cuenta</h2><p>Usá las credenciales de tu organización.</p></div>
      <form
        onSubmit={async (v) => {
          v.preventDefault();
          setPending(true);
          sx('');
          try {
            await get('/auth/login', undefined, {
              method: 'POST',
              body: JSON.stringify({ email: e, password: p }),
            });
            n('/app');
          } catch (z) {
            sx((z as Error).message);
          } finally {
            setPending(false);
          }
        }}
      >
        <label>
          Correo electrónico
          <input type="email" autoComplete="email" value={e} onChange={(v) => se(v.target.value)} />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            autoComplete="current-password"
            value={p}
            onChange={(v) => sp(v.target.value)}
          />
        </label>
        {x && <p className="alert alert-danger" role="alert">{x}</p>}
        <button disabled={pending}>{pending ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
      </section>
    </main>
  );
}
