export type UserRole = 'OWNER' | 'MANAGER' | 'WORKER' | 'CLIENT';

export type ProjectStatus = 'PLANNING' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';

export type StageStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'DELAYED';

export type PaymentStatus = 'PLANNED' | 'PAID' | 'DELAYED';

export type RequestStatus = 'NEW' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';

export type RequestPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface User {
  id: number;
  email: string;
  fullName: string;
  phone?: string | null;
  role: UserRole;
  companyId?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Company {
  id: number;
  name: string;
  logo?: string | null;
  bankDetails?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: number;
  companyId: number;
  clientName: string;
  clientContact?: string | null;
  address: string;
  status: ProjectStatus;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  budget: number;
  spent: number;
  description?: string | null;
  createdById?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkStage {
  id: number;
  projectId: number;
  name: string;
  executorId?: number | null;
  startDate: string;
  endDate: string;
  status: StageStatus;
  comments?: string[] | null;
  executor?: User | null;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: number;
  projectId: number;
  description: string;
  plannedDate: string;
  plannedAmount: number;
  actualDate?: string | null;
  actualAmount: number;
  status: PaymentStatus;
  paidAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PhotoReport {
  id: number;
  projectId: number;
  stageId?: number | null;
  url: string;
  uploadedBy?: number | null;
  uploader?: User | null;
  stage?: WorkStage | null;
  createdAt: string;
}

export interface Estimate {
  id: number;
  number?: string | null;
  name: string;
  description?: string | null;
  estimateType: string;
  status: string;
  projectId?: number | null;
  materialsCost: number;
  laborCost: number;
  machinesCost: number;
  overheadCost: number;
  profitCost: number;
  totalCost: number;
  vatCost: number;
  totalWithVat: number;
  workCoef: number;
  materialCoef: number;
  overheadPercent: number;
  profitPercent: number;
  vatPercent: number;
  vatOnTop: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EstimateItem {
  id: number;
  estimateId: number;
  itemNumber?: string | null;
  name: string;
  unit: string;
  quantity: number;
  materialsPrice: number;
  laborPrice: number;
  machinesPrice: number;
  materialsTotal: number;
  laborTotal: number;
  machinesTotal: number;
  total: number;
  rowType: string;
  isWork: boolean;
  executorId?: number | null;
  executor?: User | null;
  doneAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CRMRequest {
  id: number;
  projectId: number;
  title: string;
  description?: string | null;
  status: RequestStatus;
  priority: RequestPriority;
  assignedTo?: number | null;
  assignee?: User | null;
  deadline?: string | null;
  createdAt: string;
  updatedAt: string;
}
