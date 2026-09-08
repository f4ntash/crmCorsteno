import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../../../shared/api/client';
type LegacyJson = ReturnType<JSON['parse']>;
async function get<T = LegacyJson>(path: string, org?: string, init?: RequestInit) { return apiRequest<T>(path, org, init); }

export function LoginPage() {
  const n = useNavigate();
  const [e, se] = useState('admin@corsteno.local'),
    [p, sp] = useState('ChangeMe123!'),
    [x, sx] = useState('');
  return (
    <main className="center">
      <p className="eyebrow">CORSTENO / ACCESS</p>
      <h1>Bienvenido</h1>
      <form
        onSubmit={async (v) => {
          v.preventDefault();
          try {
            await get('/auth/login', undefined, {
              method: 'POST',
              body: JSON.stringify({ email: e, password: p }),
            });
            n('/app');
          } catch (z) {
            sx((z as Error).message);
          }
        }}
      >
        <label>
          Email
          <input type="email" value={e} onChange={(v) => se(v.target.value)} />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={p}
            onChange={(v) => sp(v.target.value)}
          />
        </label>
        {x && <p className="error">{x}</p>}
        <button>Ingresar</button>
      </form>
    </main>
  );
}
