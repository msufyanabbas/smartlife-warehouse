import { useState, useRef, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Plus, Search, ClipboardList, RotateCcw, Activity, Download, Trash2, CheckCircle } from 'lucide-react';
import {
  useAssignments, useCreateAssignment, useCreateReturnRequest,
  useWorkers, useInventory, useCreateUsage, useAssignmentUsage,
} from '../hooks/useApi';
import { useAuth } from '../contexts/AuthContext';
import type { Assignment, ItemUsage } from '../types';
import Modal from '../components/Modal';
import { formatDistanceToNow, format } from 'date-fns';

// ── Item Row with autocomplete for assignment ──────────────────────────────
function ItemRow({ row, index, onUpdate, onRemove, usedItemIds, availableItems }: {
  row: any; index: number;
  onUpdate: (i: number, f: string, v: any) => void;
  onRemove: (i: number) => void;
  usedItemIds: string[];
  availableItems: any[];
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
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const tdStyle = { padding: '4px 6px' };

  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={{ ...tdStyle, width: 28, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>{index + 1}</td>
      <td style={{ ...tdStyle, minWidth: 220 }}>
        <div ref={ref} style={{ position: 'relative' }}>
          <div style={{ position: 'relative' }}>
            <input className="form-input" style={{ paddingRight: row.itemId ? 28 : 10, fontSize: 13 }}
              value={query}
              onChange={e => { setQuery(e.target.value); if (!e.target.value) { onUpdate(index, 'itemId', ''); onUpdate(index, 'itemName', ''); onUpdate(index, 'sku', ''); } setOpen(true); }}
              onFocus={() => setOpen(true)}
              placeholder="Search item by name or SKU…" />
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
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
                    SKU: {item.sku} · {item.availableQuantity} available{item.schemeNo ? ` · ${item.schemeNo}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </td>
      <td style={{ ...tdStyle, width: 90 }}>
        <code style={{ fontSize: 11, color: 'var(--accent)' }}>{row.sku || '—'}</code>
      </td>
      <td style={{ ...tdStyle, width: 80 }}>
        <input className="form-input" type="number" min="1" max={row.maxQty || 999}
          style={{ fontSize: 13, textAlign: 'center' }}
          value={row.quantity}
          onChange={e => onUpdate(index, 'quantity', Math.min(parseInt(e.target.value) || 1, row.maxQty || 9999))} />
      </td>
      <td style={{ ...tdStyle, width: 60, textAlign: 'center', fontSize: 12, color: row.maxQty ? 'var(--green)' : 'var(--text-3)' }}>
        {row.maxQty || '—'}
      </td>
      <td style={{ ...tdStyle }}>
        <input className="form-input" style={{ fontSize: 12 }} value={row.notes} onChange={e => onUpdate(index, 'notes', e.target.value)} placeholder="Notes" />
      </td>
      <td style={{ ...tdStyle, width: 36, textAlign: 'center' }}>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }} onClick={() => onRemove(index)}>
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  );
}

const newItemRow = () => ({ itemId: '', itemName: '', sku: '', quantity: 1, maxQty: 0, notes: '' });
const thStyle: React.CSSProperties = { padding: '8px 10px', fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textAlign: 'left', background: 'var(--bg-3)' };

// Log Use form rows
function UsageRow({ row, index, onUpdate, onRemove }: { row: any; index: number; onUpdate: (i: number, f: string, v: any) => void; onRemove: (i: number) => void; }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={{ padding: '4px 6px', width: 28, textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>{index + 1}</td>
      <td style={{ padding: '4px 6px', fontSize: 13, fontWeight: 500 }}>{row.itemName}</td>
      <td style={{ padding: '4px 6px', width: 80 }}>
        <input className="form-input" type="number" min="1" max={row.maxQty}
          style={{ fontSize: 13, textAlign: 'center' }}
          value={row.quantityUsed}
          onChange={e => onUpdate(index, 'quantityUsed', Math.min(parseInt(e.target.value) || 1, row.maxQty))} />
      </td>
      <td style={{ padding: '4px 6px', width: 120 }}>
        <input className="form-input" style={{ fontSize: 12 }} value={row.taskNo} onChange={e => onUpdate(index, 'taskNo', e.target.value)} placeholder="TASK-001" />
      </td>
      <td style={{ padding: '4px 6px' }}>
        <input className="form-input" style={{ fontSize: 12 }} value={row.projectName} onChange={e => onUpdate(index, 'projectName', e.target.value)} placeholder="Project" />
      </td>
      <td style={{ padding: '4px 6px', width: 36, textAlign: 'center' }}>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }} onClick={() => onRemove(index)}>
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  );
}

export default function AssignmentsPage() {
  const { user } = useAuth();
  const { data: assignments = [], isLoading } = useAssignments();
  const { data: workers = [] } = useWorkers();
  const { data: inventory = [] } = useInventory();
  const createAssignment = useCreateAssignment();
  const createReturnRequest = useCreateReturnRequest();
  const createUsage = useCreateUsage();
  const isManager = user?.role === 'admin' || user?.role === 'manager';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [workerFilter, setWorkerFilter] = useState('');

  // Multi-assign modal
  const [showAssign, setShowAssign] = useState(false);
  const [assignWorker, setAssignWorker] = useState('');
  const [assignRows, setAssignRows] = useState([newItemRow()]);

  // Return modal
  const [returnTarget, setReturnTarget] = useState<Assignment | null>(null);
  const [returnForm, setReturnForm] = useState({ quantity: 1, notes: '' });

  // Usage modal
  const [usageTarget, setUsageTarget] = useState<Assignment | null>(null);
  const [usageRows, setUsageRows] = useState<any[]>([]);
  const [usageDate, setUsageDate] = useState('');

  const { data: assignmentUsage = [] } = useAssignmentUsage(usageTarget?.id || '');

  const allAssignments = assignments as Assignment[];
  const availableItems = (inventory as any[]).filter((i: any) => i.availableQuantity > 0);

  const list = allAssignments.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !q || a.item?.name.toLowerCase().includes(q) || a.assignedTo?.firstName.toLowerCase().includes(q) || a.item?.sku?.toLowerCase().includes(q);
    const matchStatus = !statusFilter || a.status === statusFilter;
    const matchWorker = !workerFilter || a.assignedToId === workerFilter;
    return matchSearch && matchStatus && matchWorker;
  });

  const usedItemIds = assignRows.map(r => r.itemId).filter(Boolean);
  const updateAssignRow = useCallback((i: number, f: string, v: any) => setAssignRows(prev => prev.map((r, idx) => idx === i ? { ...r, [f]: v } : r)), []);
  const removeAssignRow = useCallback((i: number) => setAssignRows(prev => prev.filter((_, idx) => idx !== i)), []);
  const updateUsageRow = useCallback((i: number, f: string, v: any) => setUsageRows(prev => prev.map((r, idx) => idx === i ? { ...r, [f]: v } : r)), []);
  const removeUsageRow = useCallback((i: number) => setUsageRows(prev => prev.filter((_, idx) => idx !== i)), []);

  const handleAssign = async () => {
    if (!assignWorker) { alert('Select a worker'); return; }
    const valid = assignRows.filter(r => r.itemId && r.quantity > 0);
    if (valid.length === 0) { alert('Add at least one item'); return; }
    for (const row of valid) {
      await createAssignment.mutateAsync({ assignedToId: assignWorker, itemId: row.itemId, quantity: row.quantity, notes: row.notes || undefined });
    }
    setShowAssign(false);
  };

  const handleReturn = async () => {
    if (!returnTarget) return;
    await createReturnRequest.mutateAsync({ assignmentId: returnTarget.id, itemId: returnTarget.itemId, quantity: returnForm.quantity, notes: returnForm.notes || undefined });
    setReturnTarget(null);
  };

  const openUsage = (a: Assignment) => {
    setUsageRows([{ assignmentId: a.id, itemId: a.itemId, itemName: a.item?.name, quantityUsed: 1, maxQty: a.quantity, taskNo: '', projectName: a.item?.projectName || '' }]);
    setUsageDate('');
    setUsageTarget(a);
  };

  const handleUsage = async () => {
    const valid = usageRows.filter(r => r.quantityUsed > 0 && r.taskNo && r.projectName);
    if (valid.length === 0) { alert('Fill Task No. and Project for each row'); return; }
    for (const row of valid) {
      await createUsage.mutateAsync({ assignmentId: row.assignmentId, itemId: row.itemId, quantityUsed: row.quantityUsed, taskNo: row.taskNo, projectName: row.projectName, usedAt: usageDate || undefined });
    }
    setUsageTarget(null);
  };

  const exportExcel = () => {
    const data = list.map(a => ({
      'Worker': `${a.assignedTo?.firstName} ${a.assignedTo?.lastName}`,
      'Item': a.item?.name, 'SKU': a.item?.sku, 'Quantity': a.quantity,
      'Scheme': a.item?.schemeNo, 'Project': a.item?.projectName,
      'Status': a.status, 'Assigned': format(new Date(a.createdAt), 'yyyy-MM-dd'),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Assignments');
    XLSX.writeFile(wb, `assignments-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div><h1>Assignments</h1><p>{list.length} assignment{list.length !== 1 ? 's' : ''}</p></div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={exportExcel}><Download size={14} /> Export</button>
          {isManager && (
            <button className="btn btn-primary" onClick={() => { setAssignWorker(''); setAssignRows([newItemRow()]); setShowAssign(true); }}>
              <Plus size={15} /> Assign Items
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
          <div className="search-bar">
            <Search size={14} />
            <input placeholder="Search item, worker, SKU…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="form-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="returned">Returned</option>
            <option value="transferred">Transferred</option>
          </select>
          <select className="form-input" value={workerFilter} onChange={e => setWorkerFilter(e.target.value)}>
            <option value="">All Workers</option>
            {(workers as any[]).map((w: any) => <option key={w.id} value={w.id}>{w.firstName} {w.lastName}</option>)}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="empty-state"><ClipboardList size={40} /><span>Loading…</span></div>
      ) : list.length === 0 ? (
        <div className="empty-state"><ClipboardList size={40} /><span>No assignments found</span></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Worker</th><th>Item</th><th>SKU</th><th>Scheme / Project</th>
                <th style={{ textAlign: 'center' }}>Qty</th>
                <th>Status</th><th>Assigned</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map(a => (
                <tr key={a.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{a.assignedTo?.firstName} {a.assignedTo?.lastName}</div>
                    {a.assignedTo?.department && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{a.assignedTo.department}</div>}
                  </td>
                  <td style={{ fontWeight: 500 }}>{a.item?.name}</td>
                  <td><code style={{ fontSize: 11, background: 'var(--bg-3)', padding: '2px 6px', borderRadius: 4, color: 'var(--accent)' }}>{a.item?.sku}</code></td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{a.item?.schemeNo} {a.item?.projectName ? `/ ${a.item.projectName}` : ''}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{a.quantity}</td>
                  <td><span className={`badge badge-${a.status === 'active' ? 'green' : a.status === 'returned' ? 'gray' : 'blue'}`}>{a.status}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}</td>
                  <td>
                    {a.status === 'active' && (
                      <div className="flex gap-2">
                        <button className="btn btn-ghost btn-sm" onClick={() => openUsage(a)}><Activity size={13} /> Log Use</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setReturnTarget(a); setReturnForm({ quantity: a.quantity, notes: '' }); }}><RotateCcw size={13} /> Return</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Multi-Assign Modal */}
      <Modal isOpen={showAssign} onClose={() => setShowAssign(false)} title="Assign Items to Worker" size="lg"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setShowAssign(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleAssign} disabled={createAssignment.isPending || !assignWorker}>
            {createAssignment.isPending ? 'Assigning…' : `Assign ${assignRows.filter(r => r.itemId).length} Item(s)`}
          </button>
        </>}>
        <div className="form-group">
          <label className="form-label">Worker *</label>
          <select className="form-input" value={assignWorker} onChange={e => setAssignWorker(e.target.value)}>
            <option value="">Select worker…</option>
            {(workers as any[]).map((w: any) => <option key={w.id} value={w.id}>{w.firstName} {w.lastName}{w.department ? ` (${w.department})` : ''}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 12, color: 'var(--accent)', background: 'var(--accent-dim)', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
          💡 Search for items by name or SKU. Add multiple rows to assign several items at once.
        </div>
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>#</th>
                <th style={thStyle}>Item</th>
                <th style={thStyle}>SKU</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Qty</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Avail.</th>
                <th style={thStyle}>Notes</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {assignRows.map((row, idx) => (
                <ItemRow key={idx} row={row} index={idx} onUpdate={updateAssignRow} onRemove={removeAssignRow} usedItemIds={usedItemIds} availableItems={availableItems} />
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn btn-ghost" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} onClick={() => setAssignRows(prev => [...prev, newItemRow()])}>
          <Plus size={14} /> Add Another Item
        </button>
      </Modal>

      {/* Return Modal */}
      <Modal isOpen={!!returnTarget} onClose={() => setReturnTarget(null)} title="Request Return"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setReturnTarget(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleReturn} disabled={createReturnRequest.isPending}>
            {createReturnRequest.isPending ? 'Submitting…' : 'Submit Return Request'}
          </button>
        </>}>
        {returnTarget && (
          <>
            <div style={{ background: 'var(--bg-3)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <div style={{ fontWeight: 600 }}>{returnTarget.item?.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>Assigned qty: <strong style={{ color: 'var(--text)' }}>{returnTarget.quantity}</strong></div>
            </div>
            <div className="form-group">
              <label className="form-label">Quantity to Return</label>
              <input type="number" min="1" max={returnTarget.quantity} className="form-input" value={returnForm.quantity} onChange={e => setReturnForm({ ...returnForm, quantity: parseInt(e.target.value) || 1 })} />
            </div>
            <div className="form-group">
              <label className="form-label">Notes (optional)</label>
              <textarea className="form-input" rows={2} value={returnForm.notes} onChange={e => setReturnForm({ ...returnForm, notes: e.target.value })} placeholder="Reason for return…" />
            </div>
          </>
        )}
      </Modal>

      {/* Log Usage Modal */}
      <Modal isOpen={!!usageTarget} onClose={() => setUsageTarget(null)} title={`Log Usage — ${usageTarget?.item?.name}`} size="lg"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setUsageTarget(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleUsage} disabled={createUsage.isPending}>
            {createUsage.isPending ? 'Logging…' : 'Log Usage'}
          </button>
        </>}>
        {usageTarget && (
          <>
            <div className="form-group">
              <label className="form-label">Date Used (optional)</label>
              <input type="date" className="form-input" value={usageDate} onChange={e => setUsageDate(e.target.value)} />
            </div>
            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>Item</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Qty Used</th>
                    <th style={thStyle}>Task No. *</th>
                    <th style={thStyle}>Project *</th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {usageRows.map((row, idx) => (
                    <UsageRow key={idx} row={row} index={idx} onUpdate={updateUsageRow} onRemove={removeUsageRow} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}