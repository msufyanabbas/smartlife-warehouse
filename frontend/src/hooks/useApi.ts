import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';


// ── Inventory ──────────────────────────────────────────────────────────────
export const useInventory = () =>
  useQuery({
    queryKey: ['inventory'],
    queryFn: () => api.get('/inventory').then(r => r.data.data),
  });

export const useGrnReceipts = () =>
  useQuery({
    queryKey: ['grn-receipts'],
    queryFn: () => api.get('/inventory/grn-receipts').then(r => r.data.data),
  });

export const useInventoryStats = () =>
  useQuery({
    queryKey: ['inventory-stats'],
    queryFn: () => api.get('/inventory/stats').then(r => r.data.data),
  });

export const useCreateItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post('/inventory', data).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-stats'] });
      toast.success('Item created');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to create item'),
  });
};

export const useUpdateItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/inventory/${id}`, data).then(r => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['inventory-stats'] }); toast.success('Item updated'); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to update item'),
  });
};
export const useAddStock = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, quantity, receivedAt, schemeNo }: { id: string; quantity: number; receivedAt?: string; schemeNo: string }) =>
      api.patch(`/inventory/${id}/stock`, { quantity, receivedAt, schemeNo }).then(r => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['inventory-stats'] }); toast.success('Stock updated'); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
};

export const useRemoveStock = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, quantity, reason }: { id: string; quantity: number; reason?: string }) =>
      api.patch(`/inventory/${id}/remove-stock`, { quantity, reason }).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-stats'] });
      toast.success('Stock removed');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to remove stock'),
  });
};

export const useDeleteItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/inventory/${id}`).then(r => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['inventory-stats'] }); toast.success('Item removed'); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
};

// ── Users ──────────────────────────────────────────────────────────────────
export const useUsers = () =>
  useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data.data),
  });

export const useWorkers = () =>
  useQuery({
    queryKey: ['workers'],
    queryFn: () => api.get('/users/workers').then(r => r.data.data),
  });

export const useCreateUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post('/users', data).then(r => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); qc.invalidateQueries({ queryKey: ['workers'] }); toast.success('User created'); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
};

export const useUpdateUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/users/${id}`, data).then(r => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('User updated'); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
};

export const useDeactivateUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.put(`/users/${id}/deactivate`, {}).then(r => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('User deactivated'); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
};

export const useDeleteUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`).then(r => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('User deleted'); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to delete user'),
  });
};

// ── Assignments ────────────────────────────────────────────────────────────
/** Every assignment, returned ones included — needed to value a past period. */
export const useAssignmentHistory = () =>
  useQuery({
    queryKey: ['assignments-history'],
    queryFn: () => api.get('/assignments/history').then(r => r.data.data),
  });

export const useAssignments = () =>
  useQuery({
    queryKey: ['assignments'],
    queryFn: () => api.get('/assignments').then(r => r.data.data),
  });

export const useMyInventory = () =>
  useQuery({
    queryKey: ['my-inventory'],
    queryFn: () => api.get('/assignments/my-inventory').then(r => r.data.data),
  });

export const useCreateAssignment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post('/assignments', data).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-stats'] });
      toast.success('Items assigned successfully');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to assign'),
  });
};

export const useReturnAssignment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, quantity, notes }: { id: string; quantity: number; notes?: string }) =>
      api.patch(`/assignments/${id}/return`, { quantity, notes }).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments'] });
      qc.invalidateQueries({ queryKey: ['my-inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('Items returned successfully');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to return'),
  });
};

// ── Transfer Requests ──────────────────────────────────────────────────────
export const useTransferRequests = () =>
  useQuery({
    queryKey: ['transfers'],
    queryFn: () => api.get('/transfer-requests').then(r => r.data.data),
  });

export const usePendingTransfers = (enabled = true) =>
  useQuery({
    queryKey: ['transfers-pending'],
    queryFn: () => api.get('/transfer-requests/pending').then(r => r.data.data),
    refetchInterval: 15000,
    enabled,
  });

export const useCreateTransfer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post('/transfer-requests', data).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['my-inventory'] });
      toast.success('Transfer request submitted');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to submit transfer'),
  });
};

export const useReviewTransfer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, rejectionReason }: { id: string; action: 'approve' | 'reject'; rejectionReason?: string }) =>
      api.patch(`/transfer-requests/${id}/review`, { action, rejectionReason }).then(r => r.data.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['transfers-pending'] });
      qc.invalidateQueries({ queryKey: ['assignments'] });
      toast.success(vars.action === 'approve' ? 'Transfer approved ✓' : 'Transfer rejected');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
};

export const useCancelTransfer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch(`/transfer-requests/${id}/cancel`, {}).then(r => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transfers'] }); toast.success('Request cancelled'); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
};

// ── Item Usage ─────────────────────────────────────────────────────────────
export const useItemUsage = () =>
  useQuery({
    queryKey: ['item-usage'],
    queryFn: () => api.get('/item-usage').then(r => r.data.data),
  });

