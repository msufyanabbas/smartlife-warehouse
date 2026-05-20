import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Plus, Search, Trash2, Package, ChevronDown, CheckCircle, Download, Filter, X, Edit2 } from 'lucide-react';
import { format } from 'date-fns';
import {
  useInventory, useCreateItem, useAddStock, useDeleteItem, useUpdateItem,
  useProductSearch, useCategoriesFlat,
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
  serialNumber?: string; purchaseOrder?: string;
  totalQuantity: number; availableQuantity: number; assignedQuantity: number;
  usedQuantity: number; condition: string; location?: string; notes?: string;
  productId?: string; isActive: boolean;
  receivedAt?: string; createdAt: string;
}

interface Category { id: string; name: string; parentId?: string; parent?: { name: string }; }

const generateSequentialSerials = (base: string, qty: number): string[] => {
  const safeQty = Math.max(0, qty | 0);
  if (!base) return Array.from({ length: safeQty }, () => '');
  const match = base.match(/^(.*?)(\d+)$/);
  if (match) {
    const prefix = match[1], numStr = match[2];
    const startNum = parseInt(numStr, 10), padLen = numStr.length;
    return Array.from({ length: safeQty }, (_, i) =>
      `${prefix}${String(startNum + i).padStart(padLen, '0')}`
    );
  }
  return Array.from({ length: safeQty }, (_, i) => `${base}-${i + 1}`);
};

// ── Floating dropdown portal — escapes table cell clipping ────────────────
function FloatingDropdown({ anchorRef, children, visible }: {
  anchorRef: React.RefObject<HTMLElement>;
  children: React.ReactNode;
  visible: boolean;
}) {
  const [style, setStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (visible && anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 320),
        zIndex: 99999,
      });
    }
  }, [visible, anchorRef]);

  if (!visible) return null;
  return (
    <div style={{
      ...style,
      background: 'var(--bg-2)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
      maxHeight: 260,
      overflowY: 'auto',
    }}>
      {children}
    </div>
  );
}

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

