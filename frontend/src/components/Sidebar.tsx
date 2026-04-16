import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Package, Users, ClipboardList,
  ArrowLeftRight, LogOut, Activity, RotateCcw, ShoppingCart,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import ThemeToggle from './ThemeToggle';
import {
  usePendingTransfers, usePendingReturnRequests, usePendingItemRequests,
} from '../hooks/useApi';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager' || isAdmin;

  const { data: pendingTransfers } = usePendingTransfers(isManager);
  const { data: pendingReturns } = usePendingReturnRequests(isManager);
  const { data: pendingItems } = usePendingItemRequests(isManager);

  const pendingTransferCount = Array.isArray(pendingTransfers) ? pendingTransfers.length : 0;
  const pendingReturnCount = Array.isArray(pendingReturns) ? pendingReturns.length : 0;
  const pendingItemCount = Array.isArray(pendingItems) ? pendingItems.length : 0;

  const handleLogout = () => { logout(); navigate('/login'); };

  const roleColor = user?.role === 'admin'
    ? 'var(--purple)'
    : user?.role === 'manager'
    ? 'var(--yellow)'
    : 'var(--green)';

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Package size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
              StockFlow
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Warehouse Management</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '12px 8px', overflow: 'auto' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', padding: '4px 24px 8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Main
        </div>

        <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <LayoutDashboard size={16} /> Dashboard
        </NavLink>
        <NavLink to="/inventory" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Package size={16} /> Inventory
        </NavLink>
        <NavLink to="/assignments" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <ClipboardList size={16} /> Assignments
        </NavLink>

        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', padding: '16px 24px 4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Requests
        </div>

        <NavLink to="/item-requests" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <ShoppingCart size={16} /> Item Requests
          {pendingItemCount > 0 && <span className="badge-count">{pendingItemCount}</span>}
        </NavLink>
        <NavLink to="/transfers" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <ArrowLeftRight size={16} /> Transfers
          {pendingTransferCount > 0 && <span className="badge-count">{pendingTransferCount}</span>}
        </NavLink>
        <NavLink to="/returns" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <RotateCcw size={16} /> Returns
          {pendingReturnCount > 0 && <span className="badge-count">{pendingReturnCount}</span>}
        </NavLink>
        <NavLink to="/usage" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Activity size={16} /> Usage Log
        </NavLink>

        {isManager && (
          <>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', padding: '16px 24px 4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Management
            </div>
            <NavLink to="/users" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Users size={16} /> Users
            </NavLink>
          </>
        )}
      </nav>

      {/* Bottom — user info + theme toggle + logout */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px' }}>
        {/* Theme Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Appearance</span>
          <ThemeToggle />
        </div>

        {/* User info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: user?.role === 'admin' ? 'var(--purple-dim)' : user?.role === 'manager' ? 'var(--yellow-dim)' : 'var(--green-dim)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: roleColor,
          }}>
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.firstName} {user?.lastName}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: roleColor }}>
              {user?.role}
            </div>
          </div>
        </div>

        {/* Logout */}
        <button
          className="nav-item"
          onClick={handleLogout}
          style={{ width: '100%', color: 'var(--text-2)' }}
        >
          <LogOut size={15} /> Sign out
        </button>
      </div>
    </aside>
  );
}