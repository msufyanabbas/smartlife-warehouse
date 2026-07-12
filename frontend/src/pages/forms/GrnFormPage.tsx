import { useState } from 'react';
import { ArrowLeft, FileText, Plus, Printer, Save } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  useCreateGrn, useGrn, useGrnList, useInventory, useUpdateGrn, useUsers,
} from '../../hooks/useApi';
import DocumentHeader from '../../components/documents/DocumentHeader';
import DocumentStatusBadge from '../../components/documents/DocumentStatusBadge';
import SignatureFooter from '../../components/documents/SignatureFooter';
import LineItemsTable from '../../components/documents/LineItemsTable';
import {
  stripEmptyRows, toLineRows, type LineColumn, type LineRow,
} from '../../components/documents/lineRows';
import Field from '../../components/documents/Field';
import { fullName, orUndefined, toDateInput, today, uniqueSorted } from '../../components/documents/formUtils';
import type { GrnDocument, User } from '../../types';

const MIN_ROWS = 15;
const ROW_DEFAULTS = { orderedQty: 0, receivedQty: 0 };

const COLUMNS: LineColumn[] = [
  { key: 'itemCode', label: 'Item Code (SKU)', width: '13%' },
  { key: 'itemDescription', label: 'Item Description', width: '30%' },
  { key: 'unit', label: 'Unit of Measure', width: '11%' },
  { key: 'orderedQty', label: 'Ordered Qty', type: 'number', width: '10%' },
  { key: 'receivedQty', label: 'Received Qty', type: 'number', width: '10%' },
  {
    key: 'serialNumber', label: 'Serial Number(s)', type: 'serial', qtyKey: 'receivedQty',
    width: '18%', hint: 'Serial Number(s) — enter one for the line, or one per unit received',
  },
];

export default function GrnFormPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const close = () => { setOpenId(null); setCreating(false); };

  if (creating || openId) {
    return (
      <GrnDocumentView
        key={openId ?? 'new'}
        id={openId ?? undefined}
        onClose={close}
        onCreated={id => { setCreating(false); setOpenId(id); }}
      />
    );
  }

  return <GrnList onNew={() => setCreating(true)} onOpen={setOpenId} />;
}

