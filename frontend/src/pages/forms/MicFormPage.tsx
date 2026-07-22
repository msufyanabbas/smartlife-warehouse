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
  splitSerials, stripEmptyRows, toLineRows,
  type LineColumn, type LineRow,
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
    hint: 'Quantity issued on the linked assignment form',
  },
  {
    key: 'qtyInstalled', label: 'Qty Installed', type: 'number', width: '9%',
    // A line pre-filled from an assignment cannot install more than was issued;
    // a hand-entered line carries no received figure and stays uncapped.
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
    width: '16%', hint: 'Serial Number(s) — enter one for the line, or one per unit installed',
  },
  { key: 'installDate', label: 'Install Date', type: 'date', width: '12%' },
  { key: 'status', label: 'Status', type: 'select', options: ITEM_STATUSES, width: '11%' },
];

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
                <th>MIC No.</th>
                <th>Date</th>
                <th>Site ID</th>
                <th>Project / Client</th>
                <th>Assignment No.</th>
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
                    <td style={{ color: 'var(--text-2)' }}>{doc.assignmentNo || '—'}</td>
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
  assignmentNo: string;
  date: string;
  siteId: string;
  projectClient: string;
  installDepartment: string;
  verifiedById: string;
  purposeDescription: string;
  status: MicStatus;
}

const BLANK: FormState = {
  assignmentNo: '', date: today(), siteId: '', projectClient: '',
  installDepartment: '', verifiedById: '', purposeDescription: '', status: 'draft',
};

const toFormState = (doc?: MicDocument): FormState => doc ? {
  assignmentNo: doc.assignmentNo ?? '',
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

  /**
   * The MIC confirms what an assignment put on site, so picking the ASN carries
   * its lines across: codes, units and the issued quantity become the "received"
   * figure to install against. Only the installed quantities are left to fill in.
   */
  const applyAssignment = (assignmentNo: string) => {
    set('assignmentNo', assignmentNo);

    const source = forms.find(f => f.assignmentNo === assignmentNo);
    if (!source) return;

    const filled = rows.some(row => row.itemCode.trim() || row.itemDescription.trim());
    if (filled && !window.confirm('Replace the current line items with the items from this assignment?')) {
      return;
    }

    const prefilled = (source.items ?? []).map(line => ({
      itemId: line.itemId,
      itemCode: line.itemCode,
      itemDescription: line.itemDescription,
      unit: line.unit,
      qtyReceived: line.qtyIssued || 0,
      qtyInstalled: 0,
      serialNumbers: splitSerials(line.serialNumber).join(', '),
      installDate: today(),
      status: 'Pending',
    }));

    setRows(toLineRows(prefilled, MIN_ROWS, ROW_DEFAULTS));

    // The assignment already knows where its items went; don't make the worker
    // retype it, but never overwrite something they have already entered.
    setForm(prev => ({
      ...prev,
      assignmentNo,
      siteId: prev.siteId || source.projectSite || '',
      projectClient: prev.projectClient || source.projectSite || '',
      installDepartment: prev.installDepartment || source.department || '',
    }));
  };

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
          <Field label="Assignment No.">
            <select className="doc-input" value={form.assignmentNo} disabled={!canEdit}
              onChange={e => applyAssignment(e.target.value)}>
              <option value="">— Select —</option>
              {forms.map(f => (
                <option key={f.id} value={f.assignmentNo}>
                  {f.assignmentNo}{f.projectSite ? ` · ${f.projectSite}` : ''}
                </option>
              ))}
            </select>
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
              style={{ background: 'var(--bg-3)', cursor: 'not-allowed' }}
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
