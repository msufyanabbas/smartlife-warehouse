import { useMemo, useState } from 'react';
import {
  AlertCircle, ArrowLeft, Check, Eye, Plus, Printer, RotateCcw, Save, X,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  useApprovers, useAssignmentForms, useCreateRtn, useInventory, useRtn, useRtnList,
  useReviewRtn, useUpdateRtn, useWorkers,
} from '../../hooks/useApi';
import { useAuth } from '../../contexts/AuthContext';
import Modal from '../../components/Modal';
import DocumentHeader from '../../components/documents/DocumentHeader';
import DocumentStatusBadge from '../../components/documents/DocumentStatusBadge';
import SignatureFooter from '../../components/documents/SignatureFooter';
import Field from '../../components/documents/Field';
import PrintDocument, { type PrintColumn } from '../../components/documents/PrintDocument';
import LineItemsTable from '../../components/documents/LineItemsTable';
import {
  stripEmptyRows, toLineRows, type LineColumn, type LineRow,
} from '../../components/documents/lineRows';
import {
  fullName, orUndefined, printDate, printSerials, toDateInput, today,
} from '../../components/documents/formUtils';
import type {
  AssignmentForm, RtnDocument, RtnItemCondition, RtnStatus, User,
} from '../../types';

const MIN_ROWS = 15;
const CONDITIONS: RtnItemCondition[] = ['Good', 'Damaged', 'Expired', 'Other'];
// The leading blank is deliberate: a line whose reason nobody stated should read
// as unstated rather than silently claim the first option.
const REASONS = ['', 'Project Complete', 'Defective', 'Excess Stock', 'Wrong Item', 'Other'];

const ROW_DEFAULTS = {
  qtyReturned: 0, serialNumbers: '', condition: 'Good', reason: '',
};

const PRINT_COLUMNS: PrintColumn[] = [
  { key: 'itemCode', label: 'Item Code', strong: true },
  { key: 'itemDescription', label: 'Description' },
  { key: 'unit', label: 'Unit', align: 'center' },
  { key: 'qtyReturned', label: 'Qty Returned', align: 'center', strong: true },
  { key: 'serialNumbers', label: 'Serial Number(s)', render: row => printSerials(row.serialNumbers) },
  { key: 'condition', label: 'Condition', align: 'center' },
  { key: 'reason', label: 'Reason' },
];

/** What the named worker is still holding, per inventory row id. */
type HeldQuantities = Map<string, number>;

interface StockOption {
  id: string;
  name: string;
  sku: string;
  serialNumber: string;
  isActive: boolean;
  availableQuantity: number;
  product: { unit: string };
  unlinked?: boolean;
}

/** Only what an option is built from — the inventory feed carries much more. */
interface StockRow {
  id: string;
  name: string;
  sku: string;
  serialNumber?: string;
  product?: { unit?: string };
}

/**
 * What a worker may hand back: everything issued to them on an assignment form
 * (ASN), carrying the issued quantity in place of the warehouse balance — which
 * for stock already booked out to a person reads zero.
 *
 * The option keeps its inventory row wherever there is one, so the saved line's
 * `itemId` is a real inventory id and the return lands on the right row.
 */
function heldByWorker(
  workerId: string,
  assignmentForms: AssignmentForm[],
  stock: StockRow[],
): StockOption[] {
  if (!workerId) return [];

  const byId = new Map(stock.map(i => [i.id, i]));
  const bySku = new Map(stock.map(i => [String(i.sku ?? '').trim().toLowerCase(), i]));
  const held = new Map<string, StockOption>();

  for (const asn of assignmentForms) {
    if (asn.status !== 'issued' || asn.assignedToId !== workerId) continue;

    for (const line of asn.items ?? []) {
      const code = String(line.itemCode ?? '').trim().toLowerCase();
      if (!(line.qtyIssued > 0) || (!line.itemId && !code)) continue;

      const key = line.itemId || code;
      const already = held.get(key);
      if (already) {
        // The same item issued to them on more than one form.
        already.availableQuantity += line.qtyIssued;
        continue;
      }

      // Newer lines carry the inventory id; older ones only ever had the code.
      const item = (line.itemId ? byId.get(line.itemId) : undefined) ?? bySku.get(code);
      held.set(key, {
        ...(item ?? {}),
        id: line.itemId || item?.id || key,
        name: line.itemDescription || item?.name || line.itemCode || 'Item',
        sku: line.itemCode || item?.sku || '',
        serialNumber: line.serialNumber || item?.serialNumber || '',
        isActive: true,
        availableQuantity: line.qtyIssued,
        product: { unit: line.unit || item?.product?.unit || '' },
        // No inventory row and no id on the line: offer it, but as free text.
        unlinked: !line.itemId && !item,
      });
    }
  }

  return [...held.values()];
}

