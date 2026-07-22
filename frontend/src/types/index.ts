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

// ── Document forms ─────────────────────────────────────────────────────────
export interface GrnDocument {
  id: string;
  grnNo: string;
  supplierName?: string;
  purchaseOrderNo?: string;
  dateOfReceipt?: string;
  deliveryNoteNo?: string;
  location?: string;
  receivedBy?: User;
  receivedById?: string;
  projectName?: string;
  schemeNo?: string;
  conditionOnArrival: 'Good' | 'Damaged' | 'Partial' | 'Rejected';
  notes?: string;
  status: 'draft' | 'completed';
  items: GrnLineItem[];
  createdAt: string;
  updatedAt: string;
}

export interface GrnLineItem {
  itemCode: string;
  itemDescription: string;
  unit: string;
  orderedQty: number;
  receivedQty: number;
  serialNumber: string;
  productId?: string;
}

export interface AssignmentForm {
  id: string;
  assignmentNo: string;
  date?: string;
  priority: 'Normal' | 'High' | 'Urgent';
  requestedBy?: User;
  requestedById?: string;
  department?: string;
  projectSite?: string;
  purposeDescription?: string;
  assignedTo?: User;
  assignedToId?: string;
  notes?: string;
  status: 'draft' | 'approved' | 'issued';
  items: AssignmentFormLineItem[];
  createdAt: string;
  updatedAt: string;
}

export interface AssignmentFormLineItem {
  itemCode: string;
  itemDescription: string;
  unit: string;
  stockAvailable: number;
  qtyRequested: number;
  qtyApproved: number;
  qtyIssued: number;
  serialNumber: string;
  itemId?: string;
}

export interface TransferForm {
  id: string;
  transferNo: string;
  fromWarehouse?: string;
  fromProjectSite?: string;
  issuedBy?: User;
  issuedById?: string;
  transferDate?: string;
  toWarehouse?: string;
  toProjectSite?: string;
  receivedBy?: User;
  receivedById?: string;
  reasonForTransfer?: string;
  approvedBy?: User;
  approvedById?: string;
  notes?: string;
  status: 'draft' | 'approved' | 'completed';
  items: TransferFormLineItem[];
  createdAt: string;
  updatedAt: string;
}

export interface TransferFormLineItem {
  itemCode: string;
  itemDescription: string;
  unit: string;
  stockQty: number;
  qtyToTransfer: number;
  serialNumber: string;
  itemId?: string;
}

export type MicItemStatus = 'Installed' | 'Partial' | 'Pending' | 'Damaged';
export type MicStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected';

export interface MicDocument {
  id: string;
  micNo: string;
  assignmentNo?: string;
  date?: string;
  siteId?: string;
  projectClient?: string;
  installDepartment?: string;
  verifiedBy?: User;
  verifiedById?: string;
  purposeDescription?: string;
  installedBy?: User;
  installedById?: string;
  status: MicStatus;
  approvedBy?: User;
  approvedById?: string;
  approvedAt?: string;
  rejectionReason?: string;
  items: MicLineItem[];
  createdAt: string;
  updatedAt: string;
}

export interface MicLineItem {
  itemCode: string;
  itemDescription: string;
  unit: string;
  qtyReceived: number;
  qtyInstalled: number;
  serialNumbers: string;
  installDate: string;
  status: MicItemStatus;
  itemId?: string;
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