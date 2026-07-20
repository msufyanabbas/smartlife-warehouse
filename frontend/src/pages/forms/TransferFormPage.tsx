import { useState } from 'react';
import { ArrowLeft, ArrowLeftRight, Plus, Printer, Save } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  useCreateTransferForm, useInventory, useTransferForm, useTransferForms,
  useUpdateTransferForm, useUsers,
} from '../../hooks/useApi';
import DocumentHeader from '../../components/documents/DocumentHeader';
import DocumentStatusBadge from '../../components/documents/DocumentStatusBadge';
import SignatureFooter from '../../components/documents/SignatureFooter';
import Field from '../../components/documents/Field';
import LineItemsTable from '../../components/documents/LineItemsTable';
import {
  stripEmptyRows, toLineRows, type LineColumn, type LineRow,
} from '../../components/documents/lineRows';
import { fullName, orUndefined, toDateInput, today, uniqueSorted } from '../../components/documents/formUtils';
import { useDocumentStock } from '../../hooks/useDocumentStock';
import type { TransferForm, User } from '../../types';

const MIN_ROWS = 15;
const ROW_DEFAULTS = { stockQty: 0, qtyToTransfer: 0 };

const COLUMNS: LineColumn[] = [
  { key: 'itemCode', label: 'Item Code', width: '13%' },
  { key: 'itemDescription', label: 'Item Description', width: '28%' },
  { key: 'unit', label: 'Unit', width: '8%' },
  {
    key: 'stockQty', label: 'Stock Qty (From)', type: 'readonly', width: '11%',
    hint: 'Based on GRN receipts minus ASN assignments',
  },
  {
    key: 'qtyToTransfer', label: 'Qty to Transfer', type: 'number', width: '11%',
    // Binds at zero for a picked line, the same way the assignment form's Qty
    // Issued does; free-text codes carry no stock figure and stay uncapped.
    max: row => (row.itemId ? Number(row.stockQty) || 0 : undefined),
    warn: row => {
      if (!row.itemId) return undefined;
      const available = Number(row.stockQty) || 0;
      return (Number(row.qtyToTransfer) || 0) > available
        ? `Exceeds available stock (${available})`
        : undefined;
    },
  },
  {
    key: 'serialNumber', label: 'Serial Number(s)', type: 'serial', qtyKey: 'qtyToTransfer',
    width: '17%', hint: 'Serial Number(s) — enter one for the line, or one per unit transferred',
  },
];

export default function TransferFormPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const close = () => { setOpenId(null); setCreating(false); };

  if (creating || openId) {
    return (
      <TransferDocumentView
        key={openId ?? 'new'}
        id={openId ?? undefined}
        onClose={close}
        onCreated={id => { setCreating(false); setOpenId(id); }}
      />
    );
  }

  return <TransferFormList onNew={() => setCreating(true)} onOpen={setOpenId} />;
}

