import { useState } from 'react';
import {
  AlertCircle, ArrowLeft, Check, ClipboardCheck, Plus, Printer, Save, X,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  useApprovers, useAssignmentForms, useCreateMic, useMic, useMicList,
  useReviewMic, useUpdateMic,
} from '../../hooks/useApi';
import { useAuth } from '../../contexts/AuthContext';
import Modal from '../../components/Modal';
import DocumentHeader from '../../components/documents/DocumentHeader';
import DocumentStatusBadge from '../../components/documents/DocumentStatusBadge';
import SignatureFooter from '../../components/documents/SignatureFooter';
import LineItemsTable from '../../components/documents/LineItemsTable';
import {
  stripEmptyRows, toLineRows, type LineColumn, type LineRow,
} from '../../components/documents/lineRows';
import Field from '../../components/documents/Field';
import { fullName, orUndefined, toDateInput, today, uniqueSorted } from '../../components/documents/formUtils';
import type { AssignmentForm, MicDocument, MicStatus, User } from '../../types';

const MIN_ROWS = 15;
const ITEM_STATUSES = ['Installed', 'Partial', 'Pending', 'Damaged'];
const ROW_DEFAULTS = {
  qtyReceived: 0, qtyInstalled: 0, serialNumbers: '',
  installDate: today(), status: 'Pending',
};

const COLUMNS: LineColumn[] = [
  { key: 'itemCode', label: 'Item Code', width: '12%' },
  { key: 'itemDescription', label: 'Item Description', width: '22%' },
  { key: 'unit', label: 'Unit', width: '7%' },
  {
    key: 'qtyReceived', label: 'Qty Received', type: 'readonly', width: '9%',
    hint: 'Quantity issued to you on an assignment form (ASN)',
  },
  {
    key: 'qtyInstalled', label: 'Qty Installed', type: 'number', width: '9%',
    // A line picked from stock cannot install more than was issued; a
    // hand-typed code carries no received figure and stays uncapped.
    max: row => (Number(row.qtyReceived) > 0 ? Number(row.qtyReceived) : undefined),
    warn: row => {
      const received = Number(row.qtyReceived) || 0;
      return received > 0 && (Number(row.qtyInstalled) || 0) > received
        ? `Exceeds quantity received (${received})`
        : undefined;
    },
  },
  {
    key: 'serialNumbers', label: 'Serial Number(s)', type: 'serial', qtyKey: 'qtyInstalled',
    width: '16%', hint: 'Auto-filled from the stock item — edit, or give one serial per unit installed',
  },
  { key: 'installDate', label: 'Install Date', type: 'date', width: '12%' },
  { key: 'status', label: 'Status', type: 'select', options: ITEM_STATUSES, width: '11%' },
];

/** What an item was issued on, and how much of it — keyed by inventory item id. */
interface IssuedEntry {
  qty: number;
  asnNos: string[];
}

/**
 * Reads the issued assignment forms back into a per-item view. A worker may only
 * confirm what was booked out to them; a manager raising the form on someone's
 * behalf sees everything that has been issued to anyone. Either way an item that
 * was never issued cannot be installed, so it is not offered.
 */
function issuedItems(forms: AssignmentForm[], onlyFor?: string): Map<string, IssuedEntry> {
  const byItem = new Map<string, IssuedEntry>();

  for (const form of forms) {
    if (form.status !== 'issued') continue;
    if (onlyFor && form.assignedToId !== onlyFor) continue;

    for (const line of form.items ?? []) {
      if (!line.itemId || !(line.qtyIssued > 0)) continue;

      const entry = byItem.get(line.itemId) ?? { qty: 0, asnNos: [] };
      entry.qty += line.qtyIssued;
      if (form.assignmentNo && !entry.asnNos.includes(form.assignmentNo)) {
        entry.asnNos.push(form.assignmentNo);
      }
      byItem.set(line.itemId, entry);
    }
  }

  return byItem;
}

export default function MicFormPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const close = () => { setOpenId(null); setCreating(false); };

  if (creating || openId) {
    return (
      <MicDocumentView
        key={openId ?? 'new'}
        id={openId ?? undefined}
        onClose={close}
        onCreated={id => { setCreating(false); setOpenId(id); }}
      />
    );
  }

  return <MicList onNew={() => setCreating(true)} onOpen={setOpenId} />;
}

