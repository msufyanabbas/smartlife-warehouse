import { useState } from 'react';
import { ArrowLeft, ClipboardList, Plus, Printer, Save } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  useAssignmentForm, useAssignmentForms, useCreateAssignmentForm, useUpdateAssignmentForm, useUsers,
} from '../../hooks/useApi';
import DocumentHeader from '../../components/documents/DocumentHeader';
import DocumentStatusBadge from '../../components/documents/DocumentStatusBadge';
import SignatureFooter from '../../components/documents/SignatureFooter';
import Field from '../../components/documents/Field';
import LineItemsTable from '../../components/documents/LineItemsTable';
import {
  stripEmptyRows, toLineRows, type LineColumn, type LineRow,
} from '../../components/documents/lineRows';
import { fullName, orUndefined, toDateInput, today } from '../../components/documents/formUtils';
import { useDocumentStock } from '../../hooks/useDocumentStock';
import type { AssignmentForm, User } from '../../types';

const MIN_ROWS = 15;
const ROW_DEFAULTS = { stockAvailable: 0, qtyRequested: 0, qtyApproved: 0, qtyIssued: 0 };

const DEPARTMENTS = ['Warehouse', 'Logistics', 'Safety', 'Maintenance', 'Operations', 'Management'];

const COLUMNS: LineColumn[] = [
  { key: 'itemCode', label: 'Item Code', width: '11%' },
  { key: 'itemDescription', label: 'Item Description', width: '24%' },
  { key: 'unit', label: 'Unit', width: '7%' },
  {
    key: 'stockAvailable', label: 'Stock Available', type: 'readonly', width: '9%',
    hint: 'Based on GRN receipts minus ASN assignments',
  },
  { key: 'qtyRequested', label: 'Qty Requested', type: 'number', width: '9%' },
  { key: 'qtyApproved', label: 'Qty Approved', type: 'number', width: '9%' },
  {
    key: 'qtyIssued',
    label: 'Qty Issued',
    type: 'number',
    width: '9%',
    // Cannot issue more than the storekeeper approved, nor more than exists.
    //
    // Stock binds even at zero. The earlier `|| undefined` collapsed a zero cap
    // to "no cap", which is exactly the case this column now has to hold: a SKU
    // whose GRN receipts are fully accounted for by ASN forms reads zero.
    // A free-text code has no stock figure behind it and stays uncapped, or the
    // row could never be filled in.
    max: row => {
      const approved = Number(row.qtyApproved) || 0;
      const stockCap = row.itemId ? Number(row.stockAvailable) || 0 : undefined;
      if (approved > 0) return stockCap == null ? approved : Math.min(approved, stockCap);
      return stockCap;
    },
    warn: row => {
      if (!row.itemId) return undefined;
      const available = Number(row.stockAvailable) || 0;
      return (Number(row.qtyIssued) || 0) > available
        ? `Exceeds available stock (${available})`
        : undefined;
    },
  },
  {
    key: 'serialNumber', label: 'Serial Number(s)', type: 'serial', qtyKey: 'qtyIssued',
    width: '14%', hint: 'Serial Number(s) — enter one for the line, or one per unit issued',
  },
];

export default function AssignmentFormPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const close = () => { setOpenId(null); setCreating(false); };

  if (creating || openId) {
    return (
      <AssignmentDocumentView
        key={openId ?? 'new'}
        id={openId ?? undefined}
        onClose={close}
        onCreated={id => { setCreating(false); setOpenId(id); }}
      />
    );
  }

  return <AssignmentFormList onNew={() => setCreating(true)} onOpen={setOpenId} />;
}

