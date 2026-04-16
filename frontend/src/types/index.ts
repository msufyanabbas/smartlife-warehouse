export type Role = 'admin' | 'manager' | 'worker';
export type TransferStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type AssignmentStatus = 'active' | 'returned' | 'transferred';
export type ItemCondition = 'new' | 'good' | 'fair' | 'poor';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  department?: string;
  phone?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  description?: string;
  sku: string;
  category?: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  schemeNo: string;
  projectName: string;
  totalQuantity: number;
  availableQuantity: number;
  assignedQuantity: number;
  condition: ItemCondition;
  usedQuantity: number;
  location?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Assignment {
  id: string;
  assignedTo: User;
  assignedToId: string;
  assignedBy?: User;
  assignedById?: string;
  item: InventoryItem;
  itemId: string;
  quantity: number;
  status: AssignmentStatus;
  notes?: string;
  returnedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransferRequest {
  id: string;
  fromUser: User;
  fromUserId: string;
  toUser: User;
  toUserId: string;
  item: InventoryItem;
  itemId: string;
  sourceAssignmentId: string;
  quantity: number;
  status: TransferStatus;
  reason?: string;
  rejectionReason?: string;
  reviewedBy?: User;
  reviewedById?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryStats {
  totalItems: number;
  totalStock: number;
  totalAvailable: number;
  totalAssigned: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface ItemUsage {
  id: string;
  workerUser: User;
  workerUserId: string;
  item: InventoryItem;
  itemId: string;
  assignmentId: string;
  quantityUsed: number;
  taskNo: string;
  projectName: string;
  notes?: string;
  usedAt: string;
  createdAt: string;
  updatedAt: string;
}

export type ReturnStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface ReturnRequest {
  id: string;
  requestedBy: User;
  requestedById: string;
  item: InventoryItem;
  itemId: string;
  assignmentId: string;
  quantity: number;
  status: ReturnStatus;
  notes?: string;
  rejectionReason?: string;
  reviewedBy?: User;
  reviewedById?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type ItemRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface ItemRequest {
  id: string;
  requestedBy: User;
  requestedById: string;
  item: InventoryItem;
  itemId: string;
  quantity: number;
  reason?: string;
  status: ItemRequestStatus;
  rejectionReason?: string;
  reviewedBy?: User;
  reviewedById?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}