// ── List view ──────────────────────────────────────────────────────────────
function MicList({ onNew, onOpen }: { onNew: () => void; onOpen: (id: string) => void }) {
  const { user } = useAuth();
  const { data: documents = [], isLoading } = useMicList();
  const list = documents as MicDocument[];

  const isManager = user?.role === 'admin' || user?.role === 'manager';
  const pendingCount = list.filter(doc => doc.status === 'pending_approval').length;

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>Material Installation (MIC)</h1>
          <p>Installation confirmations · {list.length} document{list.length === 1 ? '' : 's'}</p>
        </div>
        <button className="btn btn-primary" onClick={onNew}>
          <Plus size={14} /> New MIC
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
            {pendingCount} MIC form{pendingCount === 1 ? '' : 's'} pending your approval
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="empty-state"><span>Loading…</span></div>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <ClipboardCheck size={48} />
          <span>No installation confirmations yet</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Installation No.</th>
                <th>Date</th>
                <th>Site ID</th>
                <th>Project / Client</th>
                <th>Linked ASN</th>
                <th>Installed By</th>
                <th style={{ textAlign: 'center' }}>Items</th>
                <th style={{ textAlign: 'center' }}>Total Installed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map(doc => {
                const totalInstalled = doc.items.reduce((sum, i) => sum + (i.qtyInstalled || 0), 0);
                return (
                  <tr key={doc.id} onClick={() => onOpen(doc.id)} style={{ cursor: 'pointer' }}>
                    <td><strong style={{ color: 'var(--accent)' }}>{doc.micNo}</strong></td>
                    <td>{doc.date ? format(new Date(doc.date), 'dd MMM yyyy') : '—'}</td>
                    <td>{doc.siteId || '—'}</td>
                    <td style={{ color: 'var(--text-2)' }}>{doc.projectClient || '—'}</td>
                    <td style={{ color: 'var(--text-2)' }}>{doc.linkedAsnNo || '—'}</td>
                    <td style={{ color: 'var(--text-2)' }}>{fullName(doc.installedBy)}</td>
                    <td style={{ textAlign: 'center' }}>{doc.items.length}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{totalInstalled}</td>
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
  siteId: string;
  projectClient: string;
  installDepartment: string;
  verifiedById: string;
  purposeDescription: string;
  status: MicStatus;
}

const BLANK: FormState = {
  date: today(), siteId: '', projectClient: '',
  installDepartment: '', verifiedById: '', purposeDescription: '', status: 'draft',
};

const toFormState = (doc?: MicDocument): FormState => doc ? {
  date: toDateInput(doc.date),
  siteId: doc.siteId ?? '',
  projectClient: doc.projectClient ?? '',
  installDepartment: doc.installDepartment ?? '',
  verifiedById: doc.verifiedById ?? '',
  purposeDescription: doc.purposeDescription ?? '',
  status: doc.status ?? 'draft',
} : BLANK;

/** Waits for the document so the editor can seed its state without an effect. */
function MicDocumentView({ id, onClose, onCreated }: {
  id?: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { data: doc, isLoading } = useMic(id);

  if (id && isLoading) {
    return <div className="page"><div className="empty-state"><span>Loading…</span></div></div>;
  }

  return (
    <MicEditor
      key={id ?? 'new'}
      id={id}
      doc={doc as MicDocument | undefined}
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

const toVerdict = (doc?: MicDocument): Verdict | undefined =>
  doc && (doc.status === 'approved' || doc.status === 'rejected')
    ? { by: doc.approvedBy, reason: doc.rejectionReason }
    : undefined;

const READ_ONLY_INPUT = { background: 'var(--bg-3)', cursor: 'not-allowed' } as const;

function MicEditor({ id, doc, onClose, onCreated }: {
  id?: string;
  doc?: MicDocument;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { user } = useAuth();
  const { data: approvers = [] } = useApprovers();
  const { data: assignmentForms = [] } = useAssignmentForms();
  const createMic = useCreateMic();
  const updateMic = useUpdateMic();
  const reviewMic = useReviewMic();

  const [form, setForm] = useState<FormState>(() => toFormState(doc));
  const [rows, setRows] = useState<LineRow[]>(() => toLineRows(doc?.items, MIN_ROWS, ROW_DEFAULTS));
  const [verdict, setVerdict] = useState<Verdict | undefined>(() => toVerdict(doc));
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const isManager = user?.role === 'admin' || user?.role === 'manager';
  // Submitted work is frozen while someone is looking at it, and approved work
  // is the record of what happened on site. Only a rejection reopens it.
  const canEdit = form.status === 'draft' || form.status === 'rejected';

  const forms = assignmentForms as AssignmentForm[];
  const departments = uniqueSorted(forms.map(f => f.department));
  // Set on the server from the token, so a new document shows whoever is filling it in.
  const installedBy = doc?.installedBy ?? (user ?? undefined);

  // A manager may raise the form for any issued stock; a worker only for their own.
  const issued = issuedItems(forms, isManager ? undefined : user?.id);

  // The ASN link falls out of the items that were picked. Until something is
  // picked, a saved document keeps showing whatever it was filed against.
  const derivedAsnNo = uniqueSorted(
    rows.flatMap(row => (row.itemId ? issued.get(row.itemId)?.asnNos ?? [] : [])),
  ).join(', ');
  const linkedAsnNo = derivedAsnNo || doc?.linkedAsnNo || '';

  const save = async (status: Extract<MicStatus, 'draft' | 'pending_approval'>) => {
    const items = stripEmptyRows(rows).map(row => ({
      itemId: row.itemId,
      itemCode: row.itemCode,
      itemDescription: row.itemDescription,
      unit: row.unit,
      qtyReceived: Number(row.qtyReceived) || 0,
      qtyInstalled: Number(row.qtyInstalled) || 0,
      serialNumbers: row.serialNumbers ?? '',
      installDate: orUndefined(row.installDate),
      status: row.status || 'Pending',
    }));

    if (status === 'pending_approval' && !items.length) {
      toast.error('Add at least one line item before submitting for approval.');
      return;
    }

    const payload = {
      ...form,
      status,
      linkedAsnNo: orUndefined(linkedAsnNo),
      date: orUndefined(form.date),
      verifiedById: orUndefined(form.verifiedById),
      items,
    };

    if (id) {
      await updateMic.mutateAsync({ id, data: payload });
      set('status', status);
    } else {
      const created = await createMic.mutateAsync(payload);
      onCreated(created.id);
    }

    // Re-submitting clears the previous verdict on the server; drop it here too.
    if (status === 'pending_approval') {
      setVerdict(undefined);
      toast.success('Submitted for approval');
    } else {
      toast.success('Draft saved');
    }
  };

  const review = async (action: 'approve' | 'reject', reason?: string) => {
    if (!id) return;
    const updated: MicDocument = await reviewMic.mutateAsync({ id, action, rejectionReason: reason });
    set('status', updated.status);
    setVerdict(toVerdict(updated));
  };

  const saving = createMic.isPending || updateMic.isPending || reviewMic.isPending;

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

          {isManager && form.status === 'pending_approval' && (
            <>
              <button className="btn btn-success btn-sm" onClick={() => review('approve')} disabled={saving}>
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

      <div className="doc-paper print-doc">
        <DocumentHeader
          title="MATERIAL INSTALLATION CONFIRMATION"
          subtitle="SITE INSTALLATION & MATERIAL TRACKING"
          refLabel="MIC No."
          refNumber={doc?.micNo}
        />

        <div className="doc-grid">
          <Field label="Installation No.">
            <input
              className="doc-input"
              value={doc?.micNo ?? 'Auto-generated on save'}
              readOnly
              title="Generated when the form is first saved"
              style={READ_ONLY_INPUT}
            />
          </Field>
          <Field label="Date">
            <input type="date" className="doc-input" value={form.date} disabled={!canEdit}
              onChange={e => set('date', e.target.value)} />
          </Field>
          <Field label="Site ID">
            <input className="doc-input" placeholder="SITE-RUH-014" value={form.siteId} disabled={!canEdit}
              onChange={e => set('siteId', e.target.value)} />
          </Field>

          <Field label="Project / Client">
            <input className="doc-input" value={form.projectClient} disabled={!canEdit}
              onChange={e => set('projectClient', e.target.value)} />
          </Field>
          <Field label="Install Department">
            <input className="doc-input" list="mic-department-list" value={form.installDepartment}
              disabled={!canEdit} onChange={e => set('installDepartment', e.target.value)} />
            <datalist id="mic-department-list">
              {departments.map(d => <option key={d} value={d} />)}
            </datalist>
          </Field>
          <Field label="Installed By">
            <input
              className="doc-input"
              value={fullName(installedBy)}
              readOnly
              title="Taken from the signed-in user"
              style={READ_ONLY_INPUT}
            />
          </Field>

          <Field label="Verified / Assigned By">
            <select className="doc-input" value={form.verifiedById} disabled={!canEdit}
              onChange={e => set('verifiedById', e.target.value)}>
              <option value="">— Select Manager/Admin —</option>
              {(approvers as User[]).map(u => (
                <option key={u.id} value={u.id}>{fullName(u)} ({u.role})</option>
              ))}
            </select>
          </Field>
          <Field label="Linked Assignment (ASN)">
            <input
              className="doc-input"
              value={linkedAsnNo || '—'}
              readOnly
              title="Taken from the assignment the picked items were issued on"
              style={READ_ONLY_INPUT}
            />
          </Field>
        </div>

        <div style={{ marginBottom: 18 }}>
          <Field label="Purpose / Description">
            <textarea className="doc-input" rows={2} value={form.purposeDescription} disabled={!canEdit}
              onChange={e => set('purposeDescription', e.target.value)} />
          </Field>
        </div>

        <LineItemsTable
          rows={rows}
          onChange={setRows}
          columns={COLUMNS}
          source="inventory"
          minRows={MIN_ROWS}
          readOnly={!canEdit}
          newRowDefaults={ROW_DEFAULTS}
          totalKey="qtyInstalled"
          totalLabel="Total Quantity Installed"
          // Only issued stock is offered, and picking it fills in how much was
          // issued and the serial the warehouse recorded against it.
          stockField="qtyReceived"
          serialField="serialNumbers"
          resolveStock={item => issued.get(item.id)?.qty ?? 0}
        />

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
          labels={['Installed By (Worker)', 'Verified By (Site Supervisor)', 'Approved By (Warehouse / Store)']}
        />
      </div>

      <Modal
        isOpen={rejecting}
        onClose={() => setRejecting(false)}
        title="Reject MIC Form"
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
              Reject Form
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
            placeholder="Explain why this MIC is being rejected…"
          />
        </div>
      </Modal>
    </div>
  );
}