// ── Product row in Add Inventory table ────────────────────────────────────
function ProductRow({ row, index, onUpdate, onRemove, usedProductIds, categories }: {
  row: any; index: number;
  onUpdate: (i: number, f: string, v: any) => void;
  onRemove: (i: number) => void;
  usedProductIds: string[];
  categories: Category[];
}) {
  const td: React.CSSProperties = { padding: '6px 8px', verticalAlign: 'top' };

  return (
    <tr style={{ borderBottom: '1px solid var(--border)', background: index % 2 === 0 ? 'var(--bg-2)' : 'var(--bg-3)' }}>
      <td style={{ ...td, width: 28, textAlign: 'center', color: 'var(--text-3)', fontSize: 12, verticalAlign: 'middle' }}>{index + 1}</td>

      {/* Product search */}
      <td style={{ ...td, minWidth: 260 }}>
        <ProductAutocomplete row={row} index={index} onUpdate={onUpdate} usedProductIds={usedProductIds} />
      </td>

      {/* SKU - auto-filled, readonly when product selected */}
      <td style={{ ...td, width: 110 }}>
        <input className="form-input"
          style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--accent)', background: row.productId ? 'var(--bg-4)' : undefined }}
          value={row.sku} onChange={e => onUpdate(index, 'sku', e.target.value)}
          placeholder="SKU" readOnly={!!row.productId} />
      </td>

      {/* Category - auto-filled or searchable */}
      <td style={{ ...td, width: 160 }}>
        <CategoryAutocomplete
          value={row.category}
          onChange={v => onUpdate(index, 'category', v)}
          categories={categories}
          readOnly={!!row.productId}
        />
      </td>

      {/* Serial Number with sequential/custom toggle */}
      <td style={{ ...td, width: 180 }}>
        <input className="form-input"
          style={{ fontSize: 12, fontFamily: 'monospace' }}
          value={row.serialNumber || ''}
          onChange={e => onUpdate(index, 'serialNumber', e.target.value)}
          placeholder={row.quantity > 1 ? 'Base e.g. SN-001' : 'Serial No.'}
        />
        {row.quantity > 1 && (
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            <button type="button"
              onClick={() => onUpdate(index, 'serialMode', 'sequential')}
              style={{ flex: 1, fontSize: 10, padding: '3px 4px', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: row.serialMode !== 'custom' ? 'var(--accent)' : 'var(--bg-3)', color: row.serialMode !== 'custom' ? '#fff' : 'var(--text-2)' }}>
              Sequential
            </button>
            <button type="button"
              onClick={() => {
                onUpdate(index, 'serialMode', 'custom');
                const ex: string[] = Array.isArray(row.customSerials) ? row.customSerials : [];
                onUpdate(index, 'customSerials', Array.from({ length: row.quantity }, (_, i) => ex[i] || ''));
              }}
              style={{ flex: 1, fontSize: 10, padding: '3px 4px', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: row.serialMode === 'custom' ? 'var(--accent)' : 'var(--bg-3)', color: row.serialMode === 'custom' ? '#fff' : 'var(--text-2)' }}>
              Custom
            </button>
          </div>
        )}
        {row.quantity > 1 && row.serialMode !== 'custom' && row.serialNumber && (() => {
          const preview = generateSequentialSerials(row.serialNumber, row.quantity);
          return (
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4, fontFamily: 'monospace', lineHeight: 1.4 }}>
              {preview.slice(0, 3).join(', ')}{row.quantity > 3 ? `, … (${row.quantity})` : ''}
            </div>
          );
        })()}
        {row.quantity > 1 && row.serialMode === 'custom' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4, maxHeight: 120, overflowY: 'auto', padding: 4, background: 'var(--bg-3)', borderRadius: 4 }}>
            {Array.from({ length: row.quantity }, (_, i) => (
              <input key={i} className="form-input"
                style={{ fontSize: 11, padding: '3px 6px', fontFamily: 'monospace' }}
                value={(row.customSerials && row.customSerials[i]) || ''}
                onChange={e => {
                  const next = Array.from({ length: row.quantity }, (_, j) =>
                    j === i ? e.target.value : ((row.customSerials && row.customSerials[j]) || '')
                  );
                  onUpdate(index, 'customSerials', next);
                }}
                placeholder={`#${i + 1}`}
              />
            ))}
          </div>
        )}
      </td>

      {/* Qty */}
      <td style={{ ...td, width: 65, verticalAlign: 'middle' }}>
        <input className="form-input" type="number" min="1"
          style={{ fontSize: 13, textAlign: 'center' }}
          value={row.quantity}
          onChange={e => {
            const q = parseInt(e.target.value) || 1;
            onUpdate(index, 'quantity', q);
            if (q === 1) onUpdate(index, 'serialMode', 'single');
            else if (row.serialMode === 'single') onUpdate(index, 'serialMode', 'sequential');
          }}
        />
      </td>

      {/* Condition */}
      <td style={{ ...td, width: 90, verticalAlign: 'middle' }}>
        <select className="form-input" style={{ fontSize: 12 }} value={row.condition} onChange={e => onUpdate(index, 'condition', e.target.value)}>
          {['new', 'good', 'fair', 'poor'].map(c => (
            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
        </select>
      </td>

      {/* Location */}
      <td style={{ ...td, width: 80, verticalAlign: 'middle' }}>
        <input className="form-input" style={{ fontSize: 12 }} value={row.location} onChange={e => onUpdate(index, 'location', e.target.value)} placeholder="A-3" />
      </td>

      {/* Notes */}
      <td style={{ ...td, verticalAlign: 'middle' }}>
        <input className="form-input" style={{ fontSize: 12 }} value={row.notes} onChange={e => onUpdate(index, 'notes', e.target.value)} placeholder="Notes" />
      </td>

      {/* Remove */}
      <td style={{ ...td, width: 36, textAlign: 'center', verticalAlign: 'middle' }}>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }} onClick={() => onRemove(index)}>
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  );
}

const newRow = () => ({
  productId: '', productName: '', sku: '', description: '', brand: '', model: '',
  category: '', unit: '', quantity: 1, condition: 'new', location: '', notes: '',
  serialNumber: '', serialMode: 'single', customSerials: [] as string[],
});

const thStyle: React.CSSProperties = {
  padding: '8px 10px', fontSize: 11, color: 'var(--text-3)',
  fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap', background: 'var(--bg-3)',
};

