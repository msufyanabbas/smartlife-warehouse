import { useState, useMemo } from 'react';
import { Plus, Search, Edit2, Trash2, Package, Tag } from 'lucide-react';
import {
  useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct,
  useCategoriesFlat,
} from '../hooks/useApi';
import Modal from '../components/Modal';

interface Product {
  id: string;
  name: string;
  sku: string;
  description?: string;
  brand?: string;
  model?: string;
  unit?: string;
  notes?: string;
  categoryId?: string;
  category?: { id: string; name: string; parent?: { name: string } };
  isActive: boolean;
}

interface Category {
  id: string;
  name: string;
  parentId?: string;
  parent?: { id: string; name: string };
}

// ── Form outside to prevent focus loss ────────────────────────────────────
function ProductForm({
  name, setName,
  sku, setSku,
  description, setDescription,
  brand, setBrand,
  model, setModel,
  unit, setUnit,
  categoryId, setCategoryId,
  notes, setNotes,
  categories,
  isEdit,
}: {
  name: string; setName: (v: string) => void;
  sku: string; setSku: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  brand: string; setBrand: (v: string) => void;
  model: string; setModel: (v: string) => void;
  unit: string; setUnit: (v: string) => void;
  categoryId: string; setCategoryId: (v: string) => void;
  notes: string; setNotes: (v: string) => void;
  categories: Category[];
  isEdit?: boolean;
}) {
  // Group categories by parent
  const topLevel = categories.filter(c => !c.parentId);
  const subCategories = categories.filter(c => !!c.parentId);

  return (
    <>
      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">Product Name *</label>
          <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Safety Helmet" autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">SKU *</label>
          <input className="form-input" value={sku} onChange={e => setSku(e.target.value)} placeholder="e.g. SH-001" disabled={isEdit} style={isEdit ? { opacity: 0.6 } : {}} />
          {isEdit && <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>SKU cannot be changed after creation</p>}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Category</label>
        <select className="form-input" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
          <option value="">— No category —</option>
          {topLevel.map(cat => (
            <optgroup key={cat.id} label={cat.name}>
              <option value={cat.id}>{cat.name}</option>
              {subCategories.filter(s => s.parentId === cat.id).map(sub => (
                <option key={sub.id} value={sub.id}>　↳ {sub.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea className="form-input" value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Brief product description" />
      </div>

      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">Brand</label>
          <input className="form-input" value={brand} onChange={e => setBrand(e.target.value)} placeholder="e.g. 3M" />
        </div>
        <div className="form-group">
          <label className="form-label">Model</label>
          <input className="form-input" value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. H-700" />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Unit of Measure</label>
        <select className="form-input" value={unit} onChange={e => setUnit(e.target.value)}>
          <option value="">— Select unit —</option>
          {['pcs', 'meters', 'kg', 'liters', 'boxes', 'rolls', 'pairs', 'sets'].map(u => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Notes</label>
        <input className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
      </div>
    </>
  );
}

export default function ProductsPage() {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const { data: products = [], isLoading } = useProducts(search || undefined, catFilter || undefined);
  const { data: categories = [] } = useCategoriesFlat();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Product | null>(null);

  // Create state
  const [cName, setCName] = useState('');
  const [cSku, setCSku] = useState('');
  const [cDesc, setCDesc] = useState('');
  const [cBrand, setCBrand] = useState('');
  const [cModel, setCModel] = useState('');
  const [cUnit, setCUnit] = useState('');
  const [cCat, setCCat] = useState('');
  const [cNotes, setCNotes] = useState('');

  // Edit state
  const [eName, setEName] = useState('');
  const [eSku, setESku] = useState('');
  const [eDesc, setEDesc] = useState('');
  const [eBrand, setEBrand] = useState('');
  const [eModel, setEModel] = useState('');
  const [eUnit, setEUnit] = useState('');
  const [eCat, setECat] = useState('');
  const [eNotes, setENotes] = useState('');

  const cats = categories as Category[];
  const list = products as Product[];

  const openCreate = () => {
    setCName(''); setCSku(''); setCDesc(''); setCBrand('');
    setCModel(''); setCUnit(''); setCCat(''); setCNotes('');
    setShowCreate(true);
  };

  const openEdit = (p: Product) => {
    setEName(p.name); setESku(p.sku); setEDesc(p.description || '');
    setEBrand(p.brand || ''); setEModel(p.model || '');
    setEUnit(p.unit || ''); setECat(p.categoryId || ''); setENotes(p.notes || '');
    setEditTarget(p);
  };

  const handleCreate = async () => {
    await createProduct.mutateAsync({
      name: cName, sku: cSku,
      description: cDesc || undefined, brand: cBrand || undefined,
      model: cModel || undefined, unit: cUnit || undefined,
      categoryId: cCat || undefined, notes: cNotes || undefined,
    });
    setShowCreate(false);
  };

  const handleUpdate = async () => {
    if (!editTarget) return;
    await updateProduct.mutateAsync({
      id: editTarget.id,
      data: {
        name: eName, description: eDesc || undefined,
        brand: eBrand || undefined, model: eModel || undefined,
        unit: eUnit || undefined, categoryId: eCat || undefined,
        notes: eNotes || undefined,
      },
    });
    setEditTarget(null);
  };

  const handleDelete = async (p: Product) => {
    if (!confirm(`Remove "${p.name}" from catalog?`)) return;
    await deleteProduct.mutateAsync(p.id);
  };

  const getCategoryLabel = (p: Product) => {
    if (!p.category) return null;
    if (p.category.parent) return `${p.category.parent.name} › ${p.category.name}`;
    return p.category.name;
  };

  // Top-level cats for filter
  const topCats = cats.filter(c => !c.parentId);
  const subCats = cats.filter(c => !!c.parentId);

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>Products Catalog</h1>
          <p>{list.length} products in catalog</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={15} /> Add Product
        </button>
      </div>

      {/* Search + filter */}
      <div className="flex items-center gap-3" style={{ marginBottom: 20 }}>
        <div className="search-bar" style={{ flex: 1, maxWidth: 360 }}>
          <Search size={14} />
          <input
            placeholder="Search by name or SKU…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="form-input"
          style={{ width: 200 }}
          value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
        >
          <option value="">All Categories</option>
          {topCats.map(cat => (
            <optgroup key={cat.id} label={cat.name}>
              <option value={cat.id}>{cat.name}</option>
              {subCats.filter(s => s.parentId === cat.id).map(sub => (
                <option key={sub.id} value={sub.id}>　↳ {sub.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="empty-state"><Package size={40} /><span>Loading…</span></div>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <Package size={48} style={{ color: 'var(--text-3)' }} />
          <span>No products found</span>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 8 }}>
            Add products to your catalog first, then add them to inventory
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Category</th>
                <th>Brand / Model</th>
                <th>Unit</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map(p => (
                <tr key={p.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{p.name}</div>
                    {p.description && (
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{p.description}</div>
                    )}
                  </td>
                  <td>
                    <code style={{
                      fontSize: 12, background: 'var(--bg-3)',
                      padding: '2px 8px', borderRadius: 4, color: 'var(--accent)',
                    }}>{p.sku}</code>
                  </td>
                  <td>
                    {getCategoryLabel(p) ? (
                      <span className="badge badge-blue">{getCategoryLabel(p)}</span>
                    ) : (
                      <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>
                    )}
                  </td>
                  <td style={{ color: 'var(--text-2)', fontSize: 12 }}>
                    {[p.brand, p.model].filter(Boolean).join(' / ') || '—'}
                  </td>
                  <td>
                    {p.unit ? (
                      <span className="badge badge-gray">{p.unit}</span>
                    ) : '—'}
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(p)}>
                        <Edit2 size={14} />
                      </button>
                      <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(p)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="Add Product to Catalog"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={handleCreate}
              disabled={createProduct.isPending || !cName || !cSku}
            >
              {createProduct.isPending ? 'Creating…' : 'Add Product'}
            </button>
          </>
        }
      >
        <ProductForm
          name={cName} setName={setCName} sku={cSku} setSku={setCSku}
          description={cDesc} setDescription={setCDesc} brand={cBrand} setBrand={setCBrand}
          model={cModel} setModel={setCModel} unit={cUnit} setUnit={setCUnit}
          categoryId={cCat} setCategoryId={setCCat} notes={cNotes} setNotes={setCNotes}
          categories={cats}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={`Edit — ${editTarget?.name}`}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setEditTarget(null)}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={handleUpdate}
              disabled={updateProduct.isPending || !eName}
            >
              {updateProduct.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </>
        }
      >
        <ProductForm
          name={eName} setName={setEName} sku={eSku} setSku={setESku}
          description={eDesc} setDescription={setEDesc} brand={eBrand} setBrand={setEBrand}
          model={eModel} setModel={setEModel} unit={eUnit} setUnit={setEUnit}
          categoryId={eCat} setCategoryId={setECat} notes={eNotes} setNotes={setENotes}
          categories={cats} isEdit
        />
      </Modal>
    </div>
  );
}