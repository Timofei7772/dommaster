export type UserRole = 'OWNER' | 'MANAGER' | 'WORKER' | 'CLIENT';

export type ProjectStatus = 'PLANNING' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';

export type StageStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'DELAYED';

export type PaymentStatus = 'PLANNED' | 'PAID' | 'DELAYED';

export type RequestStatus = 'NEW' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';

export type RequestPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface UserDTO {
  id: number;
  email: string;
  fullName: string;
  phone?: string | null;
  role: UserRole;
  companyId?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyDTO {
  id: number;
  name: string;
  logo?: string | null;
  bankDetails?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectDTO {
  id: number;
  companyId: number;
  clientName: string;
  clientContact?: string | null;
  address: string;
  status: ProjectStatus;
  plannedStart?: Date | null;
  plannedEnd?: Date | null;
  actualStart?: Date | null;
  actualEnd?: Date | null;
  budget: number;
  spent: number;
  description?: string | null;
  createdById?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkStageDTO {
  id: number;
  projectId: number;
  name: string;
  executorId?: number | null;
  startDate: Date;
  endDate: Date;
  status: StageStatus;
  comments?: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentDTO {
  id: number;
  projectId: number;
  description: string;
  plannedDate: Date;
  plannedAmount: number;
  actualDate?: Date | null;
  actualAmount: number;
  status: PaymentStatus;
  paidAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PhotoReportDTO {
  id: number;
  projectId: number;
  stageId?: number | null;
  url: string;
  uploadedBy?: number | null;
  createdAt: Date;
}

export interface EstimateDTO {
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
  createdAt: Date;
  updatedAt: Date;
}

export interface EstimateItemDTO {
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
  doneAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CRMRequestDTO {
  id: number;
  projectId: number;
  title: string;
  description?: string | null;
  status: RequestStatus;
  priority: RequestPriority;
  assignedTo?: number | null;
  deadline?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
