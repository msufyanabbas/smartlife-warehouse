import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Plus, Search, Trash2, Package, ChevronDown, CheckCircle, Download, Filter } from 'lucide-react';
import {
  useInventory, useCreateItem, useAddStock, useDeleteItem,
  useProductSearch, useProducts, useCategoriesFlat,
} from '../hooks/useApi';
import { useAuth } from '../contexts/AuthContext';
import Modal from '../components/Modal';

interface Product {
  id: string; name: string; sku: string; description?: string;
  brand?: string; model?: string; unit?: string; categoryId?: string;
  category?: { id: string; name: string; parent?: { name: string } };
}

interface InventoryItem {
  id: string; name: string; sku: string; schemeNo: string; projectName: string;
  description?: string; category?: string; brand?: string; model?: string;
  totalQuantity: number; availableQuantity: number; assignedQuantity: number;
  usedQuantity: number; condition: string; location?: string; notes?: string;
  productId?: string; isActive: boolean;
}

interface Category { id: string; name: string; parentId?: string; parent?: { name: string }; }

// ── Product autocomplete row ───────────────────────────────────────────────
function ProductRow({ row, index, onUpdate, onRemove, usedProductIds }: {
  row: any; index: number;
  onUpdate: (i: number, f: string, v: any) => void;
  onRemove: (i: number) => void;
  usedProductIds: string[];
}) {
  const [query, setQuery] = useState(row.productName || '');
  const [open, setOpen] = useState(false);
  const { data: suggestions = [] } = useProductSearch(query);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = (suggestions as Product[]).filter(
    p => !usedProductIds.includes(p.id) || p.id === row.productId
  );

  const select = (p: Product) => {
    setQuery(p.name); setOpen(false);
    onUpdate(index, 'productId', p.id);
    onUpdate(index, 'productName', p.name);
    onUpdate(index, 'sku', p.sku);
    onUpdate(index, 'description', p.description || '');
    onUpdate(index, 'brand', p.brand || '');
    onUpdate(index, 'model', p.model || '');
    const cat = p.category?.parent ? `${p.category.parent.name} › ${p.category.name}` : p.category?.name || '';
    onUpdate(index, 'category', cat);
    onUpdate(index, 'unit', p.unit || '');
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
      <td style={{ ...tdStyle, minWidth: 200 }}>
        <div ref={ref} style={{ position: 'relative' }}>
          <div style={{ position: 'relative' }}>
            <input className="form-input" style={{ paddingRight: row.productId ? 28 : 10, fontSize: 13 }}
              value={query}
              onChange={e => { setQuery(e.target.value); if (!e.target.value) { onUpdate(index, 'productId', ''); onUpdate(index, 'productName', ''); onUpdate(index, 'sku', ''); onUpdate(index, 'category', ''); } setOpen(true); }}
              onFocus={() => query && setOpen(true)}
              placeholder="Type to search product…"
            />
            {row.productId && <CheckCircle size={13} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--green)' }} />}
          </div>
          {open && filtered.length > 0 && (
            <div style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 999, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
              {filtered.map(p => (
                <div key={p.id} onMouseDown={() => select(p)}
                  style={{ padding: '9px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-dim)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
                    {p.sku}{p.category ? ` · ${p.category.parent ? p.category.parent.name + ' › ' : ''}${p.category.name}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
          {open && query.length >= 1 && filtered.length === 0 && (
            <div style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 999, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: 'var(--text-3)' }}>
              No products found — <a href="/products" style={{ color: 'var(--accent)' }}>Add to catalog →</a>
            </div>
          )}
        </div>
      </td>
      <td style={{ ...tdStyle, width: 100 }}>
        <input className="form-input" style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--accent)' }} value={row.sku} onChange={e => onUpdate(index, 'sku', e.target.value)} placeholder="SKU" readOnly={!!row.productId} />
      </td>
      <td style={{ ...tdStyle, width: 130 }}>
        <input className="form-input" style={{ fontSize: 12, color: 'var(--text-2)' }} value={row.category} onChange={e => onUpdate(index, 'category', e.target.value)} placeholder="Category" readOnly={!!row.productId} />
      </td>
      <td style={{ ...tdStyle, width: 70 }}>
        <input className="form-input" type="number" min="1" style={{ fontSize: 13, textAlign: 'center' }} value={row.quantity} onChange={e => onUpdate(index, 'quantity', parseInt(e.target.value) || 1)} />
      </td>
      <td style={{ ...tdStyle, width: 95 }}>
        <select className="form-input" style={{ fontSize: 12 }} value={row.condition} onChange={e => onUpdate(index, 'condition', e.target.value)}>
          {['new', 'good', 'fair', 'poor'].map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
      </td>
      <td style={{ ...tdStyle, width: 90 }}>
        <input className="form-input" style={{ fontSize: 12 }} value={row.location} onChange={e => onUpdate(index, 'location', e.target.value)} placeholder="A-3" />
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

const newRow = () => ({ productId: '', productName: '', sku: '', description: '', brand: '', model: '', category: '', unit: '', quantity: 1, condition: 'new', location: '', notes: '' });

const thStyle: React.CSSProperties = { padding: '8px 10px', fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap', background: 'var(--bg-3)' };

export default function InventoryPage() {
  const { user } = useAuth();
  const { data: items = [], isLoading, refetch } = useInventory();
  const createItem = useCreateItem();
  const addStock = useAddStock();
  const deleteItem = useDeleteItem();
  const { data: categories = [] } = useCategoriesFlat();

  const isManager = user?.role === 'admin' || user?.role === 'manager';

  // Filters
  const [search, setSearch] = useState('');
  const [schemeFilter, setSchemeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [conditionFilter, setConditionFilter] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modals
  const [showAddScheme, setShowAddScheme] = useState(false);
  const [stockTarget, setStockTarget] = useState<InventoryItem | null>(null);
  const [stockQty, setStockQty] = useState('1');
  const [expandedSchemes, setExpandedSchemes] = useState<Set<string>>(new Set());

  // Add scheme form
  const [schemeNo, setSchemeNo] = useState('');
  const [projectName, setProjectName] = useState('');
  const [rows, setRows] = useState([newRow()]);

  const list = items as InventoryItem[];
  const cats = categories as Category[];

  // Unique scheme numbers for filter dropdown
  const schemeOptions = useMemo(() => [...new Set(list.map(i => i.schemeNo).filter(Boolean))].sort(), [list]);
  const categoryOptions = useMemo(() => [...new Set(list.map(i => i.category).filter(Boolean))].sort(), [list]);

  // Apply all filters
  const filtered = useMemo(() => list.filter(i => {
    const q = search.toLowerCase();
    const matchSearch = !q || i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q) || i.schemeNo?.toLowerCase().includes(q) || i.projectName?.toLowerCase().includes(q);
    const matchScheme = !schemeFilter || i.schemeNo === schemeFilter;
    const matchCat = !categoryFilter || i.category === categoryFilter;
    const matchCond = !conditionFilter || i.condition === conditionFilter;
    const matchStock = !stockFilter ||
      (stockFilter === 'in' && i.availableQuantity > 0) ||
      (stockFilter === 'out' && i.availableQuantity === 0) ||
      (stockFilter === 'low' && i.availableQuantity > 0 && i.availableQuantity <= 3);
    return matchSearch && matchScheme && matchCat && matchCond && matchStock;
  }), [list, search, schemeFilter, categoryFilter, conditionFilter, stockFilter]);

  // Group filtered items by scheme
  const grouped = useMemo(() => {
    const map = new Map<string, InventoryItem[]>();
    filtered.forEach(item => {
      const key = `${item.schemeNo || '—'}||${item.projectName || '—'}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    });
    return Array.from(map.entries()).map(([key, items]) => {
      const [sNo, pName] = key.split('||');
      return { schemeNo: sNo, projectName: pName, items };
    });
  }, [filtered]);

  const toggleScheme = (key: string) => {
    setExpandedSchemes(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };

  const toggleSelectItem = (id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const toggleSelectScheme = (items: InventoryItem[]) => {
    const allSelected = items.every(i => selectedIds.has(i.id));
    setSelectedIds(prev => {
      const n = new Set(prev);
      items.forEach(i => allSelected ? n.delete(i.id) : n.add(i.id));
      return n;
    });
  };

  const usedProductIds = rows.map(r => r.productId).filter(Boolean);
  const updateRow = useCallback((i: number, f: string, v: any) => setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [f]: v } : r)), []);
  const removeRow = useCallback((i: number) => setRows(prev => prev.filter((_, idx) => idx !== i)), []);

  const handleSubmitScheme = async () => {
    const validRows = rows.filter(r => r.sku && r.quantity > 0);
    if (!schemeNo || !projectName) { alert('Scheme No. and Project Name are required'); return; }
    if (validRows.length === 0) { alert('Add at least one product row with a SKU'); return; }
    for (const row of validRows) {
      await createItem.mutateAsync({ productId: row.productId || undefined, name: row.productName || row.sku, sku: row.sku, description: row.description || undefined, category: row.category || undefined, brand: row.brand || undefined, model: row.model || undefined, schemeNo, projectName, totalQuantity: row.quantity, condition: row.condition, location: row.location || undefined, notes: row.notes || undefined });
    }
    setShowAddScheme(false);
    refetch();
  };

  // Excel export
  const exportExcel = () => {
    const exportItems = selectedIds.size > 0 ? filtered.filter(i => selectedIds.has(i.id)) : filtered;
    const data = exportItems.map(i => ({
      'Name': i.name, 'SKU': i.sku, 'Scheme No.': i.schemeNo || '', 'Project': i.projectName || '',
      'Category': i.category || '', 'Brand': i.brand || '', 'Condition': i.condition,
      'Total Qty': i.totalQuantity, 'Available': i.availableQuantity,
      'Assigned': i.assignedQuantity, 'Used': i.usedQuantity,
      'Location': i.location || '', 'Notes': i.notes || '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
    XLSX.writeFile(wb, `inventory-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const clearFilters = () => { setSearch(''); setSchemeFilter(''); setCategoryFilter(''); setConditionFilter(''); setStockFilter(''); };
  const hasFilters = search || schemeFilter || categoryFilter || conditionFilter || stockFilter;

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>Inventory</h1>
          <p>{list.length} items · {grouped.length} scheme{grouped.length !== 1 ? 's' : ''}{selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ''}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={exportExcel}>
            <Download size={14} /> Export{selectedIds.size > 0 ? ` (${selectedIds.size})` : ' All'}
          </button>
          {isManager && (
            <button className="btn btn-primary" onClick={() => { setSchemeNo(''); setProjectName(''); setRows([newRow()]); setShowAddScheme(true); }}>
              <Plus size={15} /> Add Inventory
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
          <div className="search-bar">
            <Search size={14} />
            <input placeholder="Search name, SKU, scheme, project…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="form-input" value={schemeFilter} onChange={e => setSchemeFilter(e.target.value)}>
            <option value="">All Schemes</option>
            {schemeOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="form-input" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="">All Categories</option>
            {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="form-input" value={conditionFilter} onChange={e => setConditionFilter(e.target.value)}>
            <option value="">All Conditions</option>
            {['new', 'good', 'fair', 'poor'].map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
          <select className="form-input" value={stockFilter} onChange={e => setStockFilter(e.target.value)}>
            <option value="">All Stock</option>
            <option value="in">In Stock</option>
            <option value="low">Low (≤3)</option>
            <option value="out">Out of Stock</option>
          </select>
          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters} title="Clear filters">
              <Filter size={13} /> Clear
            </button>
          )}
        </div>
        {hasFilters && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-3)' }}>
            Showing <strong style={{ color: 'var(--text)' }}>{filtered.length}</strong> of {list.length} items
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="empty-state"><Package size={40} /><span>Loading…</span></div>
      ) : grouped.length === 0 ? (
        <div className="empty-state">
          <Package size={48} style={{ color: 'var(--text-3)' }} />
          <span>{hasFilters ? 'No items match your filters' : 'No inventory items yet'}</span>
          {!hasFilters && <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 8 }}>Click "Add Inventory" to start adding items by scheme</p>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {grouped.map(({ schemeNo: sNo, projectName: pName, items: groupItems }) => {
            const key = `${sNo}||${pName}`;
            const expanded = expandedSchemes.has(key);
            const totalQty = groupItems.reduce((s, i) => s + i.totalQuantity, 0);
            const availQty = groupItems.reduce((s, i) => s + i.availableQuantity, 0);
            const ap = totalQty > 0 ? availQty / totalQty : 0;
            const stockColor = ap === 0 ? 'var(--red)' : ap < 0.3 ? 'var(--yellow)' : 'var(--green)';
            const allSchemeSelected = groupItems.every(i => selectedIds.has(i.id));
            const someSchemeSelected = groupItems.some(i => selectedIds.has(i.id));

            return (
              <div key={key} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Scheme header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', borderBottom: expanded ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}
                  onClick={() => toggleScheme(key)}>
                  <input type="checkbox" checked={allSchemeSelected} ref={el => { if (el) el.indeterminate = someSchemeSelected && !allSchemeSelected; }}
                    onChange={e => { e.stopPropagation(); toggleSelectScheme(groupItems); }}
                    onClick={e => e.stopPropagation()}
                    style={{ cursor: 'pointer' }} />
                  <ChevronDown size={15} style={{ color: 'var(--text-3)', flexShrink: 0, transform: expanded ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{sNo}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 10 }}>{pName}</span>
                  </div>
                  <span className="badge badge-blue">{groupItems.length} item{groupItems.length !== 1 ? 's' : ''}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: stockColor }}>{availQty}/{totalQty}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>available</span>
                </div>

                {expanded && (
                  <div className="table-wrap" style={{ margin: 0, borderRadius: 0 }}>
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: 36, textAlign: 'center' }}></th>
                          <th>Product</th>
                          <th>SKU</th>
                          <th>Category</th>
                          <th style={{ textAlign: 'center' }}>Total</th>
                          <th style={{ textAlign: 'center' }}>Avail.</th>
                          <th style={{ textAlign: 'center' }}>Assigned</th>
                          <th style={{ textAlign: 'center' }}>Used</th>
                          <th>Condition</th>
                          <th>Location</th>
                          {isManager && <th>Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {groupItems.map(item => {
                          const ap2 = item.totalQuantity > 0 ? item.availableQuantity / item.totalQuantity : 0;
                          const ac = ap2 === 0 ? 'var(--red)' : ap2 < 0.3 ? 'var(--yellow)' : 'var(--green)';
                          return (
                            <tr key={item.id} style={{ background: selectedIds.has(item.id) ? 'var(--accent-dim)' : undefined }}>
                              <td style={{ textAlign: 'center' }}>
                                <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelectItem(item.id)} style={{ cursor: 'pointer' }} />
                              </td>
                              <td>
                                <div style={{ fontWeight: 500 }}>{item.name}</div>
                                {item.description && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{item.description}</div>}
                              </td>
                              <td><code style={{ fontSize: 11, background: 'var(--bg-3)', padding: '2px 6px', borderRadius: 4, color: 'var(--accent)' }}>{item.sku}</code></td>
                              <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{item.category || '—'}</td>
                              <td style={{ textAlign: 'center', fontWeight: 600 }}>{item.totalQuantity}</td>
                              <td style={{ textAlign: 'center', fontWeight: 700, color: ac }}>{item.availableQuantity}</td>
                              <td style={{ textAlign: 'center', color: 'var(--yellow)' }}>{item.assignedQuantity}</td>
                              <td style={{ textAlign: 'center', color: 'var(--purple)' }}>{item.usedQuantity}</td>
                              <td><span className={`badge badge-${item.condition === 'new' ? 'green' : item.condition === 'good' ? 'blue' : item.condition === 'fair' ? 'yellow' : 'red'}`}>{item.condition}</span></td>
                              <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{item.location || '—'}</td>
                              {isManager && (
                                <td>
                                  <div className="flex gap-2">
                                    <button className="btn btn-ghost btn-sm" onClick={() => { setStockTarget(item); setStockQty('1'); }}>+ Stock</button>
                                    {user?.role === 'admin' && (
                                      <button className="btn btn-danger btn-sm btn-icon" onClick={() => { if (confirm(`Remove "${item.name}"?`)) deleteItem.mutate(item.id); }}>
                                        <Trash2 size={13} />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Inventory Modal */}
      <Modal isOpen={showAddScheme} onClose={() => setShowAddScheme(false)} title="Add Inventory" size="xl"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setShowAddScheme(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmitScheme} disabled={createItem.isPending || !schemeNo || !projectName}>
            {createItem.isPending ? 'Saving…' : `Add ${rows.filter(r => r.sku).length || 0} Item(s)`}
          </button>
        </>}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label className="form-label">Scheme No. *</label>
            <input className="form-input" value={schemeNo} onChange={e => setSchemeNo(e.target.value)} placeholder="e.g. SCH-2024-001" autoFocus />
          </div>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label className="form-label">Project Name *</label>
            <input className="form-input" value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="e.g. Riyadh Metro Phase 2" />
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--accent)', background: 'var(--accent-dim)', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
          💡 Type a product name to search from your catalog. SKU and category fill automatically.
        </div>
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>#</th>
                <th style={thStyle}>Product Name</th>
                <th style={thStyle}>SKU</th>
                <th style={thStyle}>Category</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Qty</th>
                <th style={thStyle}>Condition</th>
                <th style={thStyle}>Location</th>
                <th style={thStyle}>Notes</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <ProductRow key={idx} row={row} index={idx} onUpdate={updateRow} onRemove={removeRow} usedProductIds={usedProductIds} />
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn btn-ghost" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }} onClick={() => setRows(prev => [...prev, newRow()])}>
          <Plus size={14} /> Add Another Product
        </button>
      </Modal>

      {/* Add Stock Modal */}
      <Modal isOpen={!!stockTarget} onClose={() => setStockTarget(null)} title={`Add Stock — ${stockTarget?.name}`}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setStockTarget(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={async () => { if (!stockTarget) return; await addStock.mutateAsync({ id: stockTarget.id, quantity: parseInt(stockQty) }); setStockTarget(null); }} disabled={addStock.isPending}>
            {addStock.isPending ? 'Adding…' : 'Add Stock'}
          </button>
        </>}>
        {stockTarget && (
          <>
            <div style={{ background: 'var(--bg-3)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <div style={{ fontWeight: 600 }}>{stockTarget.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                SKU: {stockTarget.sku} · Current: <strong style={{ color: 'var(--text)' }}>{stockTarget.totalQuantity}</strong> total · <strong style={{ color: 'var(--green)' }}>{stockTarget.availableQuantity}</strong> available
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Quantity to Add</label>
              <input type="number" min="1" className="form-input" value={stockQty} onChange={e => setStockQty(e.target.value)} autoFocus />
            </div>
            {parseInt(stockQty) > 0 && (
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                New total: <strong style={{ color: 'var(--green)' }}>{stockTarget.totalQuantity + parseInt(stockQty)}</strong>
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}