// ── List view ──────────────────────────────────────────────────────────────
function GrnList({ onNew, onOpen }: { onNew: () => void; onOpen: (id: string) => void }) {
  const { data: documents = [], isLoading } = useGrnList();
  const list = documents as GrnDocument[];

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>Stock Receiving (GRN)</h1>
          <p>Goods Receipt Notes · {list.length} document{list.length === 1 ? '' : 's'}</p>
        </div>
        <button className="btn btn-primary" onClick={onNew}>
          <Plus size={14} /> New GRN
        </button>
      </div>

      {isLoading ? (
        <div className="empty-state"><span>Loading…</span></div>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <FileText size={48} />
          <span>No goods receipt notes yet</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>GRN No.</th>
                <th>Date of Receipt</th>
                <th>Supplier</th>
                <th>Project / Scheme</th>
                <th style={{ textAlign: 'center' }}>Items</th>
                <th style={{ textAlign: 'center' }}>Total Received</th>
                <th>Condition</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map(doc => {
                const totalReceived = doc.items.reduce((sum, i) => sum + (i.receivedQty || 0), 0);
                return (
                  <tr key={doc.id} onClick={() => onOpen(doc.id)} style={{ cursor: 'pointer' }}>
                    <td><strong style={{ color: 'var(--accent)' }}>{doc.grnNo}</strong></td>
                    <td>{doc.dateOfReceipt ? format(new Date(doc.dateOfReceipt), 'dd MMM yyyy') : '—'}</td>
                    <td>{doc.supplierName || '—'}</td>
                    <td style={{ color: 'var(--text-2)' }}>
                      {[doc.projectName, doc.schemeNo].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>{doc.items.length}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{totalReceived}</td>
                    <td style={{ color: 'var(--text-2)' }}>{doc.conditionOnArrival}</td>
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
  supplierName: string;
  purchaseOrderNo: string;
  dateOfReceipt: string;
  deliveryNoteNo: string;
  location: string;
  receivedById: string;
  projectName: string;
  schemeNo: string;
  conditionOnArrival: GrnDocument['conditionOnArrival'];
  notes: string;
  status: GrnDocument['status'];
}

const BLANK: FormState = {
  supplierName: '', purchaseOrderNo: '', dateOfReceipt: today(), deliveryNoteNo: '',
  location: '', receivedById: '', projectName: '', schemeNo: '',
  conditionOnArrival: 'Good', notes: '', status: 'draft',
};

const toFormState = (doc?: GrnDocument): FormState => doc ? {
  supplierName: doc.supplierName ?? '',
  purchaseOrderNo: doc.purchaseOrderNo ?? '',
  dateOfReceipt: toDateInput(doc.dateOfReceipt),
  deliveryNoteNo: doc.deliveryNoteNo ?? '',
  location: doc.location ?? '',
  receivedById: doc.receivedById ?? '',
  projectName: doc.projectName ?? '',
  schemeNo: doc.schemeNo ?? '',
  conditionOnArrival: doc.conditionOnArrival ?? 'Good',
  notes: doc.notes ?? '',
  status: doc.status ?? 'draft',
} : BLANK;

/** Waits for the document so the editor can seed its state without an effect. */
function GrnDocumentView({ id, onClose, onCreated }: {
  id?: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { data: doc, isLoading } = useGrn(id);

  if (id && isLoading) {
    return <div className="page"><div className="empty-state"><span>Loading…</span></div></div>;
  }

  return (
    <GrnEditor
      key={id ?? 'new'}
      id={id}
      doc={doc as GrnDocument | undefined}
      onClose={onClose}
      onCreated={onCreated}
    />
  );
}

function GrnEditor({ id, doc, onClose, onCreated }: {
  id?: string;
  doc?: GrnDocument;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { data: users = [] } = useUsers();
  const { data: inventory = [] } = useInventory();
  const createGrn = useCreateGrn();
  const updateGrn = useUpdateGrn();

  const [form, setForm] = useState<FormState>(() => toFormState(doc));
  const [rows, setRows] = useState<LineRow[]>(() => toLineRows(doc?.items, MIN_ROWS, ROW_DEFAULTS));

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const schemes = uniqueSorted((inventory as any[]).map(i => i.schemeNo));
  const projects = uniqueSorted((inventory as any[]).map(i => i.projectName));
  const purchaseOrders = uniqueSorted((inventory as any[]).map(i => i.purchaseOrder));

  const save = async (status: GrnDocument['status']) => {
    if (status === 'completed' && form.status !== 'completed') {
      const ok = window.confirm('Completing this GRN will create or top up the matching inventory items. Continue?');
      if (!ok) return;
    }

    const payload = {
      ...form,
      status,
      dateOfReceipt: orUndefined(form.dateOfReceipt),
      receivedById: orUndefined(form.receivedById),
      items: stripEmptyRows(rows),
    };

    if (id) {
      await updateGrn.mutateAsync({ id, data: payload });
      set('status', status);
    } else {
      const created = await createGrn.mutateAsync(payload);
      onCreated(created.id);
    }

    if (status === 'completed') {
      const count = payload.items.filter(i => Number(i.receivedQty) > 0).length;
      toast.success(`GRN completed — ${count} inventory item${count === 1 ? '' : 's'} have been created/updated`);
    } else {
      toast.success('Draft saved');
    }
  };

  const saving = createGrn.isPending || updateGrn.isPending;

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
          <button className="btn btn-primary btn-sm" onClick={() => save('completed')} disabled={saving}>
            <Save size={14} /> Save &amp; Complete
          </button>
        </div>
      </div>

      <div className="doc-paper print-doc">
        <DocumentHeader title="STOCK RECEIVING" refLabel="GRN No." refNumber={doc?.grnNo} />

        <div className="doc-grid">
          <Field label="Supplier Name">
            <input className="doc-input" value={form.supplierName}
              onChange={e => set('supplierName', e.target.value)} />
          </Field>
          <Field label="Purchase Order No.">
            <input className="doc-input" list="grn-po-list" value={form.purchaseOrderNo}
              onChange={e => set('purchaseOrderNo', e.target.value)} />
            <datalist id="grn-po-list">
              {purchaseOrders.map(po => <option key={po} value={po} />)}
            </datalist>
          </Field>
          <Field label="Date of Receipt">
            <input type="date" className="doc-input" value={form.dateOfReceipt}
              onChange={e => set('dateOfReceipt', e.target.value)} />
          </Field>

          <Field label="Delivery Note No.">
            <input className="doc-input" value={form.deliveryNoteNo}
              onChange={e => set('deliveryNoteNo', e.target.value)} />
          </Field>
          <Field label="Warehouse / Location">
            <input className="doc-input" value={form.location}
              onChange={e => set('location', e.target.value)} />
          </Field>
          <Field label="Received By">
            <select className="doc-input" value={form.receivedById}
              onChange={e => set('receivedById', e.target.value)}>
              <option value="">— Select —</option>
              {(users as User[]).map(u => (
                <option key={u.id} value={u.id}>{fullName(u)}</option>
              ))}
            </select>
          </Field>

          <Field label="Project Name">
            <input className="doc-input" list="grn-project-list" value={form.projectName}
              onChange={e => set('projectName', e.target.value)} />
            <datalist id="grn-project-list">
              {projects.map(p => <option key={p} value={p} />)}
            </datalist>
          </Field>
          <Field label="Scheme Number">
            <input className="doc-input" list="grn-scheme-list" value={form.schemeNo}
              onChange={e => set('schemeNo', e.target.value)} />
            <datalist id="grn-scheme-list">
              {schemes.map(s => <option key={s} value={s} />)}
            </datalist>
          </Field>
          <Field label="Condition on Arrival">
            <select className="doc-input" value={form.conditionOnArrival}
              onChange={e => set('conditionOnArrival', e.target.value as FormState['conditionOnArrival'])}>
              {['Good', 'Damaged', 'Partial', 'Rejected'].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>

        <LineItemsTable
          rows={rows}
          onChange={setRows}
          columns={COLUMNS}
          source="products"
          minRows={MIN_ROWS}
          newRowDefaults={ROW_DEFAULTS}
          totalKey="receivedQty"
          totalLabel="Total Quantity Received"
        />

        <div style={{ marginTop: 18 }}>
          <Field label="Notes / Remarks">
            <textarea className="doc-input" rows={3} value={form.notes}
              onChange={e => set('notes', e.target.value)} />
          </Field>
        </div>

        <SignatureFooter labels={['Store Keeper', 'Warehouse Manager']} />
      </div>
    </div>
  );
}
