import { useState, useRef, useEffect, useCallback } from 'react';
import { ShoppingCart, Check, X, Ban, AlertCircle, Search, Plus, Trash2, CheckCircle, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  useItemRequests, useReviewItemRequest, useCancelItemRequest,
  usePendingItemRequests, useCreateItemRequest, useInventory,
} from '../hooks/useApi';
import { useAuth } from '../contexts/AuthContext';
import type { ItemRequest } from '../types';
import Modal from '../components/Modal';
import { formatDistanceToNow, format } from 'date-fns';

function statusBadge(s: string) {
  const map: any = { pending: 'badge-yellow', approved: 'badge-green', rejected: 'badge-red', cancelled: 'badge-gray' };
  return <span className={`badge ${map[s] || 'badge-gray'}`}>{s}</span>;
}

// ── Item row for request form ──────────────────────────────────────────────
function RequestItemRow({ row, index, onUpdate, onRemove, usedItemIds, availableItems }: {
  row: any; index: number;
  onUpdate: (i: number, f: string, v: any) => void;
  onRemove: (i: number) => void;
  usedItemIds: string[]; availableItems: any[];
}) {
  const [query, setQuery] = useState(row.itemName || '');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = availableItems.filter(i =>
    (!usedItemIds.includes(i.id) || i.id === row.itemId) &&
    (!query || i.name.toLowerCase().includes(query.toLowerCase()) || i.sku.toLowerCase().includes(query.toLowerCase()))
  );

  const select = (item: any) => {
    setQuery(item.name); setOpen(false);
    onUpdate(index, 'itemId', item.id);
    onUpdate(index, 'itemName', item.name);
    onUpdate(index, 'sku', item.sku);
    onUpdate(index, 'maxQty', item.availableQuantity);
    onUpdate(index, 'quantity', 1);
  };

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={{ padding: '4px 6px', width: 28, textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>{index + 1}</td>
      <td style={{ padding: '4px 6px', minWidth: 220 }}>
        <div ref={ref} style={{ position: 'relative' }}>
          <div style={{ position: 'relative' }}>
            <input className="form-input" style={{ paddingRight: row.itemId ? 28 : 10, fontSize: 13 }}
              value={query}
              onChange={e => { setQuery(e.target.value); if (!e.target.value) { onUpdate(index, 'itemId', ''); onUpdate(index, 'itemName', ''); } setOpen(true); }}
              onFocus={() => setOpen(true)} placeholder="Search item…" />
            {row.itemId && <CheckCircle size={13} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--green)' }} />}
          </div>
          {open && filtered.length > 0 && (
            <div style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 999, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.35)', overflow: 'hidden', maxHeight: 200, overflowY: 'auto' }}>
              {filtered.map((item: any) => (
                <div key={item.id} onMouseDown={() => select(item)}
                  style={{ padding: '9px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-dim)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{item.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>SKU: {item.sku} · {item.availableQuantity} available</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </td>
      <td style={{ padding: '4px 6px', width: 80 }}>
        <input className="form-input" type="number" min="1" max={row.maxQty || 999}
          style={{ fontSize: 13, textAlign: 'center' }} value={row.quantity}
          onChange={e => onUpdate(index, 'quantity', parseInt(e.target.value) || 1)} />
      </td>
      <td style={{ padding: '4px 6px' }}>
        <input className="form-input" style={{ fontSize: 12 }} value={row.reason} onChange={e => onUpdate(index, 'reason', e.target.value)} placeholder="Reason (optional)" />
      </td>
      <td style={{ padding: '4px 6px', width: 36, textAlign: 'center' }}>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }} onClick={() => onRemove(index)}>
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  );
}

const newReqRow = () => ({ itemId: '', itemName: '', sku: '', quantity: 1, maxQty: 0, reason: '' });
const thStyle: React.CSSProperties = { padding: '8px 10px', fontSize: 11, color: 'var(--text-3)', fontWeight: 600, background: 'var(--bg-3)' };

export default function ItemRequestsPage() {
  const { user } = useAuth();
  const { data: requests = [], isLoading } = useItemRequests();
  const { data: pending = [] } = usePendingItemRequests();
  const { data: inventory = [] } = useInventory();
  const reviewRequest = useReviewItemRequest();
  const cancelRequest = useCancelItemRequest();
  const createRequest = useCreateItemRequest();
  const isManager = user?.role === 'admin' || user?.role === 'manager';
  const pendingCount = (pending as ItemRequest[]).length;

  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [rejectTarget, setRejectTarget] = useState<ItemRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [reqRows, setReqRows] = useState([newReqRow()]);

  const availableItems = (inventory as any[]).filter((i: any) => i.availableQuantity > 0);
  const allRequests = requests as ItemRequest[];

  const list = allRequests.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q || r.item?.name.toLowerCase().includes(q) || r.requestedBy?.firstName.toLowerCase().includes(q) || r.requestedBy?.lastName.toLowerCase().includes(q);
    return matchSearch && (!statusFilter || r.status === statusFilter);
  });

  const usedItemIds = reqRows.map(r => r.itemId).filter(Boolean);
  const updateRow = useCallback((i: number, f: string, v: any) => setReqRows(prev => prev.map((r, idx) => idx === i ? { ...r, [f]: v } : r)), []);
  const removeRow = useCallback((i: number) => setReqRows(prev => prev.filter((_, idx) => idx !== i)), []);

  const handleCreate = async () => {
    const valid = reqRows.filter(r => r.itemId && r.quantity > 0);
    if (valid.length === 0) { alert('Select at least one item'); return; }
    for (const row of valid) {
      await createRequest.mutateAsync({ itemId: row.itemId, quantity: row.quantity, reason: row.reason || undefined });
    }
    setShowCreate(false);
  };

  const exportExcel = () => {
    const data = list.map(r => ({
      'Requested By': `${r.requestedBy?.firstName} ${r.requestedBy?.lastName}`,
      'Item': r.item?.name, 'SKU': r.item?.sku, 'Quantity': r.quantity,
      'Reason': r.reason || '', 'Status': r.status,
      'Date': format(new Date(r.createdAt), 'yyyy-MM-dd'),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Item Requests');
    XLSX.writeFile(wb, `item-requests-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>Item Requests</h1>
          <p>Workers request items from inventory — managers approve and items are auto-assigned</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={exportExcel}><Download size={14} /> Export</button>
          <button className="btn btn-primary" onClick={() => { setReqRows([newReqRow()]); setShowCreate(true); }}>
            <Plus size={15} /> New Request
          </button>
        </div>
      </div>

      {isManager && pendingCount > 0 && (
        <div style={{ background: 'var(--yellow-dim)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertCircle size={16} color="var(--yellow)" />
          <span style={{ fontSize: 13, color: 'var(--yellow)', fontWeight: 500 }}>{pendingCount} item request{pendingCount > 1 ? 's' : ''} awaiting your approval</span>
        </div>
      )}

      {/* Filters */}
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
          <div className="search-bar">
            <Search size={14} />
            <input placeholder="Search item, worker…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="form-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {['pending', 'approved', 'rejected', 'cancelled'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2" style={{ marginBottom: 16 }}>
        {(['', 'pending', 'approved', 'rejected', 'cancelled'] as const).map(s => {
          const count = s === '' ? allRequests.length : allRequests.filter(r => r.status === s).length;
          return (
            <button key={s} className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setStatusFilter(s === statusFilter ? '' : s)}>
              {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 700, background: statusFilter === s ? 'rgba(255,255,255,0.2)' : 'var(--bg-4)', padding: '1px 6px', borderRadius: 99 }}>{count}</span>
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="empty-state"><ShoppingCart size={40} /><span>Loading…</span></div>
      ) : list.length === 0 ? (
        <div className="empty-state"><ShoppingCart size={40} /><span>No item requests found</span></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map(r => (
            <div key={r.id} className="card" style={{ padding: '16px 20px' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div style={{ width: 36, height: 36, borderRadius: 'var(--radius)', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ShoppingCart size={16} color="var(--accent)" />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      <span style={{ color: 'var(--accent)' }}>{r.requestedBy?.firstName} {r.requestedBy?.lastName}</span>
                      <span style={{ color: 'var(--text-3)', margin: '0 8px' }}>requested</span>
                      <span style={{ color: 'var(--text)' }}>{r.quantity}× {r.item?.name}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2, display: 'flex', gap: 12 }}>
                      <span>SKU: {r.item?.sku}</span>
                      {r.item?.schemeNo && <span>Scheme: {r.item.schemeNo}</span>}
                    </div>
                    {r.reason && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>Reason: "{r.reason}"</div>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {statusBadge(r.status)}
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}</span>
                </div>
              </div>
              {(r.status === 'approved' || r.status === 'rejected') && r.reviewedBy && (
                <div style={{ marginTop: 10, padding: '8px 12px', background: r.status === 'approved' ? 'var(--green-dim)' : 'var(--red-dim)', borderRadius: 'var(--radius)', fontSize: 12, color: r.status === 'approved' ? 'var(--green)' : 'var(--red)' }}>
                  {r.status === 'approved' ? `✓ Approved by ${r.reviewedBy.firstName} ${r.reviewedBy.lastName} — items assigned automatically` : `✗ Rejected by ${r.reviewedBy.firstName} ${r.reviewedBy.lastName}`}
                  {r.rejectionReason && <span style={{ marginLeft: 6, opacity: 0.8 }}>— "{r.rejectionReason}"</span>}
                </div>
              )}
              {r.status === 'pending' && (
                <div className="flex gap-2" style={{ marginTop: 12 }}>
                  {isManager && (
                    <>
                      <button className="btn btn-success btn-sm" onClick={() => reviewRequest.mutate({ id: r.id, action: 'approve' })} disabled={reviewRequest.isPending}><Check size={13} /> Approve & Assign</button>
                      <button className="btn btn-danger btn-sm" onClick={() => { setRejectTarget(r); setRejectReason(''); }}><X size={13} /> Reject</button>
                    </>
                  )}
                  {r.requestedById === user?.id && (
                    <button className="btn btn-ghost btn-sm" onClick={() => { if (confirm('Cancel this request?')) cancelRequest.mutate(r.id); }}><Ban size={13} /> Cancel</button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Request Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New Item Request" size="lg"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={createRequest.isPending}>
            {createRequest.isPending ? 'Submitting…' : `Submit ${reqRows.filter(r => r.itemId).length} Request(s)`}
          </button>
        </>}>
        <div style={{ fontSize: 12, color: 'var(--accent)', background: 'var(--accent-dim)', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
          💡 Your requests will be sent to a manager for approval. Items are assigned automatically once approved.
        </div>
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>#</th>
                <th style={thStyle}>Item</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Qty</th>
                <th style={thStyle}>Reason</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {reqRows.map((row, idx) => (
                <RequestItemRow key={idx} row={row} index={idx} onUpdate={updateRow} onRemove={removeRow} usedItemIds={usedItemIds} availableItems={availableItems} />
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn btn-ghost" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} onClick={() => setReqRows(prev => [...prev, newReqRow()])}>
          <Plus size={14} /> Add Another Item
        </button>
      </Modal>

      {/* Reject Modal */}
      <Modal isOpen={!!rejectTarget} onClose={() => setRejectTarget(null)} title="Reject Item Request" maxWidth={420}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setRejectTarget(null)}>Cancel</button>
          <button className="btn btn-danger" onClick={async () => { if (!rejectTarget) return; await reviewRequest.mutateAsync({ id: rejectTarget.id, action: 'reject', rejectionReason: rejectReason }); setRejectTarget(null); setRejectReason(''); }} disabled={reviewRequest.isPending}>
            {reviewRequest.isPending ? 'Rejecting…' : 'Reject Request'}
          </button>
        </>}>
        {rejectTarget && (
          <>
            <div style={{ background: 'var(--bg-3)', borderRadius: 'var(--radius)', padding: '12px 16px', fontSize: 13, marginBottom: 16 }}>
              Rejecting <strong>{rejectTarget.quantity}× {rejectTarget.item?.name}</strong> by {rejectTarget.requestedBy?.firstName} {rejectTarget.requestedBy?.lastName}
            </div>
            <div className="form-group">
              <label className="form-label">Reason (optional)</label>
              <textarea className="form-input" rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Why is this request being rejected?" />
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}