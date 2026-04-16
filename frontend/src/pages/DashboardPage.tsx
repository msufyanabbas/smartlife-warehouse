import { Package, Users, ClipboardList, ArrowLeftRight, AlertCircle, TrendingUp } from 'lucide-react';
import { useInventoryStats, useAssignments, usePendingTransfers, useInventory, useUsers } from '../hooks/useApi';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import type { TransferRequest, Assignment } from '../types';
import { formatDistanceToNow } from 'date-fns';

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: stats } = useInventoryStats();
  const { data: assignments } = useAssignments();
  const { data: pending } = usePendingTransfers();
  const { data: inventory } = useInventory();
  const { data: users } = useUsers();

  const isManager = user?.role === 'admin' || user?.role === 'manager';
  const pendingCount = Array.isArray(pending) ? pending.length : 0;
  const assignmentList: Assignment[] = Array.isArray(assignments) ? assignments : [];
  const inventoryList = Array.isArray(inventory) ? inventory : [];
  const userList = Array.isArray(users) ? users : [];

  const lowStockItems = inventoryList.filter(i => i.availableQuantity === 0 && i.assignedQuantity > 0);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 26 }}>{greeting()}, {user?.firstName} 👋</h1>
        <p>Here's what's happening in your warehouse today.</p>
      </div>

      {/* Stats */}
      {isManager && stats && (
        <div className="grid-4" style={{ marginBottom: 24 }}>
          <div className="stat-card">
            <div className="icon-wrap" style={{ background: 'var(--accent-dim)' }}>
              <Package size={20} color="var(--accent)" />
            </div>
            <div>
              <div className="value">{stats.totalItems}</div>
              <div className="label">Total Items</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="icon-wrap" style={{ background: 'var(--green-dim)' }}>
              <TrendingUp size={20} color="var(--green)" />
            </div>
            <div>
              <div className="value" style={{ color: 'var(--green)' }}>{stats.totalAvailable}</div>
              <div className="label">Available</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="icon-wrap" style={{ background: 'var(--yellow-dim)' }}>
              <ClipboardList size={20} color="var(--yellow)" />
            </div>
            <div>
              <div className="value" style={{ color: 'var(--yellow)' }}>{stats.totalAssigned}</div>
              <div className="label">Assigned</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="icon-wrap" style={{ background: pendingCount > 0 ? 'var(--red-dim)' : 'var(--purple-dim)' }}>
              <ArrowLeftRight size={20} color={pendingCount > 0 ? 'var(--red)' : 'var(--purple)'} />
            </div>
            <div>
              <div className="value" style={{ color: pendingCount > 0 ? 'var(--red)' : 'var(--text)' }}>{pendingCount}</div>
              <div className="label">Pending Transfers</div>
            </div>
          </div>
        </div>
      )}

      <div className="grid-2" style={{ gap: 20 }}>
        {/* Pending transfer requests */}
        {isManager && pendingCount > 0 && (
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
              <div className="flex items-center gap-2">
                <AlertCircle size={16} color="var(--yellow)" />
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                  Pending Transfer Requests
                </span>
                <span className="badge badge-yellow">{pendingCount}</span>
              </div>
              <Link to="/transfers" className="btn btn-ghost btn-sm">View all</Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(pending as TransferRequest[]).slice(0, 3).map(tr => (
                <div key={tr.id} style={{
                  background: 'var(--bg-3)', borderRadius: 'var(--radius)',
                  padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      <span style={{ color: 'var(--accent)' }}>{tr.fromUser?.firstName} {tr.fromUser?.lastName}</span>
                      <span style={{ color: 'var(--text-3)', margin: '0 6px' }}>→</span>
                      <span style={{ color: 'var(--text)' }}>{tr.toUser?.firstName} {tr.toUser?.lastName}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 3 }}>
                      {tr.quantity}× {tr.item?.name}
                      <span style={{ marginLeft: 8, color: 'var(--text-3)' }}>
                        {formatDistanceToNow(new Date(tr.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <Link to="/transfers" className="btn btn-ghost btn-sm">Review</Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent assignments */}
        <div className="card">
          <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>Recent Assignments</span>
            <Link to="/assignments" className="btn btn-ghost btn-sm">View all</Link>
          </div>
          {assignmentList.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 0' }}>
              <ClipboardList size={32} />
              <span style={{ fontSize: 13 }}>No active assignments</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {assignmentList.slice(0, 5).map(a => (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 0', borderBottom: '1px solid var(--border)',
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{a.item?.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                      {a.assignedTo?.firstName} {a.assignedTo?.lastName}
                    </div>
                  </div>
                  <span className="badge badge-blue">{a.quantity}×</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Low stock or user stats */}
        {isManager ? (
          <div className="card">
            <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>Stock Overview</span>
              <Link to="/inventory" className="btn btn-ghost btn-sm">Manage</Link>
            </div>
            {inventoryList.length === 0 ? (
              <div className="empty-state" style={{ padding: '32px 0' }}>
                <Package size={32} />
                <span style={{ fontSize: 13 }}>No inventory yet</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {inventoryList.slice(0, 5).map(item => {
                  const pct = item.totalQuantity > 0 ? (item.availableQuantity / item.totalQuantity) * 100 : 0;
                  const color = pct === 0 ? 'var(--red)' : pct < 30 ? 'var(--yellow)' : 'var(--green)';
                  return (
                    <div key={item.id}>
                      <div className="flex items-center justify-between" style={{ marginBottom: 5 }}>
                        <span style={{ fontSize: 13 }}>{item.name}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                          {item.availableQuantity}/{item.totalQuantity}
                        </span>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="card">
            <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>My Assigned Items</span>
            </div>
            {assignmentList.filter(a => a.assignedToId === user?.id).length === 0 ? (
              <div className="empty-state" style={{ padding: '32px 0' }}>
                <Package size={32} />
                <span style={{ fontSize: 13 }}>No items assigned to you</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {assignmentList.filter(a => a.assignedToId === user?.id).map(a => (
                  <div key={a.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', background: 'var(--bg-3)', borderRadius: 'var(--radius)',
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{a.item?.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{a.item?.sku}</div>
                    </div>
                    <span className="badge badge-blue">{a.quantity}×</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