export default function InventoryPage() {
  const { user } = useAuth();
  const { data: items = [], isLoading, refetch } = useInventory();
  const createItem = useCreateItem();
  const updateItem = useUpdateItem();
  const addStock = useAddStock();
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
  const [expandedSchemes, setExpandedSchemes] = useState<Set<string>>(new Set());

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
  const [purchaseOrder, setPurchaseOrder] = useState('');
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
    setSchemeNo(''); setProjectName(''); setPurchaseOrder(''); setRows([newRow()]);
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
    const validRows = rows.filter(r => r.sku && r.quantity > 0);
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
        purchaseOrder: purchaseOrder || undefined,
        condition: row.condition,
        location: row.location || undefined,
        notes: row.notes || undefined,
      };

      if (row.quantity === 1) {
        await createItem.mutateAsync({ ...base, totalQuantity: 1, serialNumber: row.serialNumber || undefined });
      } else if (row.serialMode === 'custom') {
        const custom: string[] = Array.isArray(row.customSerials) ? row.customSerials : [];
        for (let i = 0; i < row.quantity; i++) {
          await createItem.mutateAsync({ ...base, totalQuantity: 1, serialNumber: (custom[i] || '').trim() || undefined });
        }
      } else if (row.serialNumber) {
        const serials = generateSequentialSerials(row.serialNumber, row.quantity);
        for (const sn of serials) {
          await createItem.mutateAsync({ ...base, totalQuantity: 1, serialNumber: sn || undefined });
        }
      } else {
        await createItem.mutateAsync({ ...base, totalQuantity: row.quantity });
      }
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
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>Inventory</h1>
          <p>
            {list.length} items · {grouped.length} scheme{grouped.length !== 1 ? 's' : ''}
            {selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ''}
          </p>
        </div>
        <div className="flex gap-2">
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', borderBottom: expanded ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}
                  onClick={() => toggleScheme(key)}>
                  <input type="checkbox" checked={allSel}
                    ref={el => { if (el) el.indeterminate = someSel && !allSel; }}
                    onChange={e => { e.stopPropagation(); toggleSelectScheme(groupItems); }}
                    onClick={e => e.stopPropagation()} style={{ cursor: 'pointer' }} />
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
                          <th>Serial No.</th>
                          <th>Purchase Order</th>
                          <th>Category</th>
                          <th style={{ textAlign: 'center' }}>Total</th>
                          <th style={{ textAlign: 'center' }}>Avail.</th>
                          <th style={{ textAlign: 'center' }}>Assigned</th>
                          <th style={{ textAlign: 'center' }}>Used</th>
                          <th>Condition</th>
                          <th>Location</th>
                          <th>Received</th>
                          {isManager && <th>Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {groupItems.map(item => {
                          const ap2 = item.totalQuantity > 0 ? item.availableQuantity / item.totalQuantity : 0;
                          const ac = ap2 === 0 ? 'var(--red)' : ap2 < 0.3 ? 'var(--yellow)' : 'var(--green)';
                          const receivedDate = item.receivedAt || item.createdAt;
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
                              <td style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'monospace' }}>{item.serialNumber || '—'}</td>
                              <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{item.purchaseOrder || '—'}</td>
                              <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{item.category || '—'}</td>
                              <td style={{ textAlign: 'center', fontWeight: 600 }}>{item.totalQuantity}</td>
                              <td style={{ textAlign: 'center', fontWeight: 700, color: ac }}>{item.availableQuantity}</td>
                              <td style={{ textAlign: 'center', color: 'var(--yellow)' }}>{item.assignedQuantity}</td>
                              <td style={{ textAlign: 'center', color: 'var(--purple)' }}>{item.usedQuantity}</td>
                              <td><span className={`badge badge-${item.condition === 'new' ? 'green' : item.condition === 'good' ? 'blue' : item.condition === 'fair' ? 'yellow' : 'red'}`}>{item.condition}</span></td>
                              <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{item.location || '—'}</td>
                              <td style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                                {receivedDate ? format(new Date(receivedDate), 'dd MMM yyyy') : '—'}
                              </td>
                              {isManager && (
                                <td>
                                  <div className="flex gap-2">
                                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(item)} title="Edit">
                                      <Edit2 size={13} />
                                    </button>
                                    <button className="btn btn-ghost btn-sm" onClick={() => { setStockTarget(item); setStockQty('1'); setStockDate(''); setStockScheme(''); }}>+ Stock</button>
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

      {/* ── Add Inventory Modal ── */}
      <Modal isOpen={showAddScheme} onClose={() => setShowAddScheme(false)} title="Add Inventory" size="xl"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setShowAddScheme(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmitScheme} disabled={createItem.isPending || !schemeNo || !projectName}>
            {createItem.isPending ? 'Saving…' : `Add ${rows.filter(r => r.sku).length || 0} Item(s)`}
          </button>
        </>}>

        {/* Scheme / Project / PO — 3 columns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 16 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Scheme No. *</label>
            <input className="form-input" value={schemeNo} onChange={e => setSchemeNo(e.target.value)} placeholder="e.g. SCH-2024-001" autoFocus />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Project Name *</label>
            <input className="form-input" value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="e.g. Riyadh Metro Phase 2" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Purchase Order No.</label>
            <input className="form-input" value={purchaseOrder} onChange={e => setPurchaseOrder(e.target.value)} placeholder="e.g. PO-2024-001" />
          </div>
        </div>

        <div style={{ fontSize: 12, color: 'var(--accent)', background: 'var(--accent-dim)', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
          💡 Type a product name to search from your catalog — SKU and category fill automatically. Category is also searchable if adding manually.
        </div>

        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>#</th>
                <th style={thStyle}>Product Name</th>
                <th style={thStyle}>SKU</th>
                <th style={thStyle}>Category</th>
                <th style={thStyle}>Serial No.</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Qty</th>
                <th style={thStyle}>Condition</th>
                <th style={thStyle}>Location</th>
                <th style={thStyle}>Notes</th>
                <th style={thStyle}></th>
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