export const useAssignmentUsage = (assignmentId: string) =>
  useQuery({
    queryKey: ['item-usage', 'assignment', assignmentId],
    queryFn: () => api.get(`/item-usage/assignment/${assignmentId}`).then(r => r.data.data),
    enabled: !!assignmentId,
  });

export const useCreateUsage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post('/item-usage', data).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['item-usage'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('Usage logged successfully');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to log usage'),
  });
};

export const useDeleteUsage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/item-usage/${id}`).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['item-usage'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('Usage record deleted');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
};

export const useBulkImportInventory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: any[]) => api.post('/inventory/bulk-import', { items }).then(r => r.data.data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-stats'] });
      toast.success(`Imported ${result.created} items${result.skipped > 0 ? `, skipped ${result.skipped}` : ''}`);
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Import failed'),
  });
};

// ── Return Requests ────────────────────────────────────────────────────────
export const useReturnRequests = () =>
  useQuery({
    queryKey: ['return-requests'],
    queryFn: () => api.get('/return-requests').then(r => r.data.data),
  });

export const usePendingReturnRequests = (enabled = true) =>
  useQuery({
    queryKey: ['return-requests-pending'],
    queryFn: () => api.get('/return-requests/pending').then(r => r.data.data),
    refetchInterval: 15000,
    enabled,
  });

export const useCreateReturnRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post('/return-requests', data).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['return-requests'] });
      toast.success('Return request submitted — awaiting approval');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to submit return request'),
  });
};

export const useReviewReturnRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, rejectionReason }: { id: string; action: 'approve' | 'reject'; rejectionReason?: string }) =>
      api.patch(`/return-requests/${id}/review`, { action, rejectionReason }).then(r => r.data.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['return-requests'] });
      qc.invalidateQueries({ queryKey: ['return-requests-pending'] });
      qc.invalidateQueries({ queryKey: ['assignments'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-stats'] });
      toast.success(vars.action === 'approve' ? 'Return approved ✓' : 'Return rejected');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
};

export const useCancelReturnRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch(`/return-requests/${id}/cancel`, {}).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['return-requests'] });
      toast.success('Return request cancelled');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
};

// ── Item Requests ──────────────────────────────────────────────────────────
export const useItemRequests = () =>
  useQuery({
    queryKey: ['item-requests'],
    queryFn: () => api.get('/item-requests').then(r => r.data.data),
  });

export const usePendingItemRequests = (enabled = true) =>
  useQuery({
    queryKey: ['item-requests-pending'],
    queryFn: () => api.get('/item-requests/pending').then(r => r.data.data),
    refetchInterval: 15000,
    enabled,
  });

export const useCreateItemRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post('/item-requests', data).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['item-requests'] });
      toast.success('Request submitted — awaiting manager approval');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to submit request'),
  });
};

export const useReviewItemRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, rejectionReason }: { id: string; action: 'approve' | 'reject'; rejectionReason?: string }) =>
      api.patch(`/item-requests/${id}/review`, { action, rejectionReason }).then(r => r.data.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['item-requests'] });
      qc.invalidateQueries({ queryKey: ['item-requests-pending'] });
      qc.invalidateQueries({ queryKey: ['assignments'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-stats'] });
      toast.success(vars.action === 'approve' ? 'Request approved — items assigned ✓' : 'Request rejected');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
};

export const useCancelItemRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch(`/item-requests/${id}/cancel`, {}).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['item-requests'] });
      toast.success('Request cancelled');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
};

// ── Excel Export Utility ───────────────────────────────────────────────────
export const useAllAssignments = () =>
  useQuery({
    queryKey: ['all-assignments'],
    queryFn: () => api.get('/assignments').then(r => r.data.data),
  });

// ── Categories ─────────────────────────────────────────────────────────────
export const useCategories = () =>
  useQuery({ queryKey: ['categories'], queryFn: () => api.get('/categories').then(r => r.data.data) });

export const useCategoriesFlat = () =>
  useQuery({ queryKey: ['categories-flat'], queryFn: () => api.get('/categories/flat').then(r => r.data.data) });

export const useCreateCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post('/categories', data).then(r => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); qc.invalidateQueries({ queryKey: ['categories-flat'] }); toast.success('Category created'); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
};

export const useUpdateCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/categories/${id}`, data).then(r => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); qc.invalidateQueries({ queryKey: ['categories-flat'] }); toast.success('Category updated'); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
};

export const useDeleteCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/categories/${id}`).then(r => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); qc.invalidateQueries({ queryKey: ['categories-flat'] }); toast.success('Category removed'); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
};

// ── Products ───────────────────────────────────────────────────────────────
export const useProducts = (search?: string, categoryId?: string) =>
  useQuery({
    queryKey: ['products', search, categoryId],
    queryFn: () => api.get('/products', { params: { search, categoryId } }).then(r => r.data.data),
  });

export const useProductSearch = (q: string) =>
  useQuery({
    queryKey: ['products-search', q],
    queryFn: () => api.get('/products/search', { params: { q } }).then(r => r.data.data),
    enabled: q.length >= 1,
  });

export const useCreateProduct = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post('/products', data).then(r => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast.success('Product created'); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
};

export const useUpdateProduct = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      api.put(`/products/${id}`, data).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });  // ← must be here
      toast.success('Product updated');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
};

export const useDeleteProduct = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}`).then(r => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast.success('Product removed'); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
};