// ── List view ──────────────────────────────────────────────────────────────
function AssignmentFormList({ onNew, onOpen }: { onNew: () => void; onOpen: (id: string) => void }) {
  const { data: documents = [], isLoading } = useAssignmentForms();
  const list = documents as AssignmentForm[];

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>Stock Assigning</h1>
          <p>Material Assignment Records · {list.length} document{list.length === 1 ? '' : 's'}</p>
        </div>
        <button className="btn btn-primary" onClick={onNew}>
          <Plus size={14} /> New Assignment
        </button>
      </div>

      {isLoading ? (
        <div className="empty-state"><span>Loading…</span></div>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <ClipboardList size={48} />
          <span>No assignment records yet</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Assignment No.</th>
                <th>Date</th>
                <th>Assigned To</th>
                <th>Department</th>
                <th>Project / Site</th>
                <th>Priority</th>
                <th style={{ textAlign: 'center' }}>Total Issued</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map(doc => {
                const totalIssued = doc.items.reduce((sum, i) => sum + (i.qtyIssued || 0), 0);
                return (
                  <tr key={doc.id} onClick={() => onOpen(doc.id)} style={{ cursor: 'pointer' }}>
                    <td><strong style={{ color: 'var(--accent)' }}>{doc.assignmentNo}</strong></td>
                    <td>{doc.date ? format(new Date(doc.date), 'dd MMM yyyy') : '—'}</td>
                    <td>{fullName(doc.assignedTo)}</td>
                    <td style={{ color: 'var(--text-2)' }}>{doc.department || '—'}</td>
                    <td style={{ color: 'var(--text-2)' }}>{doc.projectSite || '—'}</td>
                    <td>{doc.priority}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{totalIssued}</td>
                    <td><DocumentStatusBadge status={doc.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Document view ──────────────────────────────────────────────────────────
interface FormState {
  date: string;
  priority: AssignmentForm['priority'];
  requestedById: string;
  department: string;
  projectSite: string;
  purposeDescription: string;
  assignedToId: string;
  notes: string;
  status: AssignmentForm['status'];
}

const BLANK: FormState = {
  date: today(), priority: 'Normal', requestedById: '', department: '',
  projectSite: '', purposeDescription: '', assignedToId: '', notes: '', status: 'draft',
};

const toFormState = (doc?: AssignmentForm): FormState => doc ? {
  date: toDateInput(doc.date),
  priority: doc.priority ?? 'Normal',
  requestedById: doc.requestedById ?? '',
  department: doc.department ?? '',
  projectSite: doc.projectSite ?? '',
  purposeDescription: doc.purposeDescription ?? '',
  assignedToId: doc.assignedToId ?? '',
  notes: doc.notes ?? '',
  status: doc.status ?? 'draft',
} : BLANK;

/** Waits for the document so the editor can seed its state without an effect. */
function AssignmentDocumentView({ id, onClose, onCreated }: {
  id?: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { data: doc, isLoading } = useAssignmentForm(id);

  if (id && isLoading) {
    return <div className="page"><div className="empty-state"><span>Loading…</span></div></div>;
  }

  return (
    <AssignmentEditor
      key={id ?? 'new'}
      id={id}
      doc={doc as AssignmentForm | undefined}
      onClose={onClose}
      onCreated={onCreated}
    />
  );
}

function AssignmentEditor({ id, doc, onClose, onCreated }: {
  id?: string;
  doc?: AssignmentForm;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { data: users = [] } = useUsers();
  const { resolveStock } = useDocumentStock();
  const createForm = useCreateAssignmentForm();
  const updateForm = useUpdateAssignmentForm();

  const [form, setForm] = useState<FormState>(() => toFormState(doc));
  const [rows, setRows] = useState<LineRow[]>(() => toLineRows(doc?.items, MIN_ROWS, ROW_DEFAULTS));

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const alreadyIssued = doc?.status === 'issued';

  const save = async (status: AssignmentForm['status']) => {
    // Issuing moves real stock out of `available`, and the backend only does it
    // on the draft/approved → issued transition, so make it a deliberate click.
    // The two checks below are what the backend enforces — an issue with no
    // recipient or no quantity books nothing out, and would leave the stock
    // report's Assigned column reading zero against an issued document.
    if (status === 'issued' && !alreadyIssued) {
      const total = rows.reduce((sum, r) => sum + (Number(r.qtyIssued) || 0), 0);
      if (!form.assignedToId) {
        toast.error('Select who the items are assigned to before issuing.');
        return;
      }
      if (!total) {
        toast.error('Enter a Qty Issued on at least one line before issuing.');
        return;
      }
      const confirmed = window.confirm(
        `Issue ${total} unit(s)? This deducts the issued quantities from available inventory.`,
      );
      if (!confirmed) return;
    }

    const payload = {
      ...form,
      status,
      date: orUndefined(form.date),
      requestedById: orUndefined(form.requestedById),
      assignedToId: orUndefined(form.assignedToId),
      items: stripEmptyRows(rows),
    };

    if (id) {
      await updateForm.mutateAsync({ id, data: payload });
      set('status', status);
    } else {
      const created = await createForm.mutateAsync(payload);
      onCreated(created.id);
    }

    if (status === 'issued') {
      const count = payload.items.filter(i => Number(i.qtyIssued) > 0).length;
      const worker = (users as User[]).find(u => u.id === form.assignedToId);
      const who = worker ? fullName(worker) : 'the recipient';
      toast.success(`Assignment issued — ${count} item${count === 1 ? '' : 's'} assigned to ${who}`);
    } else {
      toast.success(status === 'approved' ? 'Assignment approved' : 'Draft saved');
    }
  };

  const saving = createForm.isPending || updateForm.isPending;

  return (
    <div className="page">
      <div className="flex items-center justify-between no-print" style={{ marginBottom: 20 }}>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          <ArrowLeft size={14} /> Back to list
        </button>
        <div className="flex gap-2 items-center">
          <DocumentStatusBadge status={form.status} />
          <button className="btn btn-ghost btn-sm" onClick={() => window.print()} disabled={!id}>
            <Printer size={14} /> Print
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => save('draft')} disabled={saving || alreadyIssued}>
            <Save size={14} /> Save Draft
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => save('approved')} disabled={saving || alreadyIssued}>
            <Save size={14} /> Approve
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => save('issued')} disabled={saving}>
            <Save size={14} /> {alreadyIssued ? 'Save' : 'Issue Items'}
          </button>
        </div>
      </div>

      <div className="doc-paper print-doc">
        <DocumentHeader
          title="STOCK ASSIGNING"
          refLabel="Assignment No."
          refNumber={doc?.assignmentNo}
        />

        <div className="doc-grid">
          <Field label="Date">
            <input type="date" className="doc-input" value={form.date}
              onChange={e => set('date', e.target.value)} />
          </Field>
          <Field label="Priority">
            <select className="doc-input" value={form.priority}
              onChange={e => set('priority', e.target.value as FormState['priority'])}>
              {['Normal', 'High', 'Urgent'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Requested By">
            <select className="doc-input" value={form.requestedById}
              onChange={e => set('requestedById', e.target.value)}>
              <option value="">— Select —</option>
              {(users as User[]).map(u => <option key={u.id} value={u.id}>{fullName(u)}</option>)}
            </select>
          </Field>

          <Field label="Department">
            <select className="doc-input" value={form.department}
              onChange={e => set('department', e.target.value)}>
              <option value="">— Select —</option>
              {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Project / Site">
            <input className="doc-input" value={form.projectSite}
              onChange={e => set('projectSite', e.target.value)} />
          </Field>
          <Field label="Assigned To">
            <select className="doc-input" value={form.assignedToId}
              onChange={e => set('assignedToId', e.target.value)}>
              <option value="">— Select —</option>
              {(users as User[]).map(u => (
                <option key={u.id} value={u.id}>{fullName(u)} · {u.role}</option>
              ))}
            </select>
          </Field>
        </div>

        <div style={{ marginBottom: 18 }}>
          <Field label="Purpose / Description">
            <textarea className="doc-input" rows={2} value={form.purposeDescription}
              onChange={e => set('purposeDescription', e.target.value)} />
          </Field>
        </div>

        <LineItemsTable
          rows={rows}
          onChange={setRows}
          columns={COLUMNS}
          source="inventory"
          stockField="stockAvailable"
          resolveStock={resolveStock}
          minRows={MIN_ROWS}
          newRowDefaults={ROW_DEFAULTS}
          totalKey="qtyIssued"
          totalLabel="Total Quantity Assigned"
        />

        <div style={{ marginTop: 18 }}>
          <Field label="Notes / Special Instructions">
            <textarea className="doc-input" rows={3} value={form.notes}
              onChange={e => set('notes', e.target.value)} />
          </Field>
        </div>

        <SignatureFooter
          labels={['Requested By', 'Approved By', 'Store / Issuing Officer', 'Recipient Signature']}
        />
      </div>
    </div>
  );
}
