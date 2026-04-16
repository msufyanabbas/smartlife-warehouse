import { useState } from 'react';
import { RotateCcw, Check, X, Ban, AlertCircle, Search } from 'lucide-react';
import {
  useReturnRequests, useReviewReturnRequest, useCancelReturnRequest,
  usePendingReturnRequests,
} from '../hooks/useApi';
import { useAuth } from '../contexts/AuthContext';
import type { ReturnRequest } from '../types';
import Modal from '../components/Modal';
import { formatDistanceToNow } from 'date-fns';

function statusBadge(s: string) {
  const map: any = {
    pending: 'badge-yellow', approved: 'badge-green',
    rejected: 'badge-red', cancelled: 'badge-gray',
  };
  return <span className={`badge ${map[s] || 'badge-gray'}`}>{s}</span>;
}

export default function ReturnRequestsPage() {
  const { user } = useAuth();
  const { data: requests = [], isLoading } = useReturnRequests();
  const { data: pending = [] } = usePendingReturnRequests();
  const reviewReturn = useReviewReturnRequest();
  const cancelReturn = useCancelReturnRequest();

  const isManager = user?.role === 'admin' || user?.role === 'manager';

  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [rejectTarget, setRejectTarget] = useState<ReturnRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const allRequests = requests as ReturnRequest[];
  const pendingCount = (pending as ReturnRequest[]).length;

  const list = allRequests.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      r.item?.name.toLowerCase().includes(q) ||
      r.requestedBy?.firstName.toLowerCase().includes(q) ||
      r.requestedBy?.lastName.toLowerCase().includes(q);
    const matchStatus = !statusFilter || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleApprove = async (id: string) => {
    await reviewReturn.mutateAsync({ id, action: 'approve' });
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    await reviewReturn.mutateAsync({
      id: rejectTarget.id, action: 'reject', rejectionReason: rejectReason,
    });
    setRejectTarget(null);
    setRejectReason('');
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Return Requests</h1>
        <p>Workers submit returns — managers approve before stock is restored</p>
      </div>

      {/* Pending alert */}
      {isManager && pendingCount > 0 && (
        <div style={{
          background: 'var(--yellow-dim)', border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <AlertCircle size={16} color="var(--yellow)" />
          <span style={{ fontSize: 13, color: 'var(--yellow)', fontWeight: 500 }}>
            {pendingCount} return request{pendingCount > 1 ? 's' : ''} awaiting your approval
          </span>
        </div>
      )}

      {/* Filters */}
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
          <div className="search-bar" style={{ gridColumn: '1 / -1' }}>
            <Search size={14} />
            <input placeholder="Search item or worker…" value={search}
              onChange={e => setSearch(e.target.value)} style={{ width: '100%' }} />
          </div>
          <select className="form-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2" style={{ marginBottom: 16 }}>
        {(['', 'pending', 'approved', 'rejected', 'cancelled'] as const).map(s => {
          const count = s === '' ? allRequests.length : allRequests.filter(r => r.status === s).length;
          return (
            <button key={s}
              className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setStatusFilter(s === statusFilter ? '' : s)}>
              {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              <span style={{
                marginLeft: 5, fontSize: 10, fontWeight: 700,
                background: statusFilter === s ? 'rgba(255,255,255,0.2)' : 'var(--bg-4)',
                padding: '1px 6px', borderRadius: 99,
              }}>{count}</span>
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="empty-state"><RotateCcw size={40} /><span>Loading…</span></div>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <RotateCcw size={40} />
          <span>No return requests found</span>
          <span style={{ fontSize: 12 }}>Workers can submit return requests from the Assignments page</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map(r => (
            <div key={r.id} className="card" style={{ padding: '16px 20px' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div style={{
                    width: 36, height: 36, borderRadius: 'var(--radius)',
                    background: 'var(--bg-4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <RotateCcw size={16} color="var(--text-2)" />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      <span style={{ color: 'var(--accent)' }}>
                        {r.requestedBy?.firstName} {r.requestedBy?.lastName}
                      </span>
                      <span style={{ color: 'var(--text-3)', margin: '0 8px' }}>wants to return</span>
                      <span style={{ color: 'var(--text)' }}>{r.quantity}× {r.item?.name}</span>
                    </div>
                    {r.notes && (
                      <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                        "{r.notes}"
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {statusBadge(r.status)}
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                  </span>
                </div>
              </div>

              {/* Review result */}
              {(r.status === 'approved' || r.status === 'rejected') && r.reviewedBy && (
                <div style={{
                  marginTop: 10, padding: '8px 12px',
                  background: r.status === 'approved' ? 'var(--green-dim)' : 'var(--red-dim)',
                  borderRadius: 'var(--radius)', fontSize: 12,
                  color: r.status === 'approved' ? 'var(--green)' : 'var(--red)',
                }}>
                  {r.status === 'approved' ? '✓ Approved' : '✗ Rejected'} by{' '}
                  {r.reviewedBy.firstName} {r.reviewedBy.lastName}
                  {r.rejectionReason && (
                    <span style={{ marginLeft: 6, opacity: 0.8 }}>— "{r.rejectionReason}"</span>
                  )}
                </div>
              )}

              {/* Actions */}
              {r.status === 'pending' && (
                <div className="flex gap-2" style={{ marginTop: 12 }}>
                  {isManager && (
                    <>
                      <button className="btn btn-success btn-sm"
                        onClick={() => handleApprove(r.id)}
                        disabled={reviewReturn.isPending}>
                        <Check size={13} /> Approve Return
                      </button>
                      <button className="btn btn-danger btn-sm"
                        onClick={() => { setRejectTarget(r); setRejectReason(''); }}>
                        <X size={13} /> Reject
                      </button>
                    </>
                  )}
                  {r.requestedById === user?.id && (
                    <button className="btn btn-ghost btn-sm"
                      onClick={() => { if (confirm('Cancel this return request?')) cancelReturn.mutate(r.id); }}>
                      <Ban size={13} /> Cancel
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Reject Modal */}
      <Modal isOpen={!!rejectTarget} onClose={() => setRejectTarget(null)}
        title="Reject Return Request" maxWidth={420}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setRejectTarget(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={handleReject} disabled={reviewReturn.isPending}>
            {reviewReturn.isPending ? 'Rejecting…' : 'Reject Request'}
          </button>
        </>}>
        {rejectTarget && (
          <>
            <div style={{ background: 'var(--bg-3)', borderRadius: 'var(--radius)', padding: '12px 16px', fontSize: 13 }}>
              Rejecting return of{' '}
              <strong>{rejectTarget.quantity}× {rejectTarget.item?.name}</strong> from{' '}
              {rejectTarget.requestedBy?.firstName} {rejectTarget.requestedBy?.lastName}
            </div>
            <div className="form-group">
              <label className="form-label">Reason (optional)</label>
              <textarea className="form-input" rows={3} value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Why is this return being rejected?" />
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}