import { useState } from 'react';
import { ShoppingCart, Check, X, Ban, AlertCircle, Search } from 'lucide-react';
import {
  useItemRequests, useReviewItemRequest, useCancelItemRequest,
  usePendingItemRequests,
} from '../hooks/useApi';
import { useAuth } from '../contexts/AuthContext';
import type { ItemRequest } from '../types';
import Modal from '../components/Modal';
import { formatDistanceToNow } from 'date-fns';

function statusBadge(s: string) {
  const map: any = {
    pending: 'badge-yellow', approved: 'badge-green',
    rejected: 'badge-red', cancelled: 'badge-gray',
  };
  return <span className={`badge ${map[s] || 'badge-gray'}`}>{s}</span>;
}

export default function ItemRequestsPage() {
  const { user } = useAuth();
  const { data: requests = [], isLoading } = useItemRequests();
  const { data: pending = [] } = usePendingItemRequests();
  const reviewRequest = useReviewItemRequest();
  const cancelRequest = useCancelItemRequest();

  const isManager = user?.role === 'admin' || user?.role === 'manager';
  const pendingCount = (pending as ItemRequest[]).length;

  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [rejectTarget, setRejectTarget] = useState<ItemRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const allRequests = requests as ItemRequest[];

  const list = allRequests.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      r.item?.name.toLowerCase().includes(q) ||
      r.requestedBy?.firstName.toLowerCase().includes(q) ||
      r.requestedBy?.lastName.toLowerCase().includes(q) ||
      r.reason?.toLowerCase().includes(q);
    const matchStatus = !statusFilter || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleApprove = (id: string) => {
    reviewRequest.mutate({ id, action: 'approve' });
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    await reviewRequest.mutateAsync({
      id: rejectTarget.id, action: 'reject', rejectionReason: rejectReason,
    });
    setRejectTarget(null);
    setRejectReason('');
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Item Requests</h1>
        <p>Workers request items from inventory — managers approve and items are auto-assigned</p>
      </div>

      {/* Pending alert for managers */}
      {isManager && pendingCount > 0 && (
        <div style={{
          background: 'var(--yellow-dim)', border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <AlertCircle size={16} color="var(--yellow)" />
          <span style={{ fontSize: 13, color: 'var(--yellow)', fontWeight: 500 }}>
            {pendingCount} item request{pendingCount > 1 ? 's' : ''} awaiting your approval
          </span>
        </div>
      )}

      {/* Filters */}
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
          <div className="search-bar" style={{ gridColumn: '1 / -1' }}>
            <Search size={14} />
            <input placeholder="Search item, worker, reason…" value={search}
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
        <div className="empty-state"><ShoppingCart size={40} /><span>Loading…</span></div>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <ShoppingCart size={40} />
          <span>No item requests found</span>
          <span style={{ fontSize: 12 }}>Workers can request items from the Inventory page</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map(r => (
            <div key={r.id} className="card" style={{ padding: '16px 20px' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div style={{
                    width: 36, height: 36, borderRadius: 'var(--radius)',
                    background: 'var(--accent-dim)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <ShoppingCart size={16} color="var(--accent)" />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      <span style={{ color: 'var(--accent)' }}>
                        {r.requestedBy?.firstName} {r.requestedBy?.lastName}
                      </span>
                      <span style={{ color: 'var(--text-3)', margin: '0 8px' }}>requested</span>
                      <span style={{ color: 'var(--text)' }}>
                        {r.quantity}× {r.item?.name}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2, display: 'flex', gap: 12 }}>
                      <span>SKU: {r.item?.sku}</span>
                      {r.item?.schemeNo && <span>Scheme: {r.item.schemeNo}</span>}
                      {r.item?.projectName && <span>Project: {r.item.projectName}</span>}
                    </div>
                    {r.reason && (
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
                        Reason: "{r.reason}"
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
                  {r.status === 'approved'
                    ? `✓ Approved by ${r.reviewedBy.firstName} ${r.reviewedBy.lastName} — items assigned automatically`
                    : `✗ Rejected by ${r.reviewedBy.firstName} ${r.reviewedBy.lastName}`}
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
                        disabled={reviewRequest.isPending}>
                        <Check size={13} /> Approve & Assign
                      </button>
                      <button className="btn btn-danger btn-sm"
                        onClick={() => { setRejectTarget(r); setRejectReason(''); }}>
                        <X size={13} /> Reject
                      </button>
                    </>
                  )}
                  {r.requestedById === user?.id && (
                    <button className="btn btn-ghost btn-sm"
                      onClick={() => { if (confirm('Cancel this request?')) cancelRequest.mutate(r.id); }}>
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
        title="Reject Item Request" maxWidth={420}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setRejectTarget(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={handleReject} disabled={reviewRequest.isPending}>
            {reviewRequest.isPending ? 'Rejecting…' : 'Reject Request'}
          </button>
        </>}>
        {rejectTarget && (
          <>
            <div style={{ background: 'var(--bg-3)', borderRadius: 'var(--radius)', padding: '12px 16px', fontSize: 13 }}>
              Rejecting request for{' '}
              <strong>{rejectTarget.quantity}× {rejectTarget.item?.name}</strong> by{' '}
              {rejectTarget.requestedBy?.firstName} {rejectTarget.requestedBy?.lastName}
            </div>
            <div className="form-group">
              <label className="form-label">Reason (optional)</label>
              <textarea className="form-input" rows={3} value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Why is this request being rejected?" />
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}