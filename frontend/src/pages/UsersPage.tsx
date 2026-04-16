import { useState } from 'react';
import { Plus, Search, Users, Edit2, UserX } from 'lucide-react';
import { useUsers, useCreateUser, useUpdateUser } from '../hooks/useApi';
import { useAuth } from '../contexts/AuthContext';
import type { User } from '../types';
import Modal from '../components/Modal';

const ROLES = ['admin', 'manager', 'worker'];
const DEPARTMENTS = ['Warehouse', 'Logistics', 'Safety', 'Maintenance', 'Operations', 'Management'];

function roleBadge(role: string) {
  const map: any = { admin: 'badge-purple', manager: 'badge-yellow', worker: 'badge-green' };
  return <span className={`badge ${map[role] || 'badge-gray'}`}>{role}</span>;
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const { data: users = [], isLoading } = useUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  const isAdmin = currentUser?.role === 'admin';

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [form, setForm] = useState<any>({});

  const list = (users as User[]).filter(u => {
    const q = search.toLowerCase();
    return (
      (!q || `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(q)) &&
      (!roleFilter || u.role === roleFilter)
    );
  });

  const openCreate = () => {
    setForm({ role: 'worker', isActive: true });
    setShowCreate(true);
  };

  const openEdit = (u: User) => {
    setForm({ firstName: u.firstName, lastName: u.lastName, role: u.role, department: u.department, phone: u.phone, isActive: u.isActive });
    setEditTarget(u);
  };

  const handleCreate = async () => {
    await createUser.mutateAsync(form);
    setShowCreate(false);
    setForm({});
  };

  const handleUpdate = async () => {
    if (!editTarget) return;
    await updateUser.mutateAsync({ id: editTarget.id, data: form });
    setEditTarget(null);
  };

  const UserForm = ({ showPassword = false }: { showPassword?: boolean }) => (
    <>
      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">First Name *</label>
          <input className="form-input" value={form.firstName || ''} onChange={e => setForm({ ...form, firstName: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Last Name *</label>
          <input className="form-input" value={form.lastName || ''} onChange={e => setForm({ ...form, lastName: e.target.value })} />
        </div>
      </div>
      {showPassword && (
        <>
          <div className="form-group">
            <label className="form-label">Email *</label>
            <input type="email" className="form-input" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Password *</label>
            <input type="password" className="form-input" value={form.password || ''} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Min 6 characters" />
          </div>
        </>
      )}
      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">Role *</label>
          <select className="form-input" value={form.role || 'worker'} onChange={e => setForm({ ...form, role: e.target.value })}>
            {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Department</label>
          <select className="form-input" value={form.department || ''} onChange={e => setForm({ ...form, department: e.target.value })}>
            <option value="">Select department</option>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Phone</label>
        <input className="form-input" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+1 555 0000" />
      </div>
      {!showPassword && (
        <div className="form-group">
          <label className="form-label">Status</label>
          <select className="form-input" value={form.isActive ? 'true' : 'false'} onChange={e => setForm({ ...form, isActive: e.target.value === 'true' })}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      )}
    </>
  );

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>Users</h1>
          <p>{(users as User[]).filter(u => u.isActive).length} active members</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={15} /> Add User
          </button>
        )}
      </div>

      <div className="flex items-center gap-3" style={{ marginBottom: 20 }}>
        <div className="search-bar" style={{ flex: 1, maxWidth: 360 }}>
          <Search size={14} />
          <input placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-input" style={{ width: 140 }} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="">All Roles</option>
          {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="empty-state"><Users size={40} /><span>Loading…</span></div>
      ) : list.length === 0 ? (
        <div className="empty-state"><Users size={40} /><span>No users found</span></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th>Department</th>
                <th>Status</th>
                <th>Joined</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {list.map(u => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: u.role === 'admin' ? 'var(--purple-dim)' : u.role === 'manager' ? 'var(--yellow-dim)' : 'var(--green-dim)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700,
                        color: u.role === 'admin' ? 'var(--purple)' : u.role === 'manager' ? 'var(--yellow)' : 'var(--green)',
                        flexShrink: 0,
                      }}>
                        {u.firstName[0]}{u.lastName[0]}
                      </div>
                      <span style={{ fontWeight: 500 }}>{u.firstName} {u.lastName}</span>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-2)', fontSize: 12 }}>{u.email}</td>
                  <td>{roleBadge(u.role)}</td>
                  <td style={{ color: 'var(--text-2)', fontSize: 12 }}>{u.department || '—'}</td>
                  <td>
                    <span className={`badge ${u.isActive ? 'badge-green' : 'badge-gray'}`}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-3)', fontSize: 12 }}>
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  {isAdmin && (
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(u)}>
                          <Edit2 size={14} />
                        </button>
                        {u.id !== currentUser?.id && (
                          <button className="btn btn-danger btn-sm btn-icon" onClick={() => {
                            if (confirm(`Deactivate ${u.firstName}?`)) updateUser.mutate({ id: u.id, data: { isActive: false } });
                          }}>
                            <UserX size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Add New User"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate}
            disabled={createUser.isPending || !form.firstName || !form.lastName || !form.email || !form.password}>
            {createUser.isPending ? 'Creating…' : 'Create User'}
          </button>
        </>}>
        <UserForm showPassword />
      </Modal>

      <Modal isOpen={!!editTarget} onClose={() => setEditTarget(null)} title={`Edit — ${editTarget?.firstName} ${editTarget?.lastName}`}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setEditTarget(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleUpdate} disabled={updateUser.isPending}>
            {updateUser.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </>}>
        <UserForm />
      </Modal>
    </div>
  );
}
