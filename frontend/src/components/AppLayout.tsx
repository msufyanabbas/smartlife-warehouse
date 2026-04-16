import { Navigate, Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../contexts/AuthContext';

export default function AppLayout() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', color: 'var(--text-2)', gap: 12, flexDirection: 'column',
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: 'var(--accent)',
          animation: 'pulse 1.2s ease infinite',
        }} />
        <span style={{ fontSize: 13 }}>Loading…</span>
        <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.92)} }`}</style>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Outlet />
      </div>
    </div>
  );
}

export function RequireRole({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}