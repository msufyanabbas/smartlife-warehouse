import { useState } from 'react';
import { Plus, Search, Users, Edit2, UserX, Trash2, KeyRound, Eye, EyeOff } from 'lucide-react';
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser, useDeactivateUser, useResetPassword } from '../hooks/useApi';
import { useAuth } from '../contexts/AuthContext';
import { User } from '../types';
import Modal from '../components/Modal';

const ROLES = ['admin', 'manager', 'worker'];
const DEPARTMENTS = ['Warehouse', 'Logistics', 'Safety', 'Maintenance', 'Operations', 'Management'];

function roleBadge(role: string) {
  const map: any = { admin: 'badge-purple', manager: 'badge-yellow', worker: 'badge-green' };
  return <span className={`badge ${map[role] || 'badge-gray'}`}>{role}</span>;
}

// ── Form fields defined OUTSIDE component to prevent remount on keystroke ──
function UserForm({
  form, setForm, showPassword,
}: {
  form: any;
  setForm: (f: any) => void;
  showPassword?: boolean;
}) {
  return (
    <>
      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">First Name *</label>
          <input
            className="form-input"
            value={form.firstName || ''}
            onChange={e => setForm({ ...form, firstName: e.target.value })}
            placeholder="First name"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Last Name *</label>
          <input
            className="form-input"
            value={form.lastName || ''}
            onChange={e => setForm({ ...form, lastName: e.target.value })}
            placeholder="Last name"
          />
        </div>
      </div>

      {showPassword && (
        <>
          <div className="form-group">
            <label className="form-label">Email *</label>
            <input
              type="email"
              className="form-input"
              value={form.email || ''}
              onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="user@company.com"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password *</label>
            <input
              type="password"
              className="form-input"
              value={form.password || ''}
              onChange={e => setForm({ ...form, password: e.target.value })}
              placeholder="Min 6 characters"
            />
          </div>
        </>
      )}

      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">Role *</label>
          <select
            className="form-input"
            value={form.role || 'worker'}
            onChange={e => setForm({ ...form, role: e.target.value })}
          >
            {ROLES.map(r => (
              <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Department</label>
          <select
            className="form-input"
            value={form.department || ''}
            onChange={e => setForm({ ...form, department: e.target.value })}
          >
            <option value="">Select department</option>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Phone</label>
        <input
          className="form-input"
          value={form.phone || ''}
          onChange={e => setForm({ ...form, phone: e.target.value })}
          placeholder="+966 50 000 0000"
        />
      </div>

      {!showPassword && (
        <div className="form-group">
          <label className="form-label">Status</label>
          <select
            className="form-input"
            value={form.isActive ? 'true' : 'false'}
            onChange={e => setForm({ ...form, isActive: e.target.value === 'true' })}
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      )}
    </>
  );
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const { data: users = [], isLoading } = useUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const deactivateUser = useDeactivateUser();
  const resetPassword = useResetPassword();

  const isAdmin = currentUser?.role === 'admin';
  const isManager = currentUser?.role === 'manager';

  // Mirrors the rule the server enforces: a manager may only reset a worker, an
  // admin anyone but a fellow admin — their own account excepted.
  const canResetPassword = (u: User) => {
    if (isAdmin) return u.role !== 'admin' || u.id === currentUser?.id;
    if (isManager) return u.role === 'worker';
    return false;
  };

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [createForm, setCreateForm] = useState<any>({ role: 'worker' });
  const [editForm, setEditForm] = useState<any>({});
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const list = (users as User[]).filter(u => {
    const q = search.toLowerCase();
    return (
      (!q || `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(q)) &&
      (!roleFilter || u.role === roleFilter)
    );
  });

  const openCreate = () => {
    setCreateForm({ role: 'worker' });
    setShowCreate(true);
  };

  const openEdit = (u: User) => {
    setEditForm({
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      department: u.department || '',
      phone: u.phone || '',
      isActive: u.isActive,
    });
    setEditTarget(u);
  };

  const handleCreate = async () => {
    if (!createForm.firstName || !createForm.lastName || !createForm.email || !createForm.password) {
      alert('Please fill in all required fields (First Name, Last Name, Email, Password)');
      return;
    }
    await createUser.mutateAsync({
      firstName: createForm.firstName,
      lastName: createForm.lastName,
      email: createForm.email,
      password: createForm.password,
      role: createForm.role || 'worker',
      department: createForm.department || undefined,
      phone: createForm.phone || undefined,
    });
    setShowCreate(false);
    setCreateForm({ role: 'worker' });
  };

  const handleUpdate = async () => {
    if (!editTarget) return;
    // Both columns are NOT NULL, so a blank name is caught here as well as by
    // the server — the same check the create dialog already makes.
    if (!editForm.firstName?.trim() || !editForm.lastName?.trim()) {
      alert('Please fill in all required fields (First Name, Last Name)');
      return;
    }
    await updateUser.mutateAsync({
      id: editTarget.id,
      data: {
        firstName: editForm.firstName,
        lastName: editForm.lastName,
        role: editForm.role,
        // Sent as '' rather than dropped when emptied. An omitted key never
        // reaches the server's update, so clearing either of these was
        // impossible; both columns are nullable and '' clears them.
        department: editForm.department ?? '',
        phone: editForm.phone ?? '',
        isActive: editForm.isActive,
      },
    });
    setEditTarget(null);
  };

  const closeReset = () => {
    setResetTarget(null);
    setNewPassword('');
    setConfirmPassword('');
    setShowNewPassword(false);
    setPasswordError('');
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    setPasswordError('');
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    try {
      await resetPassword.mutateAsync({ id: resetTarget.id, newPassword });
      closeReset();
    } catch {
      // The hook already surfaces the server's message as a toast.
    }
  };

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>Users</h1>
          <p>{(users as User[]).filter(u => u.isActive).length} team members</p>
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
          <input
            placeholder="Search by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="form-input"
          style={{ width: 140 }}
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
        >
          <option value="">All Roles</option>
          {ROLES.map(r => (
            <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
          ))}
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
                {(isAdmin || isManager) && <th>Actions</th>}
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
                        fontSize: 12, fontWeight: 700, flexShrink: 0,
                        color: u.role === 'admin' ? 'var(--purple)' : u.role === 'manager' ? 'var(--yellow)' : 'var(--green)',
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
                  {(isAdmin || isManager) && (
                    <td>
                      <div className="flex gap-2">
                        {isAdmin && (
                          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(u)}>
                            <Edit2 size={14} />
                          </button>
                        )}
                        {canResetPassword(u) && (
                          <button
                            className="btn btn-ghost btn-sm btn-icon"
                            title="Reset password"
                            onClick={() => { setResetTarget(u); setPasswordError(''); }}
                          >
                            <KeyRound size={14} />
                          </button>
                        )}
                        {isAdmin && u.id !== currentUser?.id && (
                          <button
                            className="btn btn-danger btn-sm btn-icon"
                            title="Deactivate"
                            onClick={() => {
                              if (confirm(`Deactivate ${u.firstName}?`))
                                deactivateUser.mutate(u.id);
                            }}
                          >
                            <UserX size={14} />
                          </button>
                        )}
                        {isAdmin && u.id !== currentUser?.id && (
                          <button
                            className="btn btn-danger btn-sm btn-icon"
                            title="Delete permanently"
                            onClick={() => {
                              if (confirm(`Permanently delete ${u.firstName} ${u.lastName}? This cannot be undone and will remove all their data.`))
                                deleteUser.mutate(u.id);
                            }}
                          >
                            <Trash2 size={14} />
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

      {/* Create Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add New User"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={handleCreate}
              disabled={createUser.isPending}
            >
              {createUser.isPending ? 'Creating…' : 'Create User'}
            </button>
          </>
        }
      >
        <UserForm form={createForm} setForm={setCreateForm} showPassword />
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={`Edit — ${editTarget?.firstName} ${editTarget?.lastName}`}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setEditTarget(null)}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={handleUpdate}
              disabled={updateUser.isPending}
            >
              {updateUser.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </>
        }
      >
        <UserForm form={editForm} setForm={setEditForm} />
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        isOpen={!!resetTarget}
        onClose={closeReset}
        title="Reset Password"
        size="sm"
        footer={
          <>
            <button className="btn btn-ghost" onClick={closeReset}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={handleResetPassword}
              disabled={resetPassword.isPending || !newPassword || !confirmPassword}
            >
              {resetPassword.isPending ? 'Resetting…' : 'Reset Password'}
            </button>
          </>
        }
      >
        <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 16 }}>
          Set a new password for{' '}
          <strong style={{ color: 'var(--text)' }}>
            {resetTarget?.firstName} {resetTarget?.lastName}
          </strong>. They will need it the next time they sign in.
        </p>

        <div className="form-group">
          <label className="form-label">New Password *</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showNewPassword ? 'text' : 'password'}
              className="form-input"
              style={{ paddingRight: 36 }}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Min 6 characters"
              autoFocus
            />
            <button
              type="button"
              title={showNewPassword ? 'Hide password' : 'Show password'}
              style={{
                position: 'absolute', right: 10, top: '50%',
                transform: 'translateY(-50%)',
                background: 'none', border: 'none', padding: 0,
                cursor: 'pointer', color: 'var(--text-3)', display: 'flex',
              }}
              onClick={() => setShowNewPassword(!showNewPassword)}
            >
              {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Confirm Password *</label>
          <input
            type={showNewPassword ? 'text' : 'password'}
            className="form-input"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Repeat password"
            onKeyDown={e => { if (e.key === 'Enter') handleResetPassword(); }}
          />
        </div>

        {newPassword && (
          <div style={{ marginTop: -4 }}>
            <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                transition: 'all 0.2s',
                width: newPassword.length >= 12 ? '100%'
                  : newPassword.length >= 8 ? '66%'
                  : newPassword.length >= 6 ? '33%' : '10%',
                background: newPassword.length >= 12 ? 'var(--green)'
                  : newPassword.length >= 8 ? 'var(--yellow)'
                  : newPassword.length >= 6 ? '#f97316' : 'var(--red)',
              }} />
            </div>
            <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-3)' }}>
              {newPassword.length >= 12 ? 'Strong'
                : newPassword.length >= 8 ? 'Good'
                : newPassword.length >= 6 ? 'Weak' : 'Too short'}
            </div>
          </div>
        )}

        {passwordError && (
          <div style={{
            color: 'var(--red)', fontSize: 13, marginTop: 12,
            padding: '8px 12px', background: 'var(--red-dim)', borderRadius: 6,
          }}>
            {passwordError}
          </div>
        )}
      </Modal>
    </div>
  );
}