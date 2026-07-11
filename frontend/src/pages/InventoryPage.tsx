import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Plus, Search, Trash2, Package, ChevronDown, CheckCircle, Download, Filter, X, Edit2 } from 'lucide-react';
import { format } from 'date-fns';
import {
  useInventory, useCreateItem, useAddStock, useRemoveStock, useDeleteItem, useUpdateItem,
  useProductSearch, useCategoriesFlat,
} from '../hooks/useApi';
import { useAuth } from '../contexts/AuthContext';
import Modal from '../components/Modal';
import FloatingDropdown from '../components/FloatingDropdown';

interface Product {
  id: string; name: string; sku: string; description?: string;
  brand?: string; model?: string; unit?: string; categoryId?: string;
  category?: { id: string; name: string; parent?: { name: string } };
}

interface InventoryItem {
  id: string; name: string; sku: string; schemeNo: string; projectName: string;
  description?: string; category?: string; brand?: string; model?: string;
  serialNumber?: string; purchaseOrder?: string;
  totalQuantity: number; availableQuantity: number; assignedQuantity: number;
  usedQuantity: number; condition: string; location?: string; notes?: string;
  productId?: string; isActive: boolean;
  receivedAt?: string; createdAt: string;
}

interface Category { id: string; name: string; parentId?: string; parent?: { name: string }; }

// ── Product autocomplete input ─────────────────────────────────────────────
function ProductAutocomplete({ row, index, onUpdate, usedProductIds }: {
  row: any; index: number;
  onUpdate: (i: number, f: string, v: any) => void;
  usedProductIds: string[];
}) {
  const [query, setQuery] = useState(row.productName || '');
  const [open, setOpen] = useState(false);
  const { data: suggestions = [] } = useProductSearch(query);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    const cat = p.category?.parent
      ? `${p.category.parent.name} › ${p.category.name}`
      : p.category?.name || '';
    onUpdate(index, 'category', cat);
    onUpdate(index, 'unit', p.unit || '');
  };

  const clear = () => {
    setQuery(''); setOpen(false);
    onUpdate(index, 'productId', '');
    onUpdate(index, 'productName', '');
    onUpdate(index, 'sku', '');
    onUpdate(index, 'category', '');
  };

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          ref={inputRef}
          className="form-input"
          style={{ fontSize: 13, paddingRight: row.productId ? 52 : 28 }}
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            if (!e.target.value) clear();
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Type to search product…"
        />
        <div style={{ position: 'absolute', right: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
          {row.productId && <CheckCircle size={14} style={{ color: 'var(--green)' }} />}
          {query && (
            <button type="button" onClick={clear}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 1, display: 'flex' }}>
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <FloatingDropdown anchorRef={inputRef} visible={open && query.length >= 1}>
        {filtered.length > 0 ? filtered.map(p => (
          <div key={p.id}
            onMouseDown={() => select(p)}
            style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-dim)')}
            onMouseLeave={e => (e.currentTarget.style.background = '')}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{p.name}</div>
            <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
              <span>SKU: <code style={{ color: 'var(--accent)' }}>{p.sku}</code></span>
              {p.category && <span>{p.category.parent ? `${p.category.parent.name} › ` : ''}{p.category.name}</span>}
              {p.brand && <span>{p.brand}</span>}
            </div>
          </div>
        )) : (
          <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-3)' }}>
            No products found —{' '}
            <a href="/products" style={{ color: 'var(--accent)' }}>Add to catalog →</a>
          </div>
        )}
      </FloatingDropdown>
    </div>
  );
}

// ── Category autocomplete input ───────────────────────────────────────────
function CategoryAutocomplete({ value, onChange, categories, readOnly }: {
  value: string;
  onChange: (v: string) => void;
  categories: Category[];
  readOnly?: boolean;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  const label = (c: Category) => c.parent ? `${c.parent.name} › ${c.name}` : c.name;

  const filtered = categories.filter(c =>
    !query || label(c).toLowerCase().includes(query.toLowerCase())
  ).slice(0, 12);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  if (readOnly) {
    return (
      <input className="form-input"
        style={{ fontSize: 12, color: 'var(--text-2)', background: 'var(--bg-4)', cursor: 'not-allowed' }}
        value={value} readOnly />
    );
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        className="form-input"
        style={{ fontSize: 12 }}
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Type to search…"
      />
      <FloatingDropdown anchorRef={inputRef} visible={open && filtered.length > 0}>
        {filtered.map(c => (
          <div key={c.id}
            onMouseDown={() => { setQuery(label(c)); onChange(label(c)); setOpen(false); }}
            style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--border)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-dim)')}
            onMouseLeave={e => (e.currentTarget.style.background = '')}>
            {c.parent && <span style={{ color: 'var(--text-3)', fontSize: 11 }}>{c.parent.name} › </span>}
            <span style={{ fontWeight: 500 }}>{c.name}</span>
          </div>
        ))}
      </FloatingDropdown>
    </div>
  );
}