// ── List view ──────────────────────────────────────────────────────────────
function TransferFormList({ onNew, onOpen }: { onNew: () => void; onOpen: (id: string) => void }) {
  const { data: documents = [], isLoading } = useTransferForms();
  const list = documents as TransferForm[];

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>Stock Transfer</h1>
          <p>Inter-location / inter-project transfers · {list.length} document{list.length === 1 ? '' : 's'}</p>
        </div>
        <button className="btn btn-primary" onClick={onNew}>
          <Plus size={14} /> New Transfer
        </button>
      </div>

      {isLoading ? (
        <div className="empty-state"><span>Loading…</span></div>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <ArrowLeftRight size={48} />
          <span>No transfer forms yet</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Transfer No.</th>
                <th>Date</th>
                <th>From</th>
                <th>To</th>
                <th>Reason</th>
                <th style={{ textAlign: 'center' }}>Total Qty</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map(doc => {
                const totalQty = doc.items.reduce((sum, i) => sum + (i.qtyToTransfer || 0), 0);
                return (
                  <tr key={doc.id} onClick={() => onOpen(doc.id)} style={{ cursor: 'pointer' }}>
                    <td><strong style={{ color: 'var(--accent)' }}>{doc.transferNo}</strong></td>
                    <td>{doc.transferDate ? format(new Date(doc.transferDate), 'dd MMM yyyy') : '—'}</td>
                    <td style={{ color: 'var(--text-2)' }}>
                      {[doc.fromWarehouse, doc.fromProjectSite].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td style={{ color: 'var(--text-2)' }}>
                      {[doc.toWarehouse, doc.toProjectSite].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td style={{ color: 'var(--text-2)' }}>{doc.reasonForTransfer || '—'}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{totalQty}</td>
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
  fromWarehouse: string;
  fromProjectSite: string;
  issuedById: string;
  transferDate: string;
  toWarehouse: string;
  toProjectSite: string;
  receivedById: string;
  reasonForTransfer: string;
  approvedById: string;
  notes: string;
  status: TransferForm['status'];
}

const BLANK: FormState = {
  fromWarehouse: '', fromProjectSite: '', issuedById: '', transferDate: today(),
  toWarehouse: '', toProjectSite: '', receivedById: '', reasonForTransfer: '',
  approvedById: '', notes: '', status: 'draft',
};

const toFormState = (doc?: TransferForm): FormState => doc ? {
  fromWarehouse: doc.fromWarehouse ?? '',
  fromProjectSite: doc.fromProjectSite ?? '',
  issuedById: doc.issuedById ?? '',
  transferDate: toDateInput(doc.transferDate),
  toWarehouse: doc.toWarehouse ?? '',
  toProjectSite: doc.toProjectSite ?? '',
  receivedById: doc.receivedById ?? '',
  reasonForTransfer: doc.reasonForTransfer ?? '',
  approvedById: doc.approvedById ?? '',
  notes: doc.notes ?? '',
  status: doc.status ?? 'draft',
} : BLANK;

/** Waits for the document so the editor can seed its state without an effect. */
function TransferDocumentView({ id, onClose, onCreated }: {
  id?: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { data: doc, isLoading } = useTransferForm(id);

  if (id && isLoading) {
    return <div className="page"><div className="empty-state"><span>Loading…</span></div></div>;
  }

  return (
    <TransferEditor
      key={id ?? 'new'}
      id={id}
      doc={doc as TransferForm | undefined}
      onClose={onClose}
      onCreated={onCreated}
    />
  );
}

function TransferEditor({ id, doc, onClose, onCreated }: {
  id?: string;
  doc?: TransferForm;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { data: users = [] } = useUsers();
  const { data: inventory = [] } = useInventory();
  const { resolveStock } = useDocumentStock();
  const createForm = useCreateTransferForm();
  const updateForm = useUpdateTransferForm();

  const [form, setForm] = useState<FormState>(() => toFormState(doc));
  const [rows, setRows] = useState<LineRow[]>(() => toLineRows(doc?.items, MIN_ROWS, ROW_DEFAULTS));

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const stock = inventory as any[];
  const sites = uniqueSorted(stock.flatMap(i => [i.projectName, i.schemeNo]));
  const approvers = (users as User[]).filter(u => u.role === 'admin' || u.role === 'manager');

  // "Stock at the From location" — matched against either project or scheme.
  const filterStock = (item: { projectName?: string; schemeNo?: string }) =>
    !form.fromProjectSite ||
    item.projectName === form.fromProjectSite ||
    item.schemeNo === form.fromProjectSite;

  const save = async (status: TransferForm['status']) => {
    const payload = {
      ...form,
      status,
      transferDate: orUndefined(form.transferDate),
      issuedById: orUndefined(form.issuedById),
      receivedById: orUndefined(form.receivedById),
      approvedById: orUndefined(form.approvedById),
      items: stripEmptyRows(rows),
    };

    if (id) {
      await updateForm.mutateAsync({ id, data: payload });
      set('status', status);
    } else {
      const created = await createForm.mutateAsync(payload);
      onCreated(created.id);
    }

    if (status === 'completed') {
      const count = payload.items.filter(i => Number(i.qtyToTransfer) > 0).length;
      const dest = [form.toWarehouse, form.toProjectSite].filter(Boolean).join(' · ') || 'the destination';
      toast.success(`Transfer completed — ${count} item${count === 1 ? '' : 's'} moved to ${dest}`);
    } else {
      toast.success(status === 'approved' ? 'Transfer approved' : 'Draft saved');
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
          <button className="btn btn-ghost btn-sm" onClick={() => save('draft')} disabled={saving}>
            <Save size={14} /> Save Draft
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => save('approved')} disabled={saving}>
            <Save size={14} /> Approve
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => save('completed')} disabled={saving}>
            <Save size={14} /> Save &amp; Complete
          </button>
        </div>
      </div>

      <div className="doc-paper print-doc">
        <DocumentHeader
          title="STOCK TRANSFER"
          refLabel="Transfer No."
          refNumber={doc?.transferNo}
        />

        <div className="doc-grid-2" style={{ marginBottom: 18 }}>
          <div className="doc-panel">
            <div className="doc-panel-title">Transfer From</div>
            <div style={{ display: 'grid', gap: 10 }}>
              <Field label="From Warehouse / Store">
                <input className="doc-input" value={form.fromWarehouse}
                  onChange={e => set('fromWarehouse', e.target.value)} />
              </Field>
              <Field label="From Project / Site">
                <select className="doc-input" value={form.fromProjectSite}
                  onChange={e => set('fromProjectSite', e.target.value)}>
                  <option value="">— All locations —</option>
                  {sites.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Issued By">
                <select className="doc-input" value={form.issuedById}
                  onChange={e => set('issuedById', e.target.value)}>
                  <option value="">— Select —</option>
                  {(users as User[]).map(u => <option key={u.id} value={u.id}>{fullName(u)}</option>)}
                </select>
              </Field>
              <Field label="Transfer Date">
                <input type="date" className="doc-input" value={form.transferDate}
                  onChange={e => set('transferDate', e.target.value)} />
              </Field>
            </div>
          </div>

          <div className="doc-panel">
            <div className="doc-panel-title">Transfer To</div>
            <div style={{ display: 'grid', gap: 10 }}>
              <Field label="To Warehouse / Store">
                <input className="doc-input" value={form.toWarehouse}
                  onChange={e => set('toWarehouse', e.target.value)} />
              </Field>
              <Field label="To Project / Site">
                <input className="doc-input" value={form.toProjectSite}
                  onChange={e => set('toProjectSite', e.target.value)} />
              </Field>
              <Field label="Received By">
                <select className="doc-input" value={form.receivedById}
                  onChange={e => set('receivedById', e.target.value)}>
                  <option value="">— Select —</option>
                  {(users as User[]).map(u => <option key={u.id} value={u.id}>{fullName(u)}</option>)}
                </select>
              </Field>
              <Field label="Reason for Transfer">
                <input className="doc-input" value={form.reasonForTransfer}
                  onChange={e => set('reasonForTransfer', e.target.value)} />
              </Field>
              <Field label="Approved By">
                <select className="doc-input" value={form.approvedById}
                  onChange={e => set('approvedById', e.target.value)}>
                  <option value="">— Select —</option>
                  {approvers.map(u => <option key={u.id} value={u.id}>{fullName(u)} · {u.role}</option>)}
                </select>
              </Field>
            </div>
          </div>
        </div>

        <LineItemsTable
          rows={rows}
          onChange={setRows}
          columns={COLUMNS}
          source="inventory"
          filterStock={filterStock}
          stockField="stockQty"
          resolveStock={resolveStock}
          minRows={MIN_ROWS}
          newRowDefaults={ROW_DEFAULTS}
          totalKey="qtyToTransfer"
          totalLabel="Total Quantity Transferred"
        />

        <div style={{ marginTop: 18 }}>
          <Field label="Notes / Remarks">
            <textarea className="doc-input" rows={3} value={form.notes}
              onChange={e => set('notes', e.target.value)} />
          </Field>
        </div>

        <SignatureFooter labels={['Issued By (Store)', 'Approved By', 'Received By (Store)']} />
      </div>
    </div>
  );
}