export default function RtnFormPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const close = () => { setOpenId(null); setCreating(false); };

  if (creating || openId) {
    return (
      <RtnDocumentView
        key={openId ?? 'new'}
        id={openId ?? undefined}
        onClose={close}
        onCreated={id => { setCreating(false); setOpenId(id); }}
      />
    );
  }

  return <RtnList onNew={() => setCreating(true)} onOpen={setOpenId} />;
}

// ── List view ──────────────────────────────────────────────────────────────
function RtnList({ onNew, onOpen }: { onNew: () => void; onOpen: (id: string) => void }) {
  const { user } = useAuth();
  const { data: documents = [], isLoading } = useRtnList();
  const list = documents as RtnDocument[];

  const isManager = user?.role === 'admin' || user?.role === 'manager';
  const pendingCount = list.filter(doc => doc.status === 'pending_approval').length;

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>Return Documents</h1>
          <p>{list.length} document{list.length === 1 ? '' : 's'}</p>
        </div>
        <button className="btn btn-primary" onClick={onNew}>
          <Plus size={14} /> New Return
        </button>
      </div>

      {isManager && pendingCount > 0 && (
        <div style={{
          background: 'var(--yellow-dim)',
          border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: 'var(--radius)',
          padding: '12px 16px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <AlertCircle size={16} color="var(--yellow)" />
          <span style={{ fontSize: 13, color: 'var(--yellow)', fontWeight: 500 }}>
            {pendingCount} return document{pendingCount === 1 ? '' : 's'} pending your approval
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="empty-state"><span>Loading…</span></div>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <RotateCcw size={48} />
          <span>No return documents yet</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Return No.</th>
                <th>Date</th>
                <th>Returned By</th>
                <th>Received By</th>
                <th>Project / Site</th>
                <th>Warehouse</th>
                <th style={{ textAlign: 'center' }}>Total Returned</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map(doc => {
                const totalReturned = doc.items.reduce((sum, i) => sum + (i.qtyReturned || 0), 0);
                return (
                  <tr key={doc.id} onClick={() => onOpen(doc.id)} style={{ cursor: 'pointer' }}>
                    <td><strong style={{ color: 'var(--accent)' }}>{doc.rtnNo}</strong></td>
                    <td>{doc.date ? format(new Date(doc.date), 'dd MMM yyyy') : '—'}</td>
                    <td>{fullName(doc.returnedBy)}</td>
                    <td style={{ color: 'var(--text-2)' }}>{fullName(doc.receivedBy)}</td>
                    <td style={{ color: 'var(--text-2)' }}>{doc.projectSite || '—'}</td>
                    <td style={{ color: 'var(--text-2)' }}>{doc.warehouseLocation || '—'}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{totalReturned}</td>
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
  returnedById: string;
  receivedById: string;
  projectSite: string;
  warehouseLocation: string;
  notes: string;
  status: RtnStatus;
}

const BLANK: FormState = {
  date: today(), returnedById: '', receivedById: '',
  projectSite: '', warehouseLocation: '', notes: '', status: 'draft',
};

const toFormState = (doc?: RtnDocument): FormState => doc ? {
  date: toDateInput(doc.date),
  returnedById: doc.returnedById ?? '',
  receivedById: doc.receivedById ?? '',
  projectSite: doc.projectSite ?? '',
  warehouseLocation: doc.warehouseLocation ?? '',
  notes: doc.notes ?? '',
  status: doc.status ?? 'draft',
} : BLANK;

/** Waits for the document so the editor can seed its state without an effect. */
function RtnDocumentView({ id, onClose, onCreated }: {
  id?: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { data: doc, isLoading } = useRtn(id);

  if (id && isLoading) {
    return <div className="page"><div className="empty-state"><span>Loading…</span></div></div>;
  }

  return (
    <RtnEditor
      key={id ?? 'new'}
      id={id}
      doc={doc as RtnDocument | undefined}
      onClose={onClose}
      onCreated={onCreated}
    />
  );
}

/** Who signed the document off, and why it came back if it was rejected. */
interface Verdict {
  by?: User;
  reason?: string;
}

const toVerdict = (doc?: RtnDocument): Verdict | undefined =>
  doc && (doc.status === 'approved' || doc.status === 'rejected')
    ? { by: doc.approvedBy, reason: doc.rejectionReason }
    : undefined;

const READ_ONLY_INPUT = { background: 'var(--bg-3)', cursor: 'not-allowed' } as const;

function RtnEditor({ id, doc, onClose, onCreated }: {
  id?: string;
  doc?: RtnDocument;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { user } = useAuth();
  const isManager = user?.role === 'admin' || user?.role === 'manager';

  const { data: approvers = [] } = useApprovers();
  // `/users/workers` is manager-only; a worker returns their own stock and never
  // needs the list.
  const { data: workers = [] } = useWorkers(isManager);
  const { data: assignmentForms = [] } = useAssignmentForms();
  const { data: inventory = [] } = useInventory();
  const createRtn = useCreateRtn();
  const updateRtn = useUpdateRtn();
  const reviewRtn = useReviewRtn();

  const [form, setForm] = useState<FormState>(() => toFormState(doc));
  const [rows, setRows] = useState<LineRow[]>(() => toLineRows(doc?.items, MIN_ROWS, ROW_DEFAULTS));
  const [verdict, setVerdict] = useState<Verdict | undefined>(() => toVerdict(doc));
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [preview, setPreview] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  // Submitted work is frozen while someone is looking at it, and an approved
  // return has already moved stock. Only a rejection reopens it.
  const canEdit = form.status === 'draft' || form.status === 'rejected';

  // The backend stamps a worker's own id on create, so the field is theirs and
  // not a choice. A manager raises the form on someone's behalf and picks.
  const returnedById = isManager ? form.returnedById : (doc?.returnedById ?? user?.id ?? '');
  const returnedByUser = isManager
    ? (workers as User[]).find(u => u.id === returnedById)
    : (doc?.returnedBy ?? user ?? undefined);

  const held = useMemo(
    () => heldByWorker(returnedById, assignmentForms as AssignmentForm[], inventory as StockRow[]),
    [returnedById, assignmentForms, inventory],
  );

  /** Issued quantity per option id, so a line cannot hand back more than went out. */
  const heldById: HeldQuantities = useMemo(
    () => new Map(held.map(item => [item.id, item.availableQuantity])),
    [held],
  );

  const columns: LineColumn[] = useMemo(() => [
    { key: 'itemCode', label: 'Item Code', width: '11%' },
    { key: 'itemDescription', label: 'Item Description', width: '20%' },
    { key: 'unit', label: 'Unit', width: '7%' },
    {
      key: 'qtyReturned', label: 'Qty Returned', type: 'number', width: '9%',
      hint: 'Cannot exceed what was issued to this person on an assignment form',
      // A line picked from their holdings cannot return more than went out; a
      // hand-typed code carries no issued figure and stays uncapped.
      max: row => (row.itemId ? heldById.get(row.itemId) : undefined),
      warn: row => {
        if (!row.itemId) return undefined;
        const issued = heldById.get(row.itemId) ?? 0;
        return (Number(row.qtyReturned) || 0) > issued
          ? `Exceeds quantity issued (${issued})`
          : undefined;
      },
    },
    {
      key: 'serialNumbers', label: 'Serial Number(s)', type: 'serial', qtyKey: 'qtyReturned',
      width: '16%', hint: 'Auto-filled from the issued item — edit, or give one serial per unit returned',
    },
    { key: 'condition', label: 'Condition', type: 'select', options: CONDITIONS, width: '10%' },
    { key: 'reason', label: 'Reason', type: 'select', options: REASONS, width: '13%' },
  ], [heldById]);

  const hasLineItems = rows.some(r => r.itemCode?.trim());

  /** The item list is scoped to whoever is returning, so lines picked for the previous person are no longer theirs. */
  const changeReturnedBy = (userId: string) => {
    if (hasLineItems &&
        !confirm('Changing "Returned By" clears the items already entered. Continue?')) {
      return;
    }
    set('returnedById', userId);
    if (hasLineItems) setRows(toLineRows(undefined, MIN_ROWS, ROW_DEFAULTS));
  };

  const noOptionsMessage = !returnedById
    ? 'Select "Returned By" above to see the items available to return'
    : `Nothing is assigned to ${fullName(returnedByUser)} on an issued assignment form`;

  const receivedByName = fullName((approvers as User[]).find(u => u.id === form.receivedById));

  const save = async (status: Extract<RtnStatus, 'draft' | 'pending_approval'>) => {
    const items = stripEmptyRows(rows).map(row => ({
      itemId: row.itemId,
      itemCode: row.itemCode,
      itemDescription: row.itemDescription,
      unit: row.unit,
      qtyReturned: Number(row.qtyReturned) || 0,
      serialNumbers: row.serialNumbers ?? '',
      condition: (row.condition || 'Good') as RtnItemCondition,
      reason: row.reason ?? '',
    }));

    if (status === 'pending_approval') {
      if (!items.length) {
        toast.error('Add at least one line item before submitting for approval.');
        return;
      }
      if (!items.some(item => item.qtyReturned > 0)) {
        toast.error('Enter a Qty Returned on at least one line before submitting.');
        return;
      }
    }

    const payload = {
      ...form,
      status,
      date: orUndefined(form.date),
      returnedById: orUndefined(returnedById),
      receivedById: orUndefined(form.receivedById),
      items,
    };

    if (id) {
      await updateRtn.mutateAsync({ id, data: payload });
      set('status', status);
    } else {
      const created = await createRtn.mutateAsync(payload);
      onCreated(created.id);
    }

    // Re-submitting clears the previous verdict on the server; drop it here too.
    if (status === 'pending_approval') {
      setVerdict(undefined);
      const total = items.reduce((sum, item) => sum + item.qtyReturned, 0);
      toast.success(`Submitted for approval — ${total} unit${total === 1 ? '' : 's'} to be returned`);
    } else {
      toast.success('Draft saved');
    }
  };

  const review = async (action: 'approve' | 'reject', reason?: string) => {
    if (!id) return;
    const updated: RtnDocument = await reviewRtn.mutateAsync({ id, action, rejectionReason: reason });
    set('status', updated.status);
    setVerdict(toVerdict(updated));
  };

  const totalReturned = rows.reduce((sum, r) => sum + (Number(r.qtyReturned) || 0), 0);
  const saving = createRtn.isPending || updateRtn.isPending || reviewRtn.isPending;

  return (
    <div className="page">
      <div className="flex items-center justify-between no-print" style={{ marginBottom: 20 }}>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          <ArrowLeft size={14} /> Back to list
        </button>
        <div className="flex gap-2 items-center">
          <DocumentStatusBadge status={form.status} />
          <button className="btn btn-ghost btn-sm" onClick={() => setPreview(p => !p)}>
            <Eye size={14} /> {preview ? 'Edit' : 'Preview'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => window.print()} disabled={!id}>
            <Printer size={14} /> Print
          </button>

          {canEdit && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => save('draft')} disabled={saving}>
                <Save size={14} /> Save Draft
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => save('pending_approval')} disabled={saving}>
                <Save size={14} /> Submit for Approval
              </button>
            </>
          )}

          {/*
            Approving is the step that moves stock — it takes the quantity off
            the worker and books it back onto the shelf — so it is gated to a
            manager and confirmed.
          */}
          {isManager && form.status === 'pending_approval' && (
            <>
              <button
                className="btn btn-success btn-sm"
                onClick={() => {
                  if (confirm(`Approve this return? ${totalReturned} unit(s) will be moved back into available stock.`)) {
                    review('approve');
                  }
                }}
                disabled={saving}
              >
                <Check size={14} /> Approve
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => setRejecting(true)} disabled={saving}>
                <X size={14} /> Reject
              </button>
            </>
          )}
        </div>
      </div>

      {form.status === 'pending_approval' && !isManager && (
        <div className="no-print" style={{
          background: 'var(--yellow-dim)', border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 16,
          fontSize: 13, color: 'var(--yellow)',
        }}>
          Submitted for approval — the form is locked until a manager reviews it.
        </div>
      )}

      {form.status === 'approved' && (
        <div className="no-print" style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--green-dim)', border: '1px solid rgba(22,163,74,0.3)',
          borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 16,
        }}>
          <AlertCircle size={16} color="var(--green)" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--green)', fontWeight: 500 }}>
            This return has been approved — the quantities are back in available stock and the
            document can no longer be edited.
          </span>
        </div>
      )}

      <div className="doc-paper no-print" style={preview ? { display: 'none' } : undefined}>
        <DocumentHeader
          title="STOCK RETURN DOCUMENT"
          subtitle="WAREHOUSE RETURN & RECEIPT"
          refLabel="Return No."
          refNumber={doc?.rtnNo}
        />

        <div className="doc-grid">
          <Field label="Date">
            <input type="date" className="doc-input" value={form.date} disabled={!canEdit}
              onChange={e => set('date', e.target.value)} />
          </Field>
          <Field label="Returned By">
            {isManager ? (
              <select className="doc-input" value={form.returnedById} disabled={!canEdit}
                onChange={e => changeReturnedBy(e.target.value)}>
                <option value="">— Select Worker —</option>
                {(workers as User[]).map(u => (
                  <option key={u.id} value={u.id}>{fullName(u)}</option>
                ))}
              </select>
            ) : (
              <input
                className="doc-input"
                value={fullName(returnedByUser)}
                readOnly
                title="Taken from the signed-in user"
                style={READ_ONLY_INPUT}
              />
            )}
          </Field>
          <Field label="Received By">
            <select className="doc-input" value={form.receivedById} disabled={!canEdit}
              onChange={e => set('receivedById', e.target.value)}>
              <option value="">— Select Manager/Admin —</option>
              {(approvers as User[]).map(u => (
                <option key={u.id} value={u.id}>{fullName(u)} ({u.role})</option>
              ))}
            </select>
          </Field>

          <Field label="Project / Site">
            <input className="doc-input" value={form.projectSite} disabled={!canEdit}
              onChange={e => set('projectSite', e.target.value)} />
          </Field>
          <Field label="Warehouse Location">
            <input className="doc-input" value={form.warehouseLocation} disabled={!canEdit}
              onChange={e => set('warehouseLocation', e.target.value)} />
          </Field>
        </div>

        <LineItemsTable
          rows={rows}
          onChange={setRows}
          columns={columns}
          source="inventory"
          minRows={MIN_ROWS}
          readOnly={!canEdit}
          newRowDefaults={ROW_DEFAULTS}
          totalKey="qtyReturned"
          totalLabel="Total Quantity Returned"
          // Only what this person was actually issued may be handed back, and
          // picking it fills in the serial the warehouse recorded against it.
          serialField="serialNumbers"
          availableItems={held}
          emptyOptionsMessage={noOptionsMessage}
        />

        <div style={{ marginTop: 18 }}>
          <Field label="Notes">
            <textarea className="doc-input" rows={3} value={form.notes} disabled={!canEdit}
              onChange={e => set('notes', e.target.value)} />
          </Field>
        </div>

        {verdict && (
          <div style={{
            marginTop: 16,
            padding: '10px 14px',
            borderRadius: 'var(--radius)',
            fontSize: 13,
            background: form.status === 'approved' ? 'var(--green-dim)' : 'var(--red-dim)',
            color: form.status === 'approved' ? 'var(--green)' : 'var(--red)',
          }}>
            {form.status === 'approved'
              ? `✓ Approved by ${fullName(verdict.by)}`
              : `✗ Rejected by ${fullName(verdict.by)}`}
            {verdict.reason && ` — "${verdict.reason}"`}
          </div>
        )}

        <SignatureFooter
          labels={['Returned By', 'Received By', 'Warehouse Manager']}
        />
      </div>

      <PrintDocument
        preview={preview}
        docLabel="Return No."
        docNumber={doc?.rtnNo}
        title="Stock Return Document"
        fields={[
          { label: 'Return No.', value: doc?.rtnNo },
          { label: 'Date', value: printDate(form.date) },
          { label: 'Returned By', value: fullName(returnedByUser) },
          { label: 'Received By', value: receivedByName },
          { label: 'Project / Site', value: form.projectSite },
          { label: 'Warehouse Location', value: form.warehouseLocation },
        ]}
        columns={PRINT_COLUMNS}
        rows={rows}
        totalKey="qtyReturned"
        totalLabel="Total Quantity Returned"
        notes={{ label: 'Notes', value: form.notes }}
        signatures={['Returned By', 'Received By', 'Warehouse Manager']}
      />

      <Modal
        isOpen={rejecting}
        onClose={() => setRejecting(false)}
        title="Reject Return Document"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setRejecting(false)}>Cancel</button>
            <button
              className="btn btn-danger"
              disabled={!rejectionReason.trim() || saving}
              onClick={async () => {
                await review('reject', rejectionReason.trim());
                setRejecting(false);
                setRejectionReason('');
              }}
            >
              Reject Return
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Reason for Rejection *</label>
          <textarea
            className="form-input"
            rows={3}
            value={rejectionReason}
            onChange={e => setRejectionReason(e.target.value)}
            placeholder="Explain why this return is being rejected…"
          />
        </div>
      </Modal>
    </div>
  );
}
