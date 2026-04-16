import { useState } from 'react';
import * as XLSX from 'xlsx';
import { ArrowLeftRight, Plus, Check, X, Ban, AlertCircle, Search, Download } from 'lucide-react';
import {
  useTransferRequests, useCreateTransfer, useReviewTransfer,
  useCancelTransfer, useMyInventory, useWorkers,
} from '../hooks/useApi';
import { useAuth } from '../contexts/AuthContext';
import type { TransferRequest } from '../types';
import Modal from '../components/Modal';
import { formatDistanceToNow, format } from 'date-fns';

function statusBadge(s: string) {
  const map: any = {
    pending: 'badge-yellow', approved: 'badge-green',
    rejected: 'badge-red', cancelled: 'badge-gray',
  };
  return <span className={`badge ${map[s] || 'badge-gray'}`}>{s}</span>;
}

export default function TransfersPage() {
  const { user } = useAuth();
  const { data: transfers = [], isLoading } = useTransferRequests();
  const { data: myInventory = [] } = useMyInventory(); // returns ALL assignments for managers
  const { data: workers = [] } = useWorkers();
  const createTransfer = useCreateTransfer();
  const reviewTransfer = useReviewTransfer();
  const cancelTransfer = useCancelTransfer();

  const isManager = user?.role === 'admin' || user?.role === 'manager';

  const [statusFilter, setStatusFilter] = useState('');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<TransferRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [form, setForm] = useState({
    toUserId: '', sourceAssignmentId: '', itemId: '', quantity: 1, reason: '',
  });

  const allTransfers = transfers as TransferRequest[];
  const allAssignments = myInventory as any[];

  // For managers: group assignments by worker for the dropdown
  const uniqueFromUsers = [...new Map(allTransfers.map(t => [t.fromUserId, t.fromUser])).values()].filter(Boolean);
  const uniqueToUsers = [...new Map(allTransfers.map(t => [t.toUserId, t.toUser])).values()].filter(Boolean);
  const uniqueItems = [...new Map(allTransfers.map(t => [t.itemId, t.item])).values()].filter(Boolean);

  const list = allTransfers.filter(t => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      t.item?.name.toLowerCase().includes(q) ||
      t.fromUser?.firstName.toLowerCase().includes(q) ||
      t.fromUser?.lastName.toLowerCase().includes(q) ||
      t.toUser?.firstName.toLowerCase().includes(q) ||
      t.reason?.toLowerCase().includes(q);
    return matchSearch &&
      (!statusFilter || t.status === statusFilter) &&
      (!fromFilter || t.fromUserId === fromFilter) &&
      (!toFilter || t.toUserId === toFilter) &&
      (!itemFilter || t.itemId === itemFilter);
  });

  const pendingList = allTransfers.filter(t => t.status === 'pending');
  const activeFilters = [statusFilter, fromFilter, toFilter, itemFilter].filter(Boolean).length;

  const selectedAssignment = allAssignments.find(a => a.id === form.sourceAssignmentId);

  // Workers picking from their own; managers see all assignments
  const assignmentOptions = isManager
    ? allAssignments
    : allAssignments.filter(a => a.assignedToId === user?.id);

  // Exclude the assignment owner from the "to" dropdown
  const toWorkerOptions = (workers as any[]).filter(w => {
    if (!selectedAssignment) return w.id !== user?.id;
    return w.id !== selectedAssignment.assignedToId;
  });

  const handleCreate = async () => {
    await createTransfer.mutateAsync(form);
    setShowCreate(false);
    setForm({ toUserId: '', sourceAssignmentId: '', itemId: '', quantity: 1, reason: '' });
  };

  const handleApprove = (id: string) => {
    reviewTransfer.mutate({ id, action: 'approve' });
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    await reviewTransfer.mutateAsync({ id: rejectTarget.id, action: 'reject', rejectionReason: rejectReason });
    setRejectTarget(null);
    setRejectReason('');
  };

  const exportToExcel = () => {
    const rows = list.map(t => ({
      'From Worker': `${t.fromUser?.firstName} ${t.fromUser?.lastName}`,
      'To Worker': `${t.toUser?.firstName} ${t.toUser?.lastName}`,
      'Item': t.item?.name,
      'SKU': t.item?.sku,
      'Quantity': t.quantity,
      'Status': t.status,
      'Reason': t.reason || '',
      'Rejection Reason': t.rejectionReason || '',
      'Reviewed By': t.reviewedBy ? `${t.reviewedBy.firstName} ${t.reviewedBy.lastName}` : '',
      'Created': format(new Date(t.createdAt), 'dd/MM/yyyy HH:mm'),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0] || {}).map(() => ({ wch: 20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transfers');
    XLSX.writeFile(wb, `transfers-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>Transfer Requests</h1>
          <p>Worker-to-worker item transfers with approval flow</p>
        </div>
        <div className="flex gap-2">
          {list.length > 0 && (
            <button className="btn btn-ghost" onClick={exportToExcel}>
              <Download size={14} /> Export Excel
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={15} /> New Transfer
          </button>
        </div>
      </div>

      {isManager && pendingList.length > 0 && (
        <div style={{
          background: 'var(--yellow-dim)', border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <AlertCircle size={16} color="var(--yellow)" />
          <span style={{ fontSize: 13, color: 'var(--yellow)', fontWeight: 500 }}>
            {pendingList.length} transfer request{pendingList.length > 1 ? 's' : ''} awaiting your approval
          </span>
        </div>
      )}

      {/* Filters */}
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 20 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Filters {activeFilters > 0 && <span className="badge badge-blue" style={{ marginLeft: 6 }}>{activeFilters}</span>}
          </span>
          {(activeFilters > 0 || search) && (
            <button className="btn btn-ghost btn-sm" onClick={() => {
              setStatusFilter(''); setFromFilter(''); setToFilter(''); setItemFilter(''); setSearch('');
            }}>Clear all</button>
          )}
        </div>
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
          {isManager && (
            <>
              <select className="form-input" value={fromFilter} onChange={e => setFromFilter(e.target.value)}>
                <option value="">From (All Workers)</option>
                {uniqueFromUsers.map((u: any) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
              <select className="form-input" value={toFilter} onChange={e => setToFilter(e.target.value)}>
                <option value="">To (All Workers)</option>
                {uniqueToUsers.map((u: any) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            </>
          )}
          <select className="form-input" value={itemFilter} onChange={e => setItemFilter(e.target.value)}>
            <option value="">All Items</option>
            {uniqueItems.map((i: any) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2" style={{ marginBottom: 16 }}>
        {(['', 'pending', 'approved', 'rejected', 'cancelled'] as const).map(s => {
          const count = s === '' ? allTransfers.length : allTransfers.filter(t => t.status === s).length;
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
        <div className="empty-state"><ArrowLeftRight size={40} /><span>Loading…</span></div>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <ArrowLeftRight size={40} />
          <span>No transfer requests found</span>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setShowCreate(true)}>
            Create your first transfer request
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map(tr => (
            <div key={tr.id} className="card" style={{ padding: '16px 20px' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div style={{
                    width: 36, height: 36, borderRadius: 'var(--radius)',
                    background: 'var(--bg-4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <ArrowLeftRight size={16} color="var(--text-2)" />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      <span style={{ color: 'var(--accent)' }}>{tr.fromUser?.firstName} {tr.fromUser?.lastName}</span>
                      <span style={{ color: 'var(--text-3)', margin: '0 8px' }}>→</span>
                      <span>{tr.toUser?.firstName} {tr.toUser?.lastName}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                      <strong style={{ color: 'var(--text)' }}>{tr.quantity}×</strong> {tr.item?.name}
                      {tr.reason && <span style={{ marginLeft: 8, color: 'var(--text-3)' }}>· "{tr.reason}"</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {statusBadge(tr.status)}
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    {formatDistanceToNow(new Date(tr.createdAt), { addSuffix: true })}
                  </span>
                </div>
              </div>

              {(tr.status === 'approved' || tr.status === 'rejected') && tr.reviewedBy && (
                <div style={{
                  marginTop: 10, padding: '8px 12px',
                  background: tr.status === 'approved' ? 'var(--green-dim)' : 'var(--red-dim)',
                  borderRadius: 'var(--radius)', fontSize: 12,
                  color: tr.status === 'approved' ? 'var(--green)' : 'var(--red)',
                }}>
                  {tr.status === 'approved' ? '✓ Approved' : '✗ Rejected'} by {tr.reviewedBy.firstName} {tr.reviewedBy.lastName}
                  {tr.rejectionReason && <span style={{ marginLeft: 6, opacity: 0.8 }}>— "{tr.rejectionReason}"</span>}
                </div>
              )}

              {tr.status === 'pending' && (
                <div className="flex gap-2" style={{ marginTop: 12 }}>
                  {isManager && (
                    <>
                      <button className="btn btn-success btn-sm" onClick={() => handleApprove(tr.id)} disabled={reviewTransfer.isPending}>
                        <Check size={13} /> Approve
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => { setRejectTarget(tr); setRejectReason(''); }}>
                        <X size={13} /> Reject
                      </button>
                    </>
                  )}
                  {(tr.fromUserId === user?.id || isManager) && (
                    <button className="btn btn-ghost btn-sm"
                      onClick={() => { if (confirm('Cancel this request?')) cancelTransfer.mutate(tr.id); }}>
                      <Ban size={13} /> Cancel
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Transfer Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Request Item Transfer"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate}
            disabled={createTransfer.isPending || !form.toUserId || !form.sourceAssignmentId || form.quantity < 1}>
            {createTransfer.isPending ? 'Submitting…' : 'Submit Request'}
          </button>
        </>}>
        <div style={{ background: 'var(--bg-3)', borderRadius: 'var(--radius)', padding: '12px 16px', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.7 }}>
          {isManager
            ? 'As a manager you can initiate transfers from any worker\'s assigned items.'
            : 'Select an item from your inventory and the worker you want to transfer it to.'}
        </div>
        <div className="form-group">
          <label className="form-label">
            {isManager ? 'Source Assignment (any worker)' : 'Item from my inventory'} *
          </label>
          <select className="form-input" value={form.sourceAssignmentId} onChange={e => {
            const a = allAssignments.find(x => x.id === e.target.value);
            setForm({ ...form, sourceAssignmentId: e.target.value, itemId: a?.itemId || '', quantity: 1 });
          }}>
            <option value="">Select assignment…</option>
            {assignmentOptions.map((a: any) => (
              <option key={a.id} value={a.id}>
                {isManager
                  ? `${a.assignedTo?.firstName || ''} ${a.assignedTo?.lastName || ''} — ${a.item?.name} (${a.quantity} units)`
                  : `${a.item?.name} — ${a.quantity} assigned to me`
                }
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Transfer to worker *</label>
          <select className="form-input" value={form.toUserId} onChange={e => setForm({ ...form, toUserId: e.target.value })}>
            <option value="">Select worker…</option>
            {toWorkerOptions.map((w: any) => (
              <option key={w.id} value={w.id}>{w.firstName} {w.lastName} {w.department ? `(${w.department})` : ''}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">
            Quantity *
            {selectedAssignment && <span style={{ color: 'var(--text-3)', marginLeft: 8 }}>max {selectedAssignment.quantity}</span>}
          </label>
          <input type="number" min={1} max={selectedAssignment?.quantity || 999}
            className="form-input" value={form.quantity}
            onChange={e => setForm({ ...form, quantity: +e.target.value })}
            disabled={!form.sourceAssignmentId} />
        </div>
        <div className="form-group">
          <label className="form-label">Reason (optional)</label>
          <textarea className="form-input" rows={2} value={form.reason}
            onChange={e => setForm({ ...form, reason: e.target.value })}
            placeholder="Why are you transferring these items?" />
        </div>
      </Modal>

      {/* Reject Modal */}
      <Modal isOpen={!!rejectTarget} onClose={() => setRejectTarget(null)} title="Reject Transfer Request" maxWidth={420}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setRejectTarget(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={handleReject} disabled={reviewTransfer.isPending}>
            {reviewTransfer.isPending ? 'Rejecting…' : 'Reject Request'}
          </button>
        </>}>
        {rejectTarget && (
          <>
            <div style={{ background: 'var(--bg-3)', borderRadius: 'var(--radius)', padding: '12px 16px', fontSize: 13 }}>
              Rejecting transfer of <strong>{rejectTarget.quantity}× {rejectTarget.item?.name}</strong> from{' '}
              {rejectTarget.fromUser?.firstName} to {rejectTarget.toUser?.firstName}
            </div>
            <div className="form-group">
              <label className="form-label">Reason for rejection (optional)</label>
              <textarea className="form-input" rows={3} value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Explain why this transfer is being rejected…" />
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}