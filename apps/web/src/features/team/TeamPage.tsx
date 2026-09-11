import type React from 'react';
import { useEffect, useState } from 'react';
import { apiRequest, ApiError } from '../../shared/api/client';

type Member = {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer' | 'operator';
  status: 'active' | 'inactive';
};

const roleLabels: Record<Member['role'], string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  member: 'Miembro',
  viewer: 'Solo lectura',
  operator: 'Operador',
};
const roleHelp: Record<Member['role'], string> = {
  owner: 'Control total del espacio',
  admin: 'Gestiona campañas y equipo',
  member: 'Opera campañas y resultados',
  viewer: 'Puede consultar información',
  operator: 'Consulta y canjea premios',
};

export function TeamPage({ org, role, canManage, canAssignAdmin = false }: { org: string; role: string; canManage: boolean; canAssignAdmin?: boolean }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'member' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    if (!org) return;
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest<{ items: Member[] }>('/organizations/members', org);
      setMembers(result.items);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'No se pudo cargar el equipo');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, [org]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage('');
    try {
      await apiRequest('/organizations/members', org, { method: 'POST', body: JSON.stringify(form) });
      setDialog(false);
      setForm({ email: '', name: '', password: '', role: 'member' });
      await load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'No se pudo agregar al miembro');
    } finally {
      setSaving(false);
    }
  }
  async function changeRole(member: Member, next: string) {
    try {
      await apiRequest(`/organizations/members/${member.id}`, org, { method: 'PATCH', body: JSON.stringify({ role: next }) });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el rol');
    }
  }
  async function revoke(member: Member) {
    if (!window.confirm(`¿Revocar el acceso de ${member.name || member.email}?`)) return;
    try {
      await apiRequest(`/organizations/members/${member.id}`, org, { method: 'DELETE' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo revocar el acceso');
    }
  }

  return (
    <main className="page team-page">
      <div className="page-heading">
        <div><p className="eyebrow">ORGANIZACIÓN / ACCESO</p><h1>Equipo</h1><p className="page-description">Personas con acceso a este espacio de trabajo.</p></div>
        {canManage && <button className="button button-primary" onClick={() => { setMessage(''); setDialog(true); }}>Agregar miembro</button>}
      </div>
      {loading ? <p>Cargando equipo…</p> : error ? <div className="empty"><h2>{error}</h2><button className="button button-secondary" onClick={() => void load()}>Reintentar</button></div> : (
        <section className="team-list" aria-label="Miembros de la organización">
          <div className="team-list-head"><span>Persona</span><span>Rol y permisos</span><span>Estado</span><span>Acciones</span></div>
          {members.map((member) => <div className="team-row" key={member.id}>
            <div><strong>{member.name || 'Sin nombre'}</strong><small>{member.email}</small></div>
            <div>{canManage && member.role !== 'owner' ? <select aria-label={`Rol de ${member.email}`} value={member.role} onChange={(event) => void changeRole(member, event.target.value)}>{canAssignAdmin && <option value="admin">Administrador</option>}<option value="member">Miembro</option><option value="viewer">Solo lectura</option><option value="operator">Operador</option></select> : <strong>{roleLabels[member.role]}</strong>}<small>{roleHelp[member.role]}</small></div>
            <span className={`team-state team-state-${member.status}`}>{member.status === 'active' ? 'Activo' : 'Inactivo'}</span>
            <div>{canManage && member.status === 'active' && member.role !== 'owner' && <button className="button button-quiet" onClick={() => void revoke(member)}>Revocar acceso</button>}</div>
          </div>)}
        </section>
      )}
      {!canManage && role !== 'owner' && <p className="field-help">Tu acceso es de solo consulta para la gestión del equipo.</p>}
      {dialog && <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="team-dialog-title">
        <h2 id="team-dialog-title">Agregar miembro</h2><p className="field-help">No hay invitaciones por email. Se crea una cuenta con la contraseña inicial que definas.</p>
        <form onSubmit={add}>
          <label>Email<input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label>Nombre<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Contraseña inicial<input type="password" minLength={8} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><small className="field-help">Debe tener entre 8 y 200 caracteres. No se mostrará después.</small></label>
          <label>Rol<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="member">Miembro</option><option value="viewer">Solo lectura</option><option value="operator">Operador</option>{canAssignAdmin && <option value="admin">Administrador</option>}</select></label>
          {message && <p className="error" role="alert">{message}</p>}
          <div className="modal-actions"><button type="button" className="secondary" onClick={() => setDialog(false)}>Cancelar</button><button disabled={saving}>{saving ? 'Guardando…' : 'Agregar miembro'}</button></div>
        </form>
      </div></div>}
    </main>
  );
}