const subLabel: React.CSSProperties = {
  display: 'block', fontSize: 10, color: 'var(--text-3)', fontWeight: 600,
  marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em',
};

// ── Product row in Add Inventory table — two rows per product ─────────────
function ProductRow({ row, index, onUpdate, onRemove, usedProductIds, categories }: {
  row: any; index: number;
  onUpdate: (i: number, f: string, v: any) => void;
  onRemove: (i: number) => void;
  usedProductIds: string[];
  categories: Category[];
}) {
  const td: React.CSSProperties = { padding: '6px 8px', verticalAlign: 'top' };
  const cellTop = '2px solid var(--border)';
  const rowBg = index % 2 === 0 ? 'var(--bg-2)' : 'var(--bg-3)';

  return (
    <>
      {/* Row 1 — primary fields */}
      <tr style={{ background: rowBg }}>
        <td rowSpan={2} style={{ ...td, width: 28, textAlign: 'center', color: 'var(--text-3)', fontSize: 12, verticalAlign: 'middle', borderTop: cellTop }}>
          {index + 1}
        </td>

        {/* Product search — most important field, gets the most space */}
        <td style={{ ...td, minWidth: 200, borderTop: cellTop }}>
          <ProductAutocomplete row={row} index={index} onUpdate={onUpdate} usedProductIds={usedProductIds} />
        </td>

        {/* SKU - auto-filled, readonly when product selected */}
        <td style={{ ...td, width: 90, borderTop: cellTop }}>
          <input className="form-input"
            style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--accent)', background: row.productId ? 'var(--bg-4)' : undefined }}
            value={row.sku} onChange={e => onUpdate(index, 'sku', e.target.value)}
            placeholder="SKU" readOnly={!!row.productId} />
        </td>

        {/* Category - auto-filled or searchable */}
        <td style={{ ...td, width: 110, borderTop: cellTop }}>
          <CategoryAutocomplete
            value={row.category}
            onChange={v => onUpdate(index, 'category', v)}
            categories={categories}
            readOnly={!!row.productId}
          />
        </td>

        {/* Remove */}
        <td rowSpan={2} style={{ ...td, width: 32, textAlign: 'center', verticalAlign: 'middle', borderTop: cellTop }}>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }} onClick={() => onRemove(index)}>
            <Trash2 size={13} />
          </button>
        </td>
      </tr>

      {/* Row 2 — secondary fields, indented + lighter background */}
      <tr style={{ background: 'var(--bg-3)' }}>
        <td colSpan={3} style={{ ...td, paddingLeft: 14, paddingBottom: 10 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 110 }}>
              <label style={subLabel}>Condition</label>
              <select className="form-input" style={{ fontSize: 12 }} value={row.condition} onChange={e => onUpdate(index, 'condition', e.target.value)}>
                {['new', 'good', 'fair', 'poor'].map(c => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
            <div style={{ minWidth: 100 }}>
              <label style={subLabel}>Location</label>
              <input className="form-input" style={{ fontSize: 12 }} value={row.location} onChange={e => onUpdate(index, 'location', e.target.value)} placeholder="A-3" />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={subLabel}>Notes</label>
              <input className="form-input" style={{ fontSize: 12 }} value={row.notes} onChange={e => onUpdate(index, 'notes', e.target.value)} placeholder="Notes" />
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}

const newRow = () => ({
  productId: '', productName: '', sku: '', description: '', brand: '', model: '',
  category: '', unit: '', condition: 'new', location: '', notes: '',
});

const thStyle: React.CSSProperties = {
  padding: '8px 10px', fontSize: 11, color: 'var(--text-3)',
  fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap', background: 'var(--bg-3)',
  position: 'sticky', top: 0, zIndex: 2,
};

export default function InventoryPage() {
  const { user } = useAuth();
  const { data: items = [], isLoading, refetch } = useInventory();
  const createItem = useCreateItem();
  const updateItem = useUpdateItem();
  const addStock = useAddStock();
  const removeStock = useRemoveStock();
  const deleteItem = useDeleteItem();
  const { data: categories = [] } = useCategoriesFlat();
  const cats = categories as Category[];

  const isManager = user?.role === 'admin' || user?.role === 'manager';

  // ── Filters ──────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [schemeFilter, setSchemeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [conditionFilter, setConditionFilter] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Modals ────────────────────────────────────────────────────────────────
  const [showAddScheme, setShowAddScheme] = useState(false);
  const [stockTarget, setStockTarget] = useState<InventoryItem | null>(null);
  const [stockQty, setStockQty] = useState('1');
  const [stockDate, setStockDate] = useState('');
  const [stockScheme, setStockScheme] = useState('');
  const [removeStockTarget, setRemoveStockTarget] = useState<InventoryItem | null>(null);
  const [removeQty, setRemoveQty] = useState('1');
  const [removeReason, setRemoveReason] = useState('');
  const [expandedSchemes, setExpandedSchemes] = useState<Set<string>>(new Set());
  const [compactView, setCompactView] = useState(false);

  // ── Edit modal state ──────────────────────────────────────────────────────
  const [editTarget, setEditTarget] = useState<InventoryItem | null>(null);
  const [editForm, setEditForm] = useState({
    name: '', description: '', category: '', brand: '', model: '',
    condition: 'new', location: '', notes: '', schemeNo: '',
    projectName: '', purchaseOrder: '', serialNumber: '',
  });

  // ── Add scheme form ───────────────────────────────────────────────────────
  const [schemeNo, setSchemeNo] = useState('');
  const [projectName, setProjectName] = useState('');
  const [rows, setRows] = useState([newRow()]);

  const list = items as InventoryItem[];

  const schemeOptions = useMemo(() => [...new Set(list.map(i => i.schemeNo).filter(Boolean))].sort() as string[], [list]);
  const categoryOptions = useMemo(() => [...new Set(list.map(i => i.category).filter(Boolean))].sort() as string[], [list]);

  const filtered = useMemo(() => list.filter(i => {
    const q = search.toLowerCase();
    const matchSearch = !q || i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q) ||
      i.schemeNo?.toLowerCase().includes(q) || i.projectName?.toLowerCase().includes(q) ||
      i.serialNumber?.toLowerCase().includes(q) || i.purchaseOrder?.toLowerCase().includes(q);
    const matchScheme = !schemeFilter || i.schemeNo === schemeFilter;
    const matchCat = !categoryFilter || i.category === categoryFilter;
    const matchCond = !conditionFilter || i.condition === conditionFilter;
    const matchStock = !stockFilter ||
      (stockFilter === 'in' && i.availableQuantity > 0) ||
      (stockFilter === 'out' && i.availableQuantity === 0) ||
      (stockFilter === 'low' && i.availableQuantity > 0 && i.availableQuantity <= 3);
    const itemDate = i.receivedAt ? new Date(i.receivedAt) : new Date(i.createdAt);
    const matchFrom = !dateFrom || itemDate >= new Date(dateFrom + 'T00:00:00');
    const matchTo = !dateTo || itemDate <= new Date(dateTo + 'T23:59:59');
    return matchSearch && matchScheme && matchCat && matchCond && matchStock && matchFrom && matchTo;
  }), [list, search, schemeFilter, categoryFilter, conditionFilter, stockFilter, dateFrom, dateTo]);

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
  const updateRow = useCallback((i: number, f: string, v: any) =>
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [f]: v } : r)), []);
  const removeRow = useCallback((i: number) =>
    setRows(prev => prev.filter((_, idx) => idx !== i)), []);

  const openAddModal = () => {
    setSchemeNo(''); setProjectName(''); setRows([newRow()]);
    setShowAddScheme(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditForm({
      name: item.name,
      description: item.description || '',
      category: item.category || '',
      brand: item.brand || '',
      model: item.model || '',
      condition: item.condition,
      location: item.location || '',
      notes: item.notes || '',
      schemeNo: item.schemeNo || '',
      projectName: item.projectName || '',
      purchaseOrder: item.purchaseOrder || '',
      serialNumber: item.serialNumber || '',
    });
    setEditTarget(item);
  };

  const handleUpdate = async () => {
    if (!editTarget) return;
    await updateItem.mutateAsync({
      id: editTarget.id,
      data: {
        name: editForm.name,
        description: editForm.description || undefined,
        category: editForm.category || undefined,
        brand: editForm.brand || undefined,
        model: editForm.model || undefined,
        condition: editForm.condition,
        location: editForm.location || undefined,
        notes: editForm.notes || undefined,
        schemeNo: editForm.schemeNo || undefined,
        projectName: editForm.projectName || undefined,
        purchaseOrder: editForm.purchaseOrder || undefined,
        serialNumber: editForm.serialNumber || undefined,
      },
    });
    setEditTarget(null);
  };

  const handleSubmitScheme = async () => {
    if (createItem.isPending) return;
    const validRows = rows.filter(r => r.sku);
    if (!schemeNo || !projectName) { alert('Scheme No. and Project Name are required'); return; }
    if (validRows.length === 0) { alert('Add at least one product row with a SKU'); return; }

    for (const row of validRows) {
      const base = {
        productId: row.productId || undefined,
        name: row.productName || row.sku,
        sku: row.sku,
        description: row.description || undefined,
        category: row.category || undefined,
        brand: row.brand || undefined,
        model: row.model || undefined,
        schemeNo,
        projectName,
        condition: row.condition,
        location: row.location || undefined,
        notes: row.notes || undefined,
      };

      await createItem.mutateAsync({ ...base, totalQuantity: 1 });
    }
    setShowAddScheme(false);
    setRows([newRow()]);
    refetch();
  };

  const exportExcel = () => {
    const exportItems = selectedIds.size > 0 ? filtered.filter(i => selectedIds.has(i.id)) : filtered;
    const data = exportItems.map(i => ({
      'Name': i.name, 'SKU': i.sku,
      'Serial No.': i.serialNumber || '',
      'Purchase Order': i.purchaseOrder || '',
      'Scheme No.': i.schemeNo || '', 'Project': i.projectName || '',
      'Category': i.category || '', 'Brand': i.brand || '',
      'Condition': i.condition,
      'Total Qty': i.totalQuantity, 'Available': i.availableQuantity,
      'Assigned': i.assignedQuantity, 'Used': i.usedQuantity,
      'Location': i.location || '', 'Notes': i.notes || '',
      'Received Date': i.receivedAt
        ? format(new Date(i.receivedAt), 'yyyy-MM-dd')
        : i.createdAt ? format(new Date(i.createdAt), 'yyyy-MM-dd') : '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
    XLSX.writeFile(wb, `inventory-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const clearFilters = () => {
    setSearch(''); setSchemeFilter(''); setCategoryFilter('');
    setConditionFilter(''); setStockFilter(''); setDateFrom(''); setDateTo('');
  };
  const hasFilters = search || schemeFilter || categoryFilter || conditionFilter || stockFilter || dateFrom || dateTo;
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="page" style={{ overflowX: 'hidden' }}>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>Inventory</h1>
          <p>
            {list.length} items · {grouped.length} scheme{grouped.length !== 1 ? 's' : ''}
            {selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => setCompactView(v => !v)}>
            {compactView ? 'Show All Columns' : 'Compact View'}
          </button>
          <button className="btn btn-ghost" onClick={exportExcel}>
            <Download size={14} /> Export{selectedIds.size > 0 ? ` (${selectedIds.size})` : ' All'}
          </button>
          {isManager && (
            <button className="btn btn-primary" onClick={openAddModal}>
              <Plus size={15} /> Add Inventory
            </button>
          )}
        </div>
      </div>

      {/* ── Filters ── */}
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div className="search-bar">
            <Search size={14} />
            <input placeholder="Search name, SKU, serial, PO, scheme…" value={search} onChange={e => setSearch(e.target.value)} />
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
            {['new', 'good', 'fair', 'poor'].map(c => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
          <select className="form-input" value={stockFilter} onChange={e => setStockFilter(e.target.value)}>
            <option value="">All Stock</option>
            <option value="in">In Stock</option>
            <option value="low">Low (≤3)</option>
            <option value="out">Out of Stock</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>Received date:</span>
          <input type="date" className="form-input" style={{ width: 160 }} max={today} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span style={{ color: 'var(--text-3)', fontSize: 13 }}>→</span>
          <input type="date" className="form-input" style={{ width: 160 }} max={today} value={dateTo} onChange={e => setDateTo(e.target.value)} />
          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
              <Filter size={13} /> Clear all
            </button>
          )}
        </div>
        {hasFilters && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-3)' }}>
            Showing <strong style={{ color: 'var(--text)' }}>{filtered.length}</strong> of {list.length} items
          </div>
        )}
      </div>

      {/* ── List ── */}
      {isLoading ? (
        <div className="empty-state"><Package size={40} /><span>Loading…</span></div>
      ) : grouped.length === 0 ? (
        <div className="empty-state">
          <Package size={48} style={{ color: 'var(--text-3)' }} />
          <span>{hasFilters ? 'No items match your filters' : 'No inventory items yet'}</span>
          {!hasFilters && <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 8 }}>Click "Add Inventory" to start adding items by scheme</p>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowX: 'auto' }}>
          {grouped.map(({ schemeNo: sNo, projectName: pName, items: groupItems }) => {
            const key = `${sNo}||${pName}`;
            const expanded = expandedSchemes.has(key);
            const totalQty = groupItems.reduce((s, i) => s + i.totalQuantity, 0);
            const availQty = groupItems.reduce((s, i) => s + i.availableQuantity, 0);
            const ap = totalQty > 0 ? availQty / totalQty : 0;
            const stockColor = ap === 0 ? 'var(--red)' : ap < 0.3 ? 'var(--yellow)' : 'var(--green)';
            const allSel = groupItems.every(i => selectedIds.has(i.id));
            const someSel = groupItems.some(i => selectedIds.has(i.id));

            return (
              <div key={key} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', borderBottom: expanded ? '1px solid var(--border)' : 'none', cursor: 'pointer', flexWrap: 'nowrap', overflow: 'hidden' }}
                  onClick={() => toggleScheme(key)}>
                  <input type="checkbox" checked={allSel}
                    ref={el => { if (el) el.indeterminate = someSel && !allSel; }}
                    onChange={e => { e.stopPropagation(); toggleSelectScheme(groupItems); }}
                    onClick={e => e.stopPropagation()} style={{ cursor: 'pointer', flexShrink: 0 }} />
                  <ChevronDown size={15} style={{ color: 'var(--text-3)', flexShrink: 0, transform: expanded ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', overflow: 'hidden' }}>
                    <span style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{sNo}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{pName}</span>
                  </div>
                  <span className="badge badge-blue" style={{ flexShrink: 0 }}>{groupItems.length} item{groupItems.length !== 1 ? 's' : ''}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: stockColor, flexShrink: 0 }}>{availQty}/{totalQty}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>available</span>
                </div>

                {expanded && (
                  <div className="table-wrap" style={{ margin: 0, borderRadius: 0, overflowX: 'auto' }}>
                    <table style={{ minWidth: compactView ? 900 : 1100 }}>
                      <thead>
                        <tr>
                          <th style={{ width: 36, textAlign: 'center' }}></th>
                          <th style={{ minWidth: 160 }}>Product</th>
                          <th style={{ whiteSpace: 'nowrap', width: 90 }}>SKU</th>
                          {!compactView && <th style={{ whiteSpace: 'nowrap', width: 100 }}>Serial No.</th>}
                          {!compactView && <th style={{ whiteSpace: 'nowrap', width: 100 }}>Purchase Order</th>}
                          <th style={{ whiteSpace: 'nowrap', width: 100 }}>Category</th>
                          <th style={{ whiteSpace: 'nowrap', width: 55, textAlign: 'center' }}>Total</th>
                          <th style={{ whiteSpace: 'nowrap', width: 55, textAlign: 'center' }}>Avail.</th>
                          <th style={{ whiteSpace: 'nowrap', width: 65, textAlign: 'center' }}>Assigned</th>
                          <th style={{ whiteSpace: 'nowrap', width: 50, textAlign: 'center' }}>Used</th>
                          <th style={{ whiteSpace: 'nowrap', width: 75 }}>Condition</th>
                          <th style={{ whiteSpace: 'nowrap', width: 75 }}>Location</th>
                          <th style={{ whiteSpace: 'nowrap', width: 90 }}>Received</th>
                          {isManager && <th style={{ whiteSpace: 'nowrap', width: 120 }}>Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {groupItems.map(item => {
                          const ap2 = item.totalQuantity > 0 ? item.availableQuantity / item.totalQuantity : 0;
                          const ac = ap2 === 0 ? 'var(--red)' : ap2 < 0.3 ? 'var(--yellow)' : 'var(--green)';
                          const receivedDate = item.receivedAt || item.createdAt;
                          return (
                            <tr key={item.id} style={{ background: selectedIds.has(item.id) ? 'var(--accent-dim)' : undefined }}>
                              <td style={{ width: 36, textAlign: 'center' }}>
                                <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelectItem(item.id)} style={{ cursor: 'pointer' }} />
                              </td>
                              <td style={{ minWidth: 140, maxWidth: 200 }}>
                                <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 190 }}>
                                  {item.name}
                                </div>
                                {item.description && (
                                  <div style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 190 }}>
                                    {item.description}
                                  </div>
                                )}
                              </td>
                              <td style={{ width: 90 }}><code style={{ fontSize: 11, background: 'var(--bg-3)', padding: '2px 6px', borderRadius: 4, color: 'var(--accent)' }}>{item.sku}</code></td>
                              {!compactView && (
                                <td style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'monospace', width: 100, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {item.serialNumber || '—'}
                                </td>
                              )}
                              {!compactView && (
                                <td style={{ fontSize: 12, color: 'var(--text-2)', width: 100, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {item.purchaseOrder || '—'}
                                </td>
                              )}
                              <td style={{ fontSize: 12, color: 'var(--text-2)', width: 100, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.category || '—'}
                              </td>
                              <td style={{ width: 55, textAlign: 'center', fontWeight: 600 }}>{item.totalQuantity}</td>
                              <td style={{ width: 55, textAlign: 'center', fontWeight: 700, color: ac }}>{item.availableQuantity}</td>
                              <td style={{ width: 65, textAlign: 'center', color: 'var(--yellow)' }}>{item.assignedQuantity}</td>
                              <td style={{ width: 50, textAlign: 'center', color: 'var(--purple)' }}>{item.usedQuantity}</td>
                              <td style={{ width: 75 }}><span className={`badge badge-${item.condition === 'new' ? 'green' : item.condition === 'good' ? 'blue' : item.condition === 'fair' ? 'yellow' : 'red'}`}>{item.condition}</span></td>
                              <td style={{ fontSize: 12, color: 'var(--text-2)', width: 75, maxWidth: 75, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.location || '—'}
                              </td>
                              <td style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap', width: 90 }}>
                                {receivedDate ? format(new Date(receivedDate), 'dd MMM yyyy') : '—'}
                              </td>
                              {isManager && (
                                <td style={{ width: 120 }}>
                                  <div className="flex gap-2">
                                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(item)} title="Edit">
                                      <Edit2 size={13} />
                                    </button>
                                    <button className="btn btn-ghost btn-sm" onClick={() => { setStockTarget(item); setStockQty('1'); setStockDate(''); setStockScheme(''); }}>+ Stock</button>
                                    <button
                                      className="btn btn-danger btn-sm"
                                      style={{ opacity: item.availableQuantity === 0 ? 0.4 : 1 }}
                                      disabled={item.availableQuantity === 0}
                                      onClick={() => { setRemoveStockTarget(item); setRemoveQty('1'); setRemoveReason(''); }}
                                    >
                                      − Stock
                                    </button>
                                    {isManager && (
                                      <button className="btn btn-danger btn-sm btn-icon" title="Permanently delete"
                                        onClick={() => { if (confirm(`Permanently delete "${item.name}"? This cannot be undone.`)) deleteItem.mutate(item.id); }}>
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

      {/* ── Add Inventory Modal ── */}
      <Modal isOpen={showAddScheme} onClose={() => setShowAddScheme(false)} title="Add Inventory" size="xl"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setShowAddScheme(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmitScheme} disabled={createItem.isPending || !schemeNo || !projectName}>
            {createItem.isPending ? 'Saving…' : `Add ${rows.filter(r => r.sku).length || 0} Item(s)`}
          </button>
        </>}>

        {/* Scheme / Project — 2 columns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Scheme No. *</label>
            <input className="form-input" value={schemeNo} onChange={e => setSchemeNo(e.target.value)} placeholder="e.g. SCH-2024-001" autoFocus />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Project Name *</label>
            <input className="form-input" value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="e.g. Riyadh Metro Phase 2" />
          </div>
        </div>

        <div style={{ fontSize: 12, color: 'var(--accent)', background: 'var(--accent-dim)', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
          💡 Type a product name to search from your catalog — SKU and category fill automatically. Category is also searchable if adding manually.
        </div>

        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 28, textAlign: 'center' }}>#</th>
                <th style={{ ...thStyle, minWidth: 200 }}>Product Name</th>
                <th style={{ ...thStyle, width: 90 }}>SKU</th>
                <th style={{ ...thStyle, width: 110 }}>Category</th>
                <th style={{ ...thStyle, width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <ProductRow key={idx} row={row} index={idx} onUpdate={updateRow} onRemove={removeRow} usedProductIds={usedProductIds} categories={cats} />
              ))}
            </tbody>
          </table>
        </div>
        <button className="btn btn-ghost" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }}
          onClick={() => setRows(prev => [...prev, newRow()])}>
          <Plus size={14} /> Add Another Product
        </button>
      </Modal>

      {/* ── Add Stock Modal ── */}
      <Modal isOpen={!!stockTarget} onClose={() => { setStockTarget(null); setStockDate(''); setStockScheme(''); }}
        title={`Add Stock — ${stockTarget?.name}`}
        footer={<>
          <button className="btn btn-ghost" onClick={() => { setStockTarget(null); setStockDate(''); setStockScheme(''); }}>Cancel</button>
          <button className="btn btn-primary"
            onClick={async () => {
              if (!stockTarget) return;
              await addStock.mutateAsync({
                id: stockTarget.id,
                quantity: parseInt(stockQty),
                receivedAt: stockDate || undefined,
                schemeNo: stockScheme || undefined,
              });
              setStockTarget(null); setStockDate(''); setStockScheme('');
            }}
            disabled={addStock.isPending}>
            {addStock.isPending ? 'Adding…' : 'Add Stock'}
          </button>
        </>}>
        {stockTarget && (
          <>
            <div style={{ background: 'var(--bg-3)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <div style={{ fontWeight: 600 }}>{stockTarget.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                SKU: {stockTarget.sku}
                {stockTarget.serialNumber && <span> · Serial: <code style={{ color: 'var(--accent)' }}>{stockTarget.serialNumber}</code></span>}
                {stockTarget.purchaseOrder && <span> · PO: <strong>{stockTarget.purchaseOrder}</strong></span>}
                {' · '}Current: <strong style={{ color: 'var(--text)' }}>{stockTarget.totalQuantity}</strong> total
                {' · '}<strong style={{ color: 'var(--green)' }}>{stockTarget.availableQuantity}</strong> available
              </div>
              {(stockTarget.receivedAt || stockTarget.createdAt) && (
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                  Last received: {format(new Date(stockTarget.receivedAt || stockTarget.createdAt), 'dd MMM yyyy')}
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Quantity to Add *</label>
              <input type="number" min="1" className="form-input" value={stockQty} onChange={e => setStockQty(e.target.value)} autoFocus />
            </div>

            <div className="form-group">
              <label className="form-label">Scheme No.</label>
              <input className="form-input" value={stockScheme} onChange={e => setStockScheme(e.target.value)}
                placeholder={stockTarget.schemeNo || 'Leave blank to keep existing scheme'} />
              {stockTarget.schemeNo && !stockScheme && (
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                  Current: <strong style={{ color: 'var(--text)' }}>{stockTarget.schemeNo}</strong> — leave blank to keep it
                </p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Received Date</label>
              <input type="date" className="form-input" value={stockDate} onChange={e => setStockDate(e.target.value)} max={today} />
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>Leave blank to use today's date</p>
            </div>

            {parseInt(stockQty) > 0 && (
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                New total: <strong style={{ color: 'var(--green)' }}>{stockTarget.totalQuantity + parseInt(stockQty)}</strong>
              </div>
            )}
          </>
        )}
      </Modal>

      {/* ── Remove Stock Modal ── */}
      <Modal
        isOpen={!!removeStockTarget}
        onClose={() => { setRemoveStockTarget(null); setRemoveReason(''); }}
        title={`Remove Stock — ${removeStockTarget?.name}`}
        footer={<>
          <button className="btn btn-ghost" onClick={() => { setRemoveStockTarget(null); setRemoveReason(''); }}>
            Cancel
          </button>
          <button
            className="btn btn-danger"
            onClick={async () => {
              if (!removeStockTarget) return;
              const qty = parseInt(removeQty);
              if (qty > removeStockTarget.availableQuantity) {
                alert(`Cannot remove more than available quantity (${removeStockTarget.availableQuantity})`);
                return;
              }
              await removeStock.mutateAsync({
                id: removeStockTarget.id,
                quantity: qty,
                reason: removeReason || undefined,
              });
              setRemoveStockTarget(null);
              setRemoveReason('');
            }}
            disabled={removeStock.isPending}
          >
            {removeStock.isPending ? 'Removing…' : 'Remove Stock'}
          </button>
        </>}
      >
        {removeStockTarget && (
          <>
            <div style={{ background: 'var(--bg-3)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <div style={{ fontWeight: 600 }}>{removeStockTarget.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                SKU: {removeStockTarget.sku}
                {removeStockTarget.serialNumber && <span> · Serial: <code style={{ color: 'var(--accent)' }}>{removeStockTarget.serialNumber}</code></span>}
                {' · '}Available: <strong style={{ color: 'var(--green)' }}>{removeStockTarget.availableQuantity}</strong>
                {' · '}Total: <strong style={{ color: 'var(--text)' }}>{removeStockTarget.totalQuantity}</strong>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Quantity to Remove *</label>
              <input
                type="number"
                min="1"
                max={removeStockTarget.availableQuantity}
                className="form-input"
                value={removeQty}
                onChange={e => setRemoveQty(e.target.value)}
                autoFocus
              />
              {parseInt(removeQty) > removeStockTarget.availableQuantity && (
                <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>
                  Cannot exceed available quantity ({removeStockTarget.availableQuantity})
                </p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Reason for Removal</label>
              <select className="form-input" value={removeReason} onChange={e => setRemoveReason(e.target.value)}>
                <option value="">— Select reason —</option>
                <option value="damaged">Damaged / Defective</option>
                <option value="expired">Expired</option>
                <option value="lost">Lost / Missing</option>
                <option value="returned_to_supplier">Returned to Supplier</option>
                <option value="adjustment">Stock Adjustment</option>
                <option value="other">Other</option>
              </select>
            </div>

            {parseInt(removeQty) > 0 && parseInt(removeQty) <= removeStockTarget.availableQuantity && (
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                New total: <strong style={{ color: 'var(--red)' }}>
                  {removeStockTarget.totalQuantity - parseInt(removeQty)}
                </strong>
                {' · '}New available: <strong style={{ color: 'var(--red)' }}>
                  {removeStockTarget.availableQuantity - parseInt(removeQty)}
                </strong>
              </div>
            )}
          </>
        )}
      </Modal>

      {/* ── Edit Inventory Item Modal ── */}
      <Modal isOpen={!!editTarget} onClose={() => setEditTarget(null)}
        title={`Edit — ${editTarget?.name}`} size="md"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setEditTarget(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleUpdate} disabled={updateItem.isPending || !editForm.name}>
            {updateItem.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </>}>
        {editTarget && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Name *</label>
                <input className="form-input" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Serial No.</label>
                <input className="form-input" style={{ fontFamily: 'monospace' }} value={editForm.serialNumber} onChange={e => setEditForm(f => ({ ...f, serialNumber: e.target.value }))} placeholder="e.g. SN-001" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <input className="form-input" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Scheme No.</label>
                <input className="form-input" value={editForm.schemeNo} onChange={e => setEditForm(f => ({ ...f, schemeNo: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Project Name</label>
                <input className="form-input" value={editForm.projectName} onChange={e => setEditForm(f => ({ ...f, projectName: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Purchase Order</label>
                <input className="form-input" value={editForm.purchaseOrder} onChange={e => setEditForm(f => ({ ...f, purchaseOrder: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Category</label>
                <CategoryAutocomplete value={editForm.category} onChange={v => setEditForm(f => ({ ...f, category: v }))} categories={cats} />
              </div>
              <div className="form-group">
                <label className="form-label">Condition</label>
                <select className="form-input" value={editForm.condition} onChange={e => setEditForm(f => ({ ...f, condition: e.target.value }))}>
                  {['new', 'good', 'fair', 'poor'].map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Brand</label>
                <input className="form-input" value={editForm.brand} onChange={e => setEditForm(f => ({ ...f, brand: e.target.value }))} placeholder="e.g. 3M" />
              </div>
              <div className="form-group">
                <label className="form-label">Model</label>
                <input className="form-input" value={editForm.model} onChange={e => setEditForm(f => ({ ...f, model: e.target.value }))} placeholder="e.g. H-700" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Location</label>
                <input className="form-input" value={editForm.location} onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. A-3" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Notes</label>
                <input className="form-input" value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}