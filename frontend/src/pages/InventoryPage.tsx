import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Plus, Search, Package, Edit2, Trash2, PlusCircle, Upload, Download, ShoppingCart } from 'lucide-react';
import { useInventory, useCreateItem, useUpdateItem, useAddStock, useDeleteItem, useBulkImportInventory, useCreateItemRequest } from '../hooks/useApi';
import { useAuth } from '../contexts/AuthContext';
import type { InventoryItem } from '../types';
import Modal from '../components/Modal';

const CATEGORIES = ['Tools', 'Safety Equipment', 'Electronics', 'Hardware', 'Consumables', 'Machinery', 'Office', 'Other'];
const CONDITIONS = ['new', 'good', 'fair', 'poor'];

function conditionBadge(c: string) {
  const map: any = { new: 'badge-green', good: 'badge-blue', fair: 'badge-yellow', poor: 'badge-red' };
  return <span className={`badge ${map[c] || 'badge-gray'}`}>{c}</span>;
}

// ─── Form defined OUTSIDE to prevent remount/focus loss ───────────────────────
interface ItemFormProps {
  form: any;
  onChange: (f: any) => void;
  showSku?: boolean;
}

function ItemForm({ form, onChange, showSku = false }: ItemFormProps) {
  return (
    <>
      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">Item Name *</label>
          <input className="form-input" value={form.name || ''}
            onChange={e => onChange({ ...form, name: e.target.value })}
            placeholder="e.g. Safety Helmet" />
        </div>
        {showSku ? (
          <div className="form-group">
            <label className="form-label">SKU *</label>
            <input className="form-input" value={form.sku || ''}
              onChange={e => onChange({ ...form, sku: e.target.value })}
              placeholder="e.g. SH-001" />
          </div>
        ) : (
          <div className="form-group">
            <label className="form-label">Category</label>
            <select className="form-input" value={form.category || ''}
              onChange={e => onChange({ ...form, category: e.target.value })}>
              <option value="">Select category</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">Scheme No. *</label>
          <input className="form-input" value={form.schemeNo || ''}
            onChange={e => onChange({ ...form, schemeNo: e.target.value })}
            placeholder="e.g. SCH-2024-01" />
        </div>
        <div className="form-group">
          <label className="form-label">Project Name *</label>
          <input className="form-input" value={form.projectName || ''}
            onChange={e => onChange({ ...form, projectName: e.target.value })}
            placeholder="e.g. Al Riyadh Bridge" />
        </div>
      </div>

      {showSku && (
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">Category</label>
            <select className="form-input" value={form.category || ''}
              onChange={e => onChange({ ...form, category: e.target.value })}>
              <option value="">Select category</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Initial Quantity *</label>
            <input type="number" min={1} className="form-input" value={form.totalQuantity || 1}
              onChange={e => onChange({ ...form, totalQuantity: +e.target.value })} />
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">Brand</label>
          <input className="form-input" value={form.brand || ''}
            onChange={e => onChange({ ...form, brand: e.target.value })}
            placeholder="Brand" />
        </div>
        <div className="form-group">
          <label className="form-label">Model</label>
          <input className="form-input" value={form.model || ''}
            onChange={e => onChange({ ...form, model: e.target.value })}
            placeholder="Model" />
        </div>
      </div>

      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">Condition</label>
          <select className="form-input" value={form.condition || 'new'}
            onChange={e => onChange({ ...form, condition: e.target.value })}>
            {CONDITIONS.map(c => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Storage Location</label>
          <input className="form-input" value={form.location || ''}
            onChange={e => onChange({ ...form, location: e.target.value })}
            placeholder="e.g. Shelf A-3" />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea className="form-input" rows={2} value={form.description || ''}
          onChange={e => onChange({ ...form, description: e.target.value })}
          placeholder="Optional description" />
      </div>
    </>
  );
}

// ─── Request Form ─────────────────────────────────────────────────────────────
interface RequestFormProps {
  quantity: number;
  reason: string;
  maxQty: number;
  onQuantityChange: (q: number) => void;
  onReasonChange: (r: string) => void;
}

function RequestForm({ quantity, reason, maxQty, onQuantityChange, onReasonChange }: RequestFormProps) {
  return (
    <>
      <div className="form-group">
        <label className="form-label">
          Quantity *
          <span style={{ color: 'var(--text-3)', marginLeft: 8 }}>
            max available: {maxQty}
          </span>
        </label>
        <input type="number" min={1} max={maxQty} className="form-input"
          value={quantity} onChange={e => onQuantityChange(+e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">Reason (optional)</label>
        <textarea className="form-input" rows={3} value={reason}
          onChange={e => onReasonChange(e.target.value)}
          placeholder="Why do you need these items? e.g. Running low on site, new task started…" />
      </div>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function InventoryPage() {
  const { user } = useAuth();
  const { data: items = [], isLoading } = useInventory();
  const createItem = useCreateItem();
  const updateItem = useUpdateItem();
  const addStock = useAddStock();
  const deleteItem = useDeleteItem();
  const bulkImport = useBulkImportInventory();
  const createItemRequest = useCreateItemRequest();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isManager = user?.role === 'admin' || user?.role === 'manager';
  const isWorker = user?.role === 'worker';

  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [conditionFilter, setConditionFilter] = useState('');
  const [schemeFilter, setSchemeFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [stockFilter, setStockFilter] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [stockItem, setStockItem] = useState<InventoryItem | null>(null);
  const [requestItem, setRequestItem] = useState<InventoryItem | null>(null);
  const [stockQty, setStockQty] = useState(1);
  const [requestQty, setRequestQty] = useState(1);
  const [requestReason, setRequestReason] = useState('');
  const [showImportResult, setShowImportResult] = useState<any>(null);
  const [createForm, setCreateForm] = useState<any>({ condition: 'new', totalQuantity: 1 });
  const [editForm, setEditForm] = useState<any>({});

  const allItems = items as InventoryItem[];
  const uniqueSchemes = [...new Set(allItems.map(i => i.schemeNo).filter(Boolean))];
  const uniqueProjects = [...new Set(allItems.map(i => i.projectName).filter(Boolean))];

  const filtered = allItems.filter(i => {
    const q = search.toLowerCase();
    const matchSearch = !q || i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q) ||
      i.schemeNo?.toLowerCase().includes(q) || i.projectName?.toLowerCase().includes(q) ||
      i.category?.toLowerCase().includes(q);
    const matchCat = !catFilter || i.category === catFilter;
    const matchCond = !conditionFilter || i.condition === conditionFilter;
    const matchScheme = !schemeFilter || i.schemeNo === schemeFilter;
    const matchProject = !projectFilter || i.projectName === projectFilter;
    const matchStock = !stockFilter ||
      (stockFilter === 'available' && i.availableQuantity > 0) ||
      (stockFilter === 'out' && i.availableQuantity === 0) ||
      (stockFilter === 'low' && i.availableQuantity > 0 && i.availableQuantity <= 3);
    return matchSearch && matchCat && matchCond && matchScheme && matchProject && matchStock;
  });

  const activeFilters = [catFilter, conditionFilter, schemeFilter, projectFilter, stockFilter].filter(Boolean).length;

  const openEdit = (item: InventoryItem) => {
    setEditForm({
      name: item.name, description: item.description, schemeNo: item.schemeNo,
      projectName: item.projectName, category: item.category, brand: item.brand,
      model: item.model, location: item.location, condition: item.condition, notes: item.notes,
    });
    setEditItem(item);
  };

  const handleCreate = async () => {
    await createItem.mutateAsync(createForm);
    setShowCreate(false);
    setCreateForm({ condition: 'new', totalQuantity: 1 });
  };

  const handleUpdate = async () => {
    if (!editItem) return;
    await updateItem.mutateAsync({ id: editItem.id, data: editForm });
    setEditItem(null);
  };

  const handleAddStock = async () => {
    if (!stockItem) return;
    await addStock.mutateAsync({ id: stockItem.id, quantity: stockQty });
    setStockItem(null);
    setStockQty(1);
  };

  const handleRequestItems = async () => {
    if (!requestItem) return;
    await createItemRequest.mutateAsync({
      itemId: requestItem.id,
      quantity: requestQty,
      reason: requestReason,
    });
    setRequestItem(null);
    setRequestQty(1);
    setRequestReason('');
  };


  const exportToExcel = () => {
    const rows = filtered.map(i => ({
      Name: i.name, SKU: i.sku, SchemeNo: i.schemeNo, Project: i.projectName,
      Category: i.category || '', Brand: i.brand || '', Model: i.model || '',
      Condition: i.condition, Total: i.totalQuantity, Available: i.availableQuantity,
      Assigned: i.assignedQuantity, Used: (i as any).usedQuantity || 0, Location: i.location || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0] || {}).map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
    XLSX.writeFile(wb, `inventory-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const downloadTemplate = () => {
    const headers = [
      ['name*', 'sku*', 'schemeNo*', 'projectName*', 'totalQuantity*',
       'category', 'brand', 'model', 'condition', 'location', 'description', 'notes'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(headers);
    ws['!cols'] = headers[0].map(() => ({ wch: 20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
    XLSX.writeFile(wb, 'inventory-import-template.xlsx');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws);
        const importItems = rows.map((row: any) => ({
          name: String(row['name*'] || row['name'] || '').trim(),
          sku: String(row['sku*'] || row['sku'] || '').trim(),
          schemeNo: String(row['schemeNo*'] || row['schemeNo'] || '').trim(),
          projectName: String(row['projectName*'] || row['projectName'] || '').trim(),
          totalQuantity: parseInt(row['totalQuantity*'] || row['totalQuantity'] || '0', 10),
          category: String(row['category'] || '').trim() || undefined,
          brand: String(row['brand'] || '').trim() || undefined,
          model: String(row['model'] || '').trim() || undefined,
          condition: String(row['condition'] || 'new').trim() || 'new',
          location: String(row['location'] || '').trim() || undefined,
          description: String(row['description'] || '').trim() || undefined,
          notes: String(row['notes'] || '').trim() || undefined,
        })).filter(i => i.name && i.sku && i.schemeNo && i.projectName);

        if (importItems.length === 0) {
          alert('No valid rows found. Make sure required columns are filled in.');
          return;
        }
        const result = await bulkImport.mutateAsync(importItems);
        setShowImportResult(result);
      } catch {
        alert('Failed to parse Excel file. Please use the template provided.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>Inventory</h1>
          <p>{allItems.length} items · {filtered.length} shown</p>
        </div>
        {isManager && (
          <div className="flex gap-2">
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls"
              style={{ display: 'none' }} onChange={handleFileUpload} />
            <button className="btn btn-ghost" onClick={exportToExcel}>
              <Download size={14} /> Export Excel
            </button>
            <button className="btn btn-ghost" onClick={downloadTemplate}>
              <Download size={14} /> Template
            </button>
            <button className="btn btn-ghost" onClick={() => fileInputRef.current?.click()}
              disabled={bulkImport.isPending}>
              <Upload size={14} /> {bulkImport.isPending ? 'Importing…' : 'Import Excel'}
            </button>
            <button className="btn btn-primary" onClick={() => {
              setCreateForm({ condition: 'new', totalQuantity: 1 });
              setShowCreate(true);
            }}>
              <Plus size={15} /> Add Item
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 20 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Filters {activeFilters > 0 && <span className="badge badge-blue" style={{ marginLeft: 6 }}>{activeFilters}</span>}
          </span>
          {activeFilters > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => {
              setCatFilter(''); setConditionFilter(''); setSchemeFilter('');
              setProjectFilter(''); setStockFilter(''); setSearch('');
            }}>Clear all</button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
          <div className="search-bar" style={{ gridColumn: '1 / -1' }}>
            <Search size={14} />
            <input placeholder="Search name, SKU, scheme, project…" value={search}
              onChange={e => setSearch(e.target.value)} style={{ width: '100%' }} />
          </div>
          <select className="form-input" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="form-input" value={conditionFilter} onChange={e => setConditionFilter(e.target.value)}>
            <option value="">All Conditions</option>
            {CONDITIONS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
          <select className="form-input" value={schemeFilter} onChange={e => setSchemeFilter(e.target.value)}>
            <option value="">All Schemes</option>
            {uniqueSchemes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="form-input" value={projectFilter} onChange={e => setProjectFilter(e.target.value)}>
            <option value="">All Projects</option>
            {uniqueProjects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="form-input" value={stockFilter} onChange={e => setStockFilter(e.target.value)}>
            <option value="">All Stock Levels</option>
            <option value="available">In Stock</option>
            <option value="low">Low Stock (≤3)</option>
            <option value="out">Out of Stock</option>
          </select>
        </div>
      </div>

      {/* Worker info banner */}
      {isWorker && (
        <div style={{
          background: 'var(--accent-dim)', border: '1px solid rgba(79,124,255,0.2)',
          borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: 16,
          fontSize: 13, color: 'var(--accent)',
        }}>
          Need an item? Click <strong>Request</strong> on any available item and your manager will review it.
        </div>
      )}

      {isLoading ? (
        <div className="empty-state"><Package size={40} /><span>Loading inventory…</span></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><Package size={40} /><span>No items found</span></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>SKU</th>
                <th>Scheme No.</th>
                <th>Project</th>
                <th>Category</th>
                <th>Condition</th>
                <th>Total</th>
                <th>Available</th>
                {!isWorker && <th>Assigned</th>}
                {!isWorker && <th>Used</th>}
                <th>Location</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{item.name}</div>
                    {item.brand && (
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{item.brand} {item.model}</div>
                    )}
                  </td>
                  <td>
                    <code style={{ fontSize: 11, color: 'var(--text-2)', background: 'var(--bg-4)', padding: '2px 6px', borderRadius: 4 }}>
                      {item.sku}
                    </code>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{item.schemeNo || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{item.projectName || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{item.category || '—'}</td>
                  <td>{conditionBadge(item.condition)}</td>
                  <td style={{ fontWeight: 600 }}>{item.totalQuantity}</td>
                  <td>
                    <span style={{
                      color: item.availableQuantity === 0 ? 'var(--red)'
                        : item.availableQuantity <= 3 ? 'var(--yellow)' : 'var(--green)',
                      fontWeight: 600,
                    }}>
                      {item.availableQuantity}
                    </span>
                  </td>
                  {!isWorker && <td style={{ color: 'var(--text-2)' }}>{item.assignedQuantity}</td>}
                  {!isWorker && <td style={{ color: 'var(--purple)', fontWeight: 500 }}>{item.usedQuantity || 0}</td>}
                  <td style={{ color: 'var(--text-2)', fontSize: 12 }}>{item.location || '—'}</td>
                  <td>
                    <div className="flex gap-2">
                      {/* Worker: Request button */}
                      {isWorker && (
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={item.availableQuantity === 0}
                          title={item.availableQuantity === 0 ? 'Out of stock' : 'Request this item'}
                          onClick={() => {
                            setRequestItem(item);
                            setRequestQty(1);
                            setRequestReason('');
                          }}
                        >
                          <ShoppingCart size={13} />
                          {item.availableQuantity === 0 ? 'Out of Stock' : 'Request'}
                        </button>
                      )}
                      {/* Manager/Admin actions */}
                      {isManager && (
                        <>
                          <button className="btn btn-ghost btn-sm btn-icon" title="Add stock"
                            onClick={() => { setStockItem(item); setStockQty(1); }}>
                            <PlusCircle size={14} />
                          </button>
                          <button className="btn btn-ghost btn-sm btn-icon" title="Edit"
                            onClick={() => openEdit(item)}>
                            <Edit2 size={14} />
                          </button>
                          {user?.role === 'admin' && (
                            <button className="btn btn-danger btn-sm btn-icon" title="Remove"
                              onClick={() => { if (confirm('Remove this item?')) deleteItem.mutate(item.id); }}>
                              <Trash2 size={14} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Add Inventory Item" maxWidth={600}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate}
            disabled={createItem.isPending || !createForm.name || !createForm.sku || !createForm.schemeNo || !createForm.projectName}>
            {createItem.isPending ? 'Adding…' : 'Add Item'}
          </button>
        </>}>
        <ItemForm form={createForm} onChange={setCreateForm} showSku />
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={!!editItem} onClose={() => setEditItem(null)} title="Edit Item" maxWidth={600}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setEditItem(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleUpdate} disabled={updateItem.isPending}>
            {updateItem.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </>}>
        <ItemForm form={editForm} onChange={setEditForm} />
      </Modal>

      {/* Add Stock Modal */}
      <Modal isOpen={!!stockItem} onClose={() => setStockItem(null)}
        title={`Add Stock — ${stockItem?.name}`} maxWidth={380}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setStockItem(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleAddStock} disabled={addStock.isPending}>
            {addStock.isPending ? 'Adding…' : 'Add Stock'}
          </button>
        </>}>
        <div className="form-group">
          <label className="form-label">
            Current available: <strong style={{ color: 'var(--text)' }}>{stockItem?.availableQuantity}</strong>
          </label>
          <label className="form-label" style={{ marginTop: 12 }}>Quantity to add</label>
          <input type="number" min={1} className="form-input" value={stockQty}
            onChange={e => setStockQty(+e.target.value)} />
        </div>
      </Modal>

      {/* Request Items Modal (Worker) */}
      <Modal isOpen={!!requestItem} onClose={() => setRequestItem(null)}
        title={`Request Items — ${requestItem?.name}`} maxWidth={440}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setRequestItem(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleRequestItems}
            disabled={createItemRequest.isPending || requestQty < 1 || requestQty > (requestItem?.availableQuantity || 0)}>
            {createItemRequest.isPending ? 'Submitting…' : 'Submit Request'}
          </button>
        </>}>
        {requestItem && (
          <>
            <div style={{ background: 'var(--bg-3)', borderRadius: 'var(--radius)', padding: '12px 16px' }}>
              <div style={{ fontWeight: 500 }}>{requestItem.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4, display: 'flex', gap: 16 }}>
                <span>SKU: <strong style={{ color: 'var(--text)' }}>{requestItem.sku}</strong></span>
                <span>Available: <strong style={{ color: 'var(--green)' }}>{requestItem.availableQuantity}</strong></span>
                {requestItem.schemeNo && <span>Scheme: <strong style={{ color: 'var(--text)' }}>{requestItem.schemeNo}</strong></span>}
              </div>
            </div>
            <div style={{
              background: 'var(--accent-dim)', border: '1px solid rgba(79,124,255,0.15)',
              borderRadius: 'var(--radius)', padding: '10px 14px',
              fontSize: 12, color: 'var(--accent)',
            }}>
              Your request will be sent to your manager for approval. Once approved, the items will be assigned to you automatically.
            </div>
            <RequestForm
              quantity={requestQty}
              reason={requestReason}
              maxQty={requestItem.availableQuantity}
              onQuantityChange={setRequestQty}
              onReasonChange={setRequestReason}
            />
          </>
        )}
      </Modal>

      {/* Import Result Modal */}
      <Modal isOpen={!!showImportResult} onClose={() => setShowImportResult(null)}
        title="Import Results" maxWidth={420}
        footer={<button className="btn btn-primary" onClick={() => setShowImportResult(null)}>Done</button>}>
        {showImportResult && (
          <>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, background: 'var(--green-dim)', borderRadius: 'var(--radius)', padding: '14px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--green)' }}>{showImportResult.created}</div>
                <div style={{ fontSize: 12, color: 'var(--green)' }}>Items Imported</div>
              </div>
              <div style={{ flex: 1, background: 'var(--yellow-dim)', borderRadius: 'var(--radius)', padding: '14px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--yellow)' }}>{showImportResult.skipped}</div>
                <div style={{ fontSize: 12, color: 'var(--yellow)' }}>Skipped (duplicate SKU)</div>
              </div>
            </div>
            {showImportResult.errors?.length > 0 && (
              <div style={{ background: 'var(--red-dim)', borderRadius: 'var(--radius)', padding: '12px 14px', fontSize: 12, color: 'var(--red)' }}>
                {showImportResult.errors.slice(0, 5).map((e: string, i: number) => (
                  <div key={i}>· {e}</div>
                ))}
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}