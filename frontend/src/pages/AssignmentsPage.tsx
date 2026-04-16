import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Plus, Search, ClipboardList, RotateCcw, Activity, Download } from 'lucide-react';
import {
  useAssignments, useCreateAssignment, useCreateReturnRequest,
  useWorkers, useInventory, useCreateUsage, useAssignmentUsage,
} from '../hooks/useApi';
import { useAuth } from '../contexts/AuthContext';
import type { Assignment, ItemUsage } from '../types';
import Modal from '../components/Modal';
import { formatDistanceToNow, format } from 'date-fns';

// ─── Assign Form ──────────────────────────────────────────────────────────────
// Defined OUTSIDE the page component to prevent remount on every keystroke
interface AssignFormProps {
  form: { assignedToId: string; itemId: string; quantity: number; notes: string };
  onChange: (form: any) => void;
  workers: any[];
  availableItems: any[];
  selectedItem: any;
}

function AssignForm({ form, onChange, workers, availableItems, selectedItem }: AssignFormProps) {
  return (
    <>
      <div className="form-group">
        <label className="form-label">Worker *</label>
        <select className="form-input" value={form.assignedToId}
          onChange={e => onChange({ ...form, assignedToId: e.target.value })}>
          <option value="">Select worker…</option>
          {workers.map((w: any) => (
            <option key={w.id} value={w.id}>
              {w.firstName} {w.lastName} {w.department ? `(${w.department})` : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Item *</label>
        <select className="form-input" value={form.itemId}
          onChange={e => onChange({ ...form, itemId: e.target.value, quantity: 1 })}>
          <option value="">Select item…</option>
          {availableItems.map((i: any) => (
            <option key={i.id} value={i.id}>
              {i.name} (SKU: {i.sku}) — {i.availableQuantity} available
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">
          Quantity *
          {selectedItem && (
            <span style={{ color: 'var(--text-3)', marginLeft: 8 }}>
              max {selectedItem.availableQuantity}
            </span>
          )}
        </label>
        <input type="number" min={1} max={selectedItem?.availableQuantity || 999}
          className="form-input" value={form.quantity}
          onChange={e => onChange({ ...form, quantity: +e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label">Notes (optional)</label>
        <textarea className="form-input" rows={2} value={form.notes}
          onChange={e => onChange({ ...form, notes: e.target.value })} />
      </div>
    </>
  );
}

// ─── Usage Form ───────────────────────────────────────────────────────────────
interface UsageFormProps {
  form: { quantityUsed: number; taskNo: string; projectName: string; notes: string; usedAt: string };
  onChange: (form: any) => void;
  maxQty: number;
}

function UsageForm({ form, onChange, maxQty }: UsageFormProps) {
  return (
    <>
      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">Task No. *</label>
          <input className="form-input" value={form.taskNo}
            onChange={e => onChange({ ...form, taskNo: e.target.value })}
            placeholder="e.g. TASK-001" />
        </div>
        <div className="form-group">
          <label className="form-label">Quantity Used *</label>
          <input type="number" min={1} max={maxQty} className="form-input"
            value={form.quantityUsed}
            onChange={e => onChange({ ...form, quantityUsed: +e.target.value })} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Project Name *</label>
        <input className="form-input" value={form.projectName}
          onChange={e => onChange({ ...form, projectName: e.target.value })}
          placeholder="Project name" />
      </div>
      <div className="form-group">
        <label className="form-label">Date Used</label>
        <input type="date" className="form-input" value={form.usedAt}
          onChange={e => onChange({ ...form, usedAt: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="form-label">Notes (optional)</label>
        <textarea className="form-input" rows={2} value={form.notes}
          onChange={e => onChange({ ...form, notes: e.target.value })}
          placeholder="Where or how used…" />
      </div>
    </>
  );
}

// ─── Return Form ──────────────────────────────────────────────────────────────
interface ReturnFormProps {
  quantity: number;
  notes: string;
  maxQty: number;
  onQuantityChange: (q: number) => void;
  onNotesChange: (n: string) => void;
}

function ReturnForm({ quantity, notes, maxQty, onQuantityChange, onNotesChange }: ReturnFormProps) {
  return (
    <>
      <div className="form-group">
        <label className="form-label">Quantity to return (max {maxQty})</label>
        <input type="number" min={1} max={maxQty} className="form-input"
          value={quantity} onChange={e => onQuantityChange(+e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">Notes (optional)</label>
        <textarea className="form-input" rows={2} value={notes}
          onChange={e => onNotesChange(e.target.value)}
          placeholder="Reason for return…" />
      </div>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
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
  const [workerFilter, setWorkerFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [returnTarget, setReturnTarget] = useState<Assignment | null>(null);
  const [usageTarget, setUsageTarget] = useState<Assignment | null>(null);
  const [showUsageLog, setShowUsageLog] = useState<Assignment | null>(null);

  const [assignForm, setAssignForm] = useState({ assignedToId: '', itemId: '', quantity: 1, notes: '' });
  const [returnQty, setReturnQty] = useState(1);
  const [returnNote, setReturnNote] = useState('');
  const [usageForm, setUsageForm] = useState({
    quantityUsed: 1, taskNo: '', projectName: '', notes: '', usedAt: '',
  });

  const list = (assignments as Assignment[]).filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      a.item?.name.toLowerCase().includes(q) ||
      a.assignedTo?.firstName.toLowerCase().includes(q) ||
      a.assignedTo?.lastName.toLowerCase().includes(q);
    const matchWorker = !workerFilter || a.assignedToId === workerFilter;
    const matchItem = !itemFilter || a.itemId === itemFilter;
    return matchSearch && matchWorker && matchItem;
  });

  const activeFilters = [workerFilter, itemFilter].filter(Boolean).length;
  const availableItems = (inventory as any[]).filter((i: any) => i.availableQuantity > 0);
  const selectedItem = (inventory as any[]).find((i: any) => i.id === assignForm.itemId);

  const handleCreate = async () => {
    await createAssignment.mutateAsync(assignForm);
    setShowCreate(false);
    setAssignForm({ assignedToId: '', itemId: '', quantity: 1, notes: '' });
  };

  const handleReturn = async () => {
    if (!returnTarget) return;
    await createReturnRequest.mutateAsync({
      assignmentId: returnTarget.id,
      itemId: returnTarget.itemId,
      quantity: returnQty,
      notes: returnNote,
    });
    setReturnTarget(null);
    setReturnNote('');
    setReturnQty(1);
  };

  const handleLogUsage = async () => {
    if (!usageTarget) return;
    await createUsage.mutateAsync({
      itemId: usageTarget.itemId,
      assignmentId: usageTarget.id,
      ...usageForm,
    });
    setUsageTarget(null);
    setUsageForm({ quantityUsed: 1, taskNo: '', projectName: '', notes: '', usedAt: '' });
  };

  const exportToExcel = () => {
    const rows = list.map(a => ({
      'Item': a.item?.name,
      'SKU': a.item?.sku,
      'Assigned To': `${a.assignedTo?.firstName} ${a.assignedTo?.lastName}`,
      'Assigned By': a.assignedBy ? `${a.assignedBy.firstName} ${a.assignedBy.lastName}` : '',
      'Quantity': a.quantity,
      'Status': a.status,
      'Assigned Date': new Date(a.createdAt).toLocaleDateString(),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0] || {}).map(() => ({ wch: 20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Assignments');
    XLSX.writeFile(wb, `assignments-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>Assignments</h1>
          <p>{list.length} active assignment{list.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          {list.length > 0 && (
            <button className="btn btn-ghost" onClick={exportToExcel}>
              <Download size={14} /> Export Excel
            </button>
          )}
          {isManager && (
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={15} /> Assign Items
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 20 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Filters {activeFilters > 0 && <span className="badge badge-blue" style={{ marginLeft: 6 }}>{activeFilters}</span>}
          </span>
          {(activeFilters > 0 || search) && (
            <button className="btn btn-ghost btn-sm"
              onClick={() => { setWorkerFilter(''); setItemFilter(''); setSearch(''); }}>
              Clear all
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          <div className="search-bar" style={{ gridColumn: '1 / -1' }}>
            <Search size={14} />
            <input placeholder="Search by worker or item…" value={search}
              onChange={e => setSearch(e.target.value)} style={{ width: '100%' }} />
          </div>
          {isManager && (
            <select className="form-input" value={workerFilter}
              onChange={e => setWorkerFilter(e.target.value)}>
              <option value="">All Workers</option>
              {(workers as any[]).map(w => (
                <option key={w.id} value={w.id}>{w.firstName} {w.lastName}</option>
              ))}
            </select>
          )}
          <select className="form-input" value={itemFilter}
            onChange={e => setItemFilter(e.target.value)}>
            <option value="">All Items</option>
            {(inventory as any[]).map((i: any) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="empty-state"><ClipboardList size={40} /><span>Loading…</span></div>
      ) : list.length === 0 ? (
        <div className="empty-state"><ClipboardList size={40} /><span>No active assignments found</span></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Assigned To</th>
                {isManager && <th>Assigned By</th>}
                <th>Qty</th>
                <th>Assigned</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map(a => (
                <tr key={a.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{a.item?.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{a.item?.sku}</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>
                      {a.assignedTo?.firstName} {a.assignedTo?.lastName}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'capitalize' }}>
                      {a.assignedTo?.role}
                    </div>
                  </td>
                  {isManager && (
                    <td style={{ color: 'var(--text-2)', fontSize: 12 }}>
                      {a.assignedBy ? `${a.assignedBy.firstName} ${a.assignedBy.lastName}` : '—'}
                    </td>
                  )}
                  <td><span className="badge badge-blue">{a.quantity}×</span></td>
                  <td style={{ color: 'var(--text-2)', fontSize: 12 }}>
                    {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                  </td>
                  <td>
                    <div className="flex gap-2">
                      {(isManager || a.assignedToId === user?.id) && (
                        <button className="btn btn-ghost btn-sm" title="Log Usage"
                          onClick={() => {
                            setUsageTarget(a);
                            setUsageForm({
                              quantityUsed: 1, taskNo: '', notes: '', usedAt: '',
                              projectName: (a.item as any)?.projectName || '',
                            });
                          }}>
                          <Activity size={13} /> Log Use
                        </button>
                      )}
                      {(isManager || a.assignedToId === user?.id) && (
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => { setReturnTarget(a); setReturnQty(1); setReturnNote(''); }}>
                          <RotateCcw size={13} /> Return
                        </button>
                      )}
                      <button className="btn btn-ghost btn-sm btn-icon" title="View usage history"
                        onClick={() => setShowUsageLog(a)}>
                        <ClipboardList size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Assign Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Assign Items to Worker"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate}
            disabled={createAssignment.isPending || !assignForm.assignedToId || !assignForm.itemId || assignForm.quantity < 1}>
            {createAssignment.isPending ? 'Assigning…' : 'Assign Items'}
          </button>
        </>}>
        <AssignForm
          form={assignForm}
          onChange={setAssignForm}
          workers={workers as any[]}
          availableItems={availableItems}
          selectedItem={selectedItem}
        />
      </Modal>

      {/* Log Usage Modal */}
      <Modal isOpen={!!usageTarget} onClose={() => setUsageTarget(null)} title="Log Item Usage" maxWidth={460}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setUsageTarget(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleLogUsage}
            disabled={createUsage.isPending || !usageForm.taskNo || !usageForm.projectName || usageForm.quantityUsed < 1}>
            {createUsage.isPending ? 'Logging…' : 'Log Usage'}
          </button>
        </>}>
        {usageTarget && (
          <>
            <div style={{ background: 'var(--bg-3)', borderRadius: 'var(--radius)', padding: '12px 16px' }}>
              <div style={{ fontWeight: 500 }}>{usageTarget.item?.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 3 }}>
                Assigned qty: <strong style={{ color: 'var(--text)' }}>{usageTarget.quantity}</strong>
              </div>
            </div>
            <UsageForm
              form={usageForm}
              onChange={setUsageForm}
              maxQty={usageTarget.quantity}
            />
          </>
        )}
      </Modal>

      {/* Return Modal — now submits a request for approval */}
      <Modal isOpen={!!returnTarget} onClose={() => setReturnTarget(null)} title="Request Item Return" maxWidth={420}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setReturnTarget(null)}>Cancel</button>
          <button className="btn btn-success" onClick={handleReturn} disabled={createReturnRequest.isPending}>
            {createReturnRequest.isPending ? 'Submitting…' : 'Submit Return Request'}
          </button>
        </>}>
        {returnTarget && (
          <>
            <div style={{
              background: 'var(--yellow-dim)', border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: 'var(--radius)', padding: '10px 14px',
              fontSize: 12, color: 'var(--yellow)', marginBottom: 4,
            }}>
              This will send a return request to your manager for approval.
              Items will be returned to stock once approved.
            </div>
            <div style={{ background: 'var(--bg-3)', borderRadius: 'var(--radius)', padding: '12px 16px' }}>
              <div style={{ fontWeight: 500 }}>{returnTarget.item?.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 3 }}>
                Currently assigned: <strong style={{ color: 'var(--text)' }}>{returnTarget.quantity}</strong>
              </div>
            </div>
            <ReturnForm
              quantity={returnQty}
              notes={returnNote}
              maxQty={returnTarget.quantity}
              onQuantityChange={setReturnQty}
              onNotesChange={setReturnNote}
            />
          </>
        )}
      </Modal>

      {/* Usage Log Viewer Modal */}
      {showUsageLog && (
        <UsageLogModal assignment={showUsageLog} onClose={() => setShowUsageLog(null)} />
      )}
    </div>
  );
}

function UsageLogModal({ assignment, onClose }: { assignment: Assignment; onClose: () => void }) {
  const { data: logs = [], isLoading } = useAssignmentUsage(assignment.id);
  const usageList = logs as ItemUsage[];

  return (
    <Modal isOpen onClose={onClose} title={`Usage History — ${assignment.item?.name}`} maxWidth={560}
      footer={<button className="btn btn-ghost" onClick={onClose}>Close</button>}>
      {isLoading ? (
        <div style={{ color: 'var(--text-2)', textAlign: 'center', padding: 20 }}>Loading…</div>
      ) : usageList.length === 0 ? (
        <div className="empty-state" style={{ padding: '24px 0' }}>
          <Activity size={28} />
          <span style={{ fontSize: 13 }}>No usage logged yet</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {usageList.map(log => (
            <div key={log.id} style={{ background: 'var(--bg-3)', borderRadius: 'var(--radius)', padding: '12px 14px' }}>
              <div className="flex items-center justify-between">
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  {log.quantityUsed}× used
                  <span className="badge badge-purple" style={{ marginLeft: 8 }}>Task: {log.taskNo}</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  {log.usedAt ? format(new Date(log.usedAt), 'dd MMM yyyy') : '—'}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>
                Project: {log.projectName}
                {log.notes && <span style={{ marginLeft: 8, color: 'var(--text-3)' }}>· {log.notes}</span>}
              </div>
            </div>
          ))}
          <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'right', marginTop: 4 }}>
            Total logged: {usageList.reduce((s, l) => s + l.quantityUsed, 0)} units
          </div>
        </div>
      )}
    </Modal>
  );
}