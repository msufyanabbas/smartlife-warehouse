import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Package, Users, ClipboardList,
  ArrowLeftRight, LogOut, Activity, RotateCcw, ShoppingCart,
  Tag, FolderOpen,
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

  const roleBg = user?.role === 'admin'
    ? 'var(--purple-dim)'
    : user?.role === 'manager'
    ? 'var(--yellow-dim)'
    : 'var(--green-dim)';

  return (
    <aside className="sidebar">

      {/* ── Logo ── */}
      <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'rgba(255,255,255,0.03)',
          padding: '8px 10px',
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div style={{
            width: 56, height: 32,
            backgroundColor: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 10,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            overflow: 'hidden',
            flexShrink: 0,
          }}>
            <img
              src="/smartlife.png"
              alt="Smart Life Logo"
              style={{ width: '85%', height: '85%', objectFit: 'contain' }}
            />
          </div>
          <div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700, fontSize: 16,
              letterSpacing: '-0.02em',
              color: 'var(--text)',
            }}>
              StockFlow
            </div>
            <div style={{
              fontSize: 10, color: 'var(--text-3)',
              textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: -1,
            }}>
              Inventory System
            </div>
          </div>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', padding: '4px 16px 8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
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

        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', padding: '16px 16px 8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
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
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', padding: '16px 16px 8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Catalog
            </div>
            <NavLink to="/categories" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Tag size={16} /> Categories
            </NavLink>
            <NavLink to="/products" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <FolderOpen size={16} /> Products
            </NavLink>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', padding: '16px 16px 8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Management
            </div>
            <NavLink to="/users" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Users size={16} /> Users
            </NavLink>
          </>
        )}
      </nav>

      {/* ── Bottom ── */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px' }}>

        {/* Theme Toggle Row */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 12,
          padding: '6px 0',
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Appearance</span>
          <ThemeToggle />
        </div>

        {/* User Info */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 10px', borderRadius: 10,
          background: 'var(--bg-3)', border: '1px solid var(--border)',
          marginBottom: 8,
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
            background: roleBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: roleColor,
          }}>
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 600, color: 'var(--text)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {user?.firstName} {user?.lastName}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: roleColor,
              }}>
                {user?.role}
              </span>
              {user?.department && (
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>· {user.department}</span>
              )}
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