// ── Assigned / Used Report ─────────────────────────────────────────────────
export const useAssignedUsedReport = () =>
  useQuery({
    queryKey: ['assigned-used-report'],
    queryFn: () => api.get('/assignments/report').then(r => r.data.data),
  });

// ── Document forms (GRN / Assignment / Transfer) ───────────────────────────
// All three modules expose the same REST shape; the shared bodies below keep
// the hooks themselves thin while staying lint-legal call sites.
const listDocuments = (resource: string) => api.get(`/${resource}`).then(r => r.data.data);
const getDocument = (resource: string, id?: string) => api.get(`/${resource}/${id}`).then(r => r.data.data);

// Completing a document mutates inventory (GRN creates/updates rows, assignment
// forms issue stock, transfer forms re-home it), so every save refreshes the
// inventory-derived caches. The success toast is left to the page, which knows
// the concrete outcome (how many items, to whom / where).
const onDocumentSaved = (qc: ReturnType<typeof useQueryClient>, resource: string) => {
  qc.invalidateQueries({ queryKey: [resource] });
  qc.invalidateQueries({ queryKey: ['inventory'] });
  qc.invalidateQueries({ queryKey: ['inventory-stats'] });
  // Completing a GRN stamps grnId onto inventory rows, so the receipts feed moves too.
  if (resource === 'grn') qc.invalidateQueries({ queryKey: ['grn-receipts'] });
  // Issuing an assignment form opens assignment records. `assignments-history` is
  // a separate key, not a child of `assignments`, so it has to be named — the
  // stock report reads it, and without this its Assigned column stays stale.
  if (resource === 'assignment-forms') {
    qc.invalidateQueries({ queryKey: ['assignments'] });
    qc.invalidateQueries({ queryKey: ['assignments-history'] });
    qc.invalidateQueries({ queryKey: ['my-inventory'] });
  }
};

// The API collapses field-level validation failures into a bare "Validation
// failed" and puts the detail in `errors`, so surface that instead.
const documentError = (fallback: string) => (e: any) => {
  const { errors, message } = e.response?.data ?? {};
  toast.error(Array.isArray(errors) && errors.length ? errors.join(', ') : message || fallback);
};

// GRN
export const useGrnList = () =>
  useQuery({ queryKey: ['grn'], queryFn: () => listDocuments('grn') });

export const useGrn = (id?: string) =>
  useQuery({ queryKey: ['grn', id], queryFn: () => getDocument('grn', id), enabled: !!id });

export const useCreateGrn = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post('/grn', data).then(r => r.data.data),
    onSuccess: () => onDocumentSaved(qc, 'grn'),
    onError: documentError('Failed to create GRN'),
  });
};

export const useUpdateGrn = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/grn/${id}`, data).then(r => r.data.data),
    onSuccess: () => onDocumentSaved(qc, 'grn'),
    onError: documentError('Failed to save GRN'),
  });
};

// Assignment forms
export const useAssignmentForms = () =>
  useQuery({ queryKey: ['assignment-forms'], queryFn: () => listDocuments('assignment-forms') });

export const useAssignmentForm = (id?: string) =>
  useQuery({
    queryKey: ['assignment-forms', id],
    queryFn: () => getDocument('assignment-forms', id),
    enabled: !!id,
  });

export const useCreateAssignmentForm = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post('/assignment-forms', data).then(r => r.data.data),
    onSuccess: () => onDocumentSaved(qc, 'assignment-forms'),
    onError: documentError('Failed to create assignment form'),
  });
};

export const useUpdateAssignmentForm = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      api.put(`/assignment-forms/${id}`, data).then(r => r.data.data),
    onSuccess: () => onDocumentSaved(qc, 'assignment-forms'),
    onError: documentError('Failed to save assignment form'),
  });
};

// Transfer forms
export const useTransferForms = () =>
  useQuery({ queryKey: ['transfer-forms'], queryFn: () => listDocuments('transfer-forms') });

export const useTransferForm = (id?: string) =>
  useQuery({
    queryKey: ['transfer-forms', id],
    queryFn: () => getDocument('transfer-forms', id),
    enabled: !!id,
  });

export const useCreateTransferForm = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post('/transfer-forms', data).then(r => r.data.data),
    onSuccess: () => onDocumentSaved(qc, 'transfer-forms'),
    onError: documentError('Failed to create transfer form'),
  });
};

export const useUpdateTransferForm = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      api.put(`/transfer-forms/${id}`, data).then(r => r.data.data),
    onSuccess: () => onDocumentSaved(qc, 'transfer-forms'),
    onError: documentError('Failed to save transfer form'),
  });
};