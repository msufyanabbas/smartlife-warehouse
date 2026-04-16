import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Package, Users, ClipboardList,
  ArrowLeftRight, LogOut, Activity, RotateCcw, ShoppingCart,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  usePendingTransfers, usePendingReturnRequests, usePendingItemRequests,
} from '../hooks/useApi';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager' || isAdmin;

  // Always call hooks (React rules) but pass enabled:false for workers
  // so no network requests are made
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
      <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ 
  display: 'flex', 
  alignItems: 'center', 
  gap: 12, 
  background: 'rgba(255, 255, 255, 0.03)', // Very subtle highlight
  padding: '8px',
  borderRadius: '12px',
  border: '1px solid rgba(255, 255, 255, 0.05)'
}}>
  <div style={{
    width: 56,
    height: 32,
    backgroundColor: '#fff', // Keeps the logo clear
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '10px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
    overflow: 'hidden'
  }}>
    <img
      src="/smartlife.png"
      alt="Logo"
      style={{ width: '85%', height: '85%', objectFit: 'contain' }}
    />
  </div>
  <div>
    <div style={{ 
      fontFamily: 'var(--font-display)', 
      fontWeight: 700, 
      fontSize: 16, 
      letterSpacing: '-0.02em',
      color: '#fff' 
    }}>
      StockFlow
    </div>
    <div style={{ 
      fontSize: 10, 
      color: 'var(--text-3)', 
      textTransform: 'uppercase', 
      letterSpacing: '0.1em',
      marginTop: -2
    }}>
      Inventory System
    </div>
  </div>
</div>
      </div>

      <nav style={{ flex: 1, padding: '12px 0' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', padding: '8px 24px 4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
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

        <NavLink to="/item-requests" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <ShoppingCart size={16} />
          Item Requests
          {isManager && pendingItemCount > 0 && (
            <span className="badge-count">{pendingItemCount}</span>
          )}
        </NavLink>

        <NavLink to="/transfers" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <ArrowLeftRight size={16} />
          Transfers
          {isManager && pendingTransferCount > 0 && (
            <span className="badge-count">{pendingTransferCount}</span>
          )}
        </NavLink>

        <NavLink to="/returns" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <RotateCcw size={16} />
          Returns
          {isManager && pendingReturnCount > 0 && (
            <span className="badge-count">{pendingReturnCount}</span>
          )}
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

      <div style={{ borderTop: '1px solid var(--border)', padding: '12px 8px' }}>
        <div style={{ padding: '8px 16px', marginBottom: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            {user?.firstName} {user?.lastName}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: roleColor }}>
              {user?.role}
            </span>
            {user?.department && (
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>· {user.department}</span>
            )}
          </div>
        </div>
        <button className="nav-item" onClick={handleLogout} style={{ width: 'calc(100% - 16px)' }}>
          <LogOut size={15} /> Sign out
        </button>
      </div>
    </aside>
  );
}