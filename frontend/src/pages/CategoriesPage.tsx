import { useState } from 'react';
import { Plus, ChevronRight, Edit2, Trash2, Tag, FolderOpen } from 'lucide-react';
import {
  useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory,
} from '../hooks/useApi';
import Modal from '../components/Modal';

interface Category {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  children?: Category[];
}

// ── Forms defined outside to prevent focus loss ────────────────────────────
function CategoryForm({
  name, setName,
  description, setDescription,
  parentId, setParentId,
  parents,
  showParent,
}: {
  name: string; setName: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  parentId: string; setParentId: (v: string) => void;
  parents: Category[];
  showParent: boolean;
}) {
  return (
    <>
      <div className="form-group">
        <label className="form-label">Category Name *</label>
        <input
          className="form-input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Safety Equipment"
          autoFocus
        />
      </div>
      <div className="form-group">
        <label className="form-label">Description</label>
        <input
          className="form-input"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Optional description"
        />
      </div>
      {showParent && (
        <div className="form-group">
          <label className="form-label">Parent Category (for subcategory)</label>
          <select className="form-input" value={parentId} onChange={e => setParentId(e.target.value)}>
            <option value="">— Top level category —</option>
            {parents.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {parentId && (
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
              This will be a subcategory under "{parents.find(p => p.id === parentId)?.name}"
            </p>
          )}
        </div>
      )}
    </>
  );
}

export default function CategoriesPage() {
  const { data: categories = [], isLoading } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Create form state
  const [cName, setCName] = useState('');
  const [cDesc, setCDesc] = useState('');
  const [cParent, setCParent] = useState('');

  // Edit form state
  const [eName, setEName] = useState('');
  const [eDesc, setEDesc] = useState('');
  const [eParent, setEParent] = useState('');

  const list = categories as Category[];

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const openCreate = () => {
    setCName(''); setCDesc(''); setCParent('');
    setShowCreate(true);
  };

  const openEdit = (cat: Category) => {
    setEName(cat.name);
    setEDesc(cat.description || '');
    setEParent(cat.parentId || '');
    setEditTarget(cat);
  };

  const handleCreate = async () => {
    await createCategory.mutateAsync({
      name: cName,
      description: cDesc || undefined,
      parentId: cParent || undefined,
    });
    setShowCreate(false);
  };

  const handleUpdate = async () => {
    if (!editTarget) return;
    await updateCategory.mutateAsync({
      id: editTarget.id,
      data: { name: eName, description: eDesc || undefined, parentId: eParent || undefined },
    });
    setEditTarget(null);
  };

  const handleDelete = async (cat: Category) => {
    if (!confirm(`Delete "${cat.name}"? This will also remove all subcategories.`)) return;
    await deleteCategory.mutateAsync(cat.id);
  };

  // Total count including subcategories
  const totalCount = list.reduce((s, c) => s + 1 + (c.children?.length || 0), 0);

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>Categories</h1>
          <p>{totalCount} categories · {list.length} top-level</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={15} /> Add Category
        </button>
      </div>

      {isLoading ? (
        <div className="empty-state"><Tag size={40} /><span>Loading…</span></div>
      ) : list.length === 0 ? (
        <div className="empty-state">
          <FolderOpen size={48} style={{ color: 'var(--text-3)' }} />
          <span>No categories yet</span>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 8 }}>
            Create categories to organize your products
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {list.map((cat, idx) => (
            <div key={cat.id}>
              {/* Top-level category row */}
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 20px',
                  borderBottom: idx < list.length - 1 || (expandedIds.has(cat.id) && (cat.children?.length ?? 0) > 0)
                    ? '1px solid var(--border)' : 'none',
                  background: 'var(--bg-2)',
                }}
              >
                {/* Expand toggle */}
                <button
                  onClick={() => cat.children?.length && toggleExpand(cat.id)}
                  style={{
                    background: 'none', border: 'none', cursor: cat.children?.length ? 'pointer' : 'default',
                    color: 'var(--text-3)', padding: 4, borderRadius: 4,
                    transform: expandedIds.has(cat.id) ? 'rotate(90deg)' : 'rotate(0)',
                    transition: 'transform 0.15s',
                    opacity: cat.children?.length ? 1 : 0,
                  }}
                >
                  <ChevronRight size={16} />
                </button>

                {/* Icon + name */}
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <FolderOpen size={15} style={{ color: 'var(--accent)' }} />
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{cat.name}</div>
                  {cat.description && (
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>{cat.description}</div>
                  )}
                </div>

                {/* Subcategory count */}
                {(cat.children?.length ?? 0) > 0 && (
                  <span className="badge badge-blue">
                    {cat.children!.length} sub{cat.children!.length > 1 ? 'categories' : 'category'}
                  </span>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setCName(''); setCDesc(''); setCParent(cat.id);
                      setShowCreate(true);
                    }}
                    title="Add subcategory"
                  >
                    <Plus size={13} /> Sub
                  </button>
                  <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(cat)}>
                    <Edit2 size={13} />
                  </button>
                  <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(cat)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Subcategories */}
              {expandedIds.has(cat.id) && cat.children?.map((sub, sIdx) => (
                <div
                  key={sub.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '11px 20px 11px 60px',
                    borderBottom: sIdx < cat.children!.length - 1 ? '1px solid var(--border)' : 'none',
                    background: 'var(--bg-3)',
                  }}
                >
                  <div style={{
                    width: 26, height: 26, borderRadius: 6,
                    background: 'var(--bg-4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Tag size={12} style={{ color: 'var(--text-3)' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--text)' }}>{sub.name}</div>
                    {sub.description && (
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{sub.description}</div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(sub)}>
                      <Edit2 size={13} />
                    </button>
                    <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(sub)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title={cParent ? `Add Subcategory under "${list.find(c => c.id === cParent)?.name}"` : 'Add Category'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={handleCreate}
              disabled={createCategory.isPending || !cName}
            >
              {createCategory.isPending ? 'Creating…' : 'Create Category'}
            </button>
          </>
        }
      >
        <CategoryForm
          name={cName} setName={setCName}
          description={cDesc} setDescription={setCDesc}
          parentId={cParent} setParentId={setCParent}
          parents={list}
          showParent={!cParent}
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
              disabled={updateCategory.isPending || !eName}
            >
              {updateCategory.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </>
        }
      >
        <CategoryForm
          name={eName} setName={setEName}
          description={eDesc} setDescription={setEDesc}
          parentId={eParent} setParentId={setEParent}
          parents={list.filter(c => c.id !== editTarget?.id)}
          showParent={!editTarget?.parentId}
        />
      </Modal>
    </div>
  );
}