import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';

// ── Inventory ──────────────────────────────────────────────────────────────
export const useInventory = () =>
  useQuery({
    queryKey: ['inventory'],
    queryFn: () => api.get('/inventory').then(r => r.data.data),
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); toast.success('Item created'); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to create item'),
  });
};

export const useUpdateItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/inventory/${id}`, data).then(r => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); toast.success('Item updated'); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to update item'),
  });
};

export const useAddStock = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) =>
      api.patch(`/inventory/${id}/stock`, { quantity }).then(r => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['inventory-stats'] }); toast.success('Stock updated'); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });
};

export const useDeleteItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/inventory/${id}`).then(r => r.data.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); toast.success('Item removed'); },
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