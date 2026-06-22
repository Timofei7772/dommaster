/**
 * API Adapter - Универсальный слой для работы с данными
 * В Electron: использует IPC для доступа к локальной БД
 * В браузере: использует mock данные для разработки
 */

import { isElectron, getElectronAPI, type Project, type Estimate, type Contract, type KS2Act, type KS2Item, type KS3Cert, type M29Doc, type EstimateItem, type DocumentContext, type EstimateDocumentSnapshot, type AdditionalAgreementTypeType, type AgreementGenerationData } from './electron'
import * as gemini from './ai-providers'

// =============== Типы для экспорта ===============

export interface CreateEstimateDto {
  name: string
  number?: string
  estimate_type?: string
  description?: string
  project_id?: number
  overhead_percent?: number
  profit_percent?: number
  vat_percent?: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// =============== Mock данные для разработки в браузере ===============

const mockProjects: Project[] = [
  {
    id: 1,
    name: 'Жилой комплекс "Солнечный"',
    address: 'г. Москва, ул. Ленина, 15',
    client_name: 'ООО СтройИнвест',
    status: 'active',
    created_at: '2024-01-15',
    updated_at: '2024-01-20',
    estimates_count: 3,
    contracts_count: 1,
    total_amount: 15000000
  },
  {
    id: 2,
    name: 'Торговый центр "Меркурий"',
    address: 'г. Москва, пр. Мира, 42',
    client_name: 'ИП Иванов И.И.',
    status: 'active',
    created_at: '2024-02-01',
    updated_at: '2024-02-10',
    estimates_count: 5,
    contracts_count: 2,
    total_amount: 45000000
  }
]

const mockEstimates: Estimate[] = [
  {
    id: 1,
    project_id: 1,
    number: 'ЛС-001',
    name: 'Локальная смета на общестроительные работы',
    estimate_type: 'local',
    status: 'approved',
    overhead_percent: 120,
    profit_percent: 65,
    vat_percent: 20,
    total_materials: 2500000,
    total_works: 1800000,
    total_overhead: 2160000,
    total_profit: 1170000,
    total_without_vat: 7630000,
    total_vat: 1526000,
    total_with_vat: 9156000,
    created_at: '2024-01-16',
    updated_at: '2024-01-18',
    project_name: 'Жилой комплекс "Солнечный"'
  },
  {
    id: 2,
    project_id: 1,
    number: 'ЛС-002',
    name: 'Локальная смета на электромонтажные работы',
    estimate_type: 'local',
    status: 'draft',
    overhead_percent: 95,
    profit_percent: 50,
    vat_percent: 20,
    total_materials: 800000,
    total_works: 450000,
    total_overhead: 427500,
    total_profit: 225000,
    total_without_vat: 1902500,
    total_vat: 380500,
    total_with_vat: 2283000,
    created_at: '2024-01-20',
    updated_at: '2024-01-20',
    project_name: 'Жилой комплекс "Солнечный"'
  }
]

const mockEstimateItems: EstimateItem[] = []

const mockContracts: Contract[] = [
  {
    id: 1,
    project_id: 1,
    number: 'Д-2024/001',
    date: '2024-01-10',
    contract_type: 'contract',
    amount: 15000000,
    paid_amount: 4500000,
    prepayment_percent: 30,
    status: 'active',
    created_at: '2024-01-10',
    updated_at: '2024-01-10',
    project_name: 'Жилой комплекс "Солнечный"',
    client_name: 'ООО СтройИнвест'
  }
]

const mockKS2: KS2Act[] = [
  {
    id: 1,
    project_id: 1,
    estimate_id: 1,
    number: 'КС-2 №1',
    date: '2024-02-01',
    period_from: '2024-01-01',
    period_to: '2024-01-31',
    amount: 2500000,
    status: 'signed',
    created_at: '2024-02-01',
    project_name: 'Жилой комплекс "Солнечный"',
    estimate_number: 'ЛС-001'
  }
]

const mockKS2Items: KS2Item[] = []

const mockKS3: KS3Cert[] = [
  {
    id: 1,
    project_id: 1,
    number: 'КС-3 №1',
    date: '2024-02-01',
    period_from: '2024-01-01',
    period_to: '2024-01-31',
    amount_without_vat: 2500000,
    vat_amount: 500000,
    amount: 3000000,
    status: 'signed',
    created_at: '2024-02-01',
    project_name: 'Жилой комплекс "Солнечный"'
  }
]

const mockM29: M29Doc[] = [
  {
    id: 1,
    project_id: 1,
    number: 'М-29 №1',
    date: '2024-02-05',
    period: 'Январь 2024',
    total_norm_cost: 1200000,
    total_actual_cost: 1150000,
    total_deviation: -50000,
    status: 'approved',
    created_at: '2024-02-05',
    project_name: 'Жилой комплекс "Солнечный"'
  }
]

// =============== API функции ===============

export const api = {
  // === Проекты ===
  projects: {
    async getAll(): Promise<Project[]> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.projects.getAll()
      }
      return mockProjects
    },

    async get(id: number): Promise<Project | null> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.projects.get(id)
      }
      return mockProjects.find(p => p.id === id) || null
    },

    async create(data: Partial<Project>): Promise<{ id: number; folder_path: string }> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.projects.create(data)
      }
      const newId = Math.max(...mockProjects.map(p => p.id)) + 1
      const newProject: Project = {
        id: newId,
        name: data.name || 'Новый проект',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...data as any
      }
      mockProjects.push(newProject)
      return { id: newId, folder_path: '' }
    },

    async update(id: number, data: Partial<Project>): Promise<void> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.projects.update(id, data)
      }
      const idx = mockProjects.findIndex(p => p.id === id)
      if (idx >= 0) {
        mockProjects[idx] = { ...mockProjects[idx], ...data }
      }
    },

    async delete(id: number): Promise<void> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.projects.delete(id)
      }
      const idx = mockProjects.findIndex(p => p.id === id)
      if (idx >= 0) {
        mockProjects.splice(idx, 1)
      }
    }
  },

  // === Сметы ===
  estimates: {
    async getAll(projectId?: number): Promise<Estimate[]> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.estimates.getAll(projectId)
      }
      return projectId
        ? mockEstimates.filter(e => e.project_id === projectId)
        : mockEstimates
    },

    async get(id: number): Promise<Estimate | null> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.estimates.get(id)
      }
      return mockEstimates.find(e => e.id === id) || null
    },

    async create(data: Partial<Estimate>): Promise<{ id: number }> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.estimates.create(data)
      }
      const newId = Math.max(...mockEstimates.map(e => e.id), 0) + 1
      const newEstimate: Estimate = {
        id: newId,
        number: data.number || `ЛС-${newId.toString().padStart(3, '0')}`,
        name: data.name || 'Новая смета',
        estimate_type: 'local',
        status: 'draft',
        overhead_percent: 120,
        profit_percent: 65,
        vat_percent: 20,
        total_materials: 0,
        total_works: 0,
        total_overhead: 0,
        total_profit: 0,
        total_without_vat: 0,
        total_vat: 0,
        total_with_vat: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...data as any
      }
      mockEstimates.push(newEstimate)
      return { id: newId }
    },

    async update(id: number, data: Partial<Estimate>): Promise<void> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.estimates.update(id, data)
      }
      const idx = mockEstimates.findIndex(e => e.id === id)
      if (idx >= 0) {
        mockEstimates[idx] = { ...mockEstimates[idx], ...data }
      }
    },

    async getItems(id: number): Promise<EstimateItem[]> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.estimateItems.getAll(id)
      }
      return mockEstimateItems.filter(i => i.estimate_id === id)
    },

    async delete(id: number): Promise<void> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.estimates.delete(id)
      }
      const idx = mockEstimates.findIndex(e => e.id === id)
      if (idx >= 0) {
        mockEstimates.splice(idx, 1)
      }
    }
  },

  // === Позиции сметы ===
  estimateItems: {
    async getAll(estimateId: number): Promise<EstimateItem[]> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.estimateItems.getAll(estimateId)
      }
      return mockEstimateItems.filter(i => i.estimate_id === estimateId)
    },

    async add(estimateId: number, data: any): Promise<{ id: number }> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.estimateItems.add(estimateId, data)
      }
      const newId = Date.now()
      const materialsCost = data.materials_cost || data.material_price || 0
      const laborCost = data.labor_cost || data.labor_price || 0
      const quantity = data.quantity || 0

      const newItem: EstimateItem = {
        id: newId,
        estimate_id: estimateId,
        name: data.name || '',
        unit: data.unit || 'шт',
        quantity: quantity,
        price: materialsCost + laborCost,
        item_type: 'work',
        total: (materialsCost + laborCost) * quantity,

        // Поля совместимости
        masterPrice: materialsCost + laborCost,
        materials_total: materialsCost * quantity,
        labor_total: laborCost * quantity,
        note: data.note || '',
        code: data.code || '',

        // Сохраняем переданные поля
        ...data
      }
      mockEstimateItems.push(newItem)
      return { id: newId }
    },

    async update(id: number, data: Partial<EstimateItem>): Promise<void> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.estimateItems.update(id, data)
      }
      const idx = mockEstimateItems.findIndex(i => i.id === id)
      if (idx >= 0) {
        mockEstimateItems[idx] = { ...mockEstimateItems[idx], ...data }
      }
    },

    async delete(id: number): Promise<void> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.estimateItems.delete(id)
      }
      const idx = mockEstimateItems.findIndex(i => i.id === id)
      if (idx >= 0) {
        mockEstimateItems.splice(idx, 1)
      }
    }
  },

  // === Договоры ===
  contracts: {
    async getAll(projectId?: number): Promise<Contract[]> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.contracts.getAll(projectId)
      }
      return projectId
        ? mockContracts.filter(c => c.project_id === projectId)
        : mockContracts
    },

    async create(data: Partial<Contract> & { estimate_id?: number }): Promise<{ id: number }> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.contracts.create(data)
      }
      const newId = Math.max(...mockContracts.map(c => c.id), 0) + 1
      const newContract: Contract = {
        id: newId,
        number: data.number || `Д-${new Date().getFullYear()}/${newId.toString().padStart(3, '0')}`,
        date: new Date().toISOString().split('T')[0],
        contract_type: 'contract',
        total_amount: 0,
        paid_amount: 0,
        prepayment_percent: 30,
        status: 'draft',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...data as any
      }
      mockContracts.push(newContract)
      return { id: newId }
    },

    async update(id: number, data: Partial<Contract>): Promise<void> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.contracts.update(id, data)
      }
      const idx = mockContracts.findIndex(c => c.id === id)
      if (idx >= 0) {
        mockContracts[idx] = { ...mockContracts[idx], ...data }
      }
    },

    async delete(id: number): Promise<void> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.contracts.delete(id)
      }
      const idx = mockContracts.findIndex(c => c.id === id)
      if (idx >= 0) {
        mockContracts.splice(idx, 1)
      }
    }
  },

  // === КС-2 ===
  ks2: {
    async getAll(projectId?: number): Promise<KS2Act[]> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.ks2.getAll(projectId)
      }
      return projectId
        ? mockKS2.filter(k => k.project_id === projectId)
        : mockKS2
    },

    async create(data: Partial<KS2Act>): Promise<{ id: number }> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.ks2.create(data)
      }
      const newId = Math.max(...mockKS2.map(k => k.id), 0) + 1
      mockKS2.push({
        id: newId,
        number: `КС-2 №${newId}`,
        date: new Date().toISOString().split('T')[0],
        amount: 0,
        status: 'draft',
        created_at: new Date().toISOString(),
        ...data
      } as KS2Act)
      return { id: newId }
    },

    async delete(id: number): Promise<void> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.ks2.delete(id)
      }
      const idx = mockKS2.findIndex(k => k.id === id)
      if (idx >= 0) {
        mockKS2.splice(idx, 1)
      }
    },

    async getItems(id: number): Promise<KS2Item[]> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.ks2.getItems(id)
      }
      return mockKS2Items.filter(i => i.ks2_act_id === id)
    },

    async createItem(data: Partial<KS2Item>): Promise<KS2Item> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.ks2.createItem(data)
      }
      const newId = Math.max(...mockKS2Items.map(i => i.id), 0) + 1
      const item: KS2Item = {
        id: newId,
        ks2_act_id: data.ks2_act_id!,
        name: data.name || '',
        unit_price: data.unit_price || 0,
        quantity_estimate: data.quantity_estimate || 0,
        quantity_act: data.quantity_act || 0,
        total_price: (data.quantity_act || 0) * (data.unit_price || 0),
        created_at: new Date().toISOString(),
        ...data as any
      }
      mockKS2Items.push(item)
      return item
    },

    async deleteItem(id: number): Promise<void> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.ks2.deleteItem(id)
      }
      const idx = mockKS2Items.findIndex(i => i.id === id)
      if (idx >= 0) mockKS2Items.splice(idx, 1)
    }
  },

  // === КС-3 ===
  ks3: {
    async getAll(projectId?: number): Promise<KS3Cert[]> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.ks3.getAll(projectId)
      }
      return projectId
        ? mockKS3.filter(k => k.project_id === projectId)
        : mockKS3
    },

    async create(data: Partial<KS3Cert>): Promise<{ id: number }> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.ks3.create(data)
      }
      const newId = Math.max(...mockKS3.map(k => k.id), 0) + 1
      mockKS3.push({
        id: newId,
        number: `КС-3 №${newId}`,
        date: new Date().toISOString().split('T')[0],
        amount_without_vat: 0,
        vat_amount: 0,
        amount: 0,
        status: 'draft',
        created_at: new Date().toISOString(),
        ...data
      } as KS3Cert)
      return { id: newId }
    },

    async delete(id: number): Promise<void> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.ks3.delete(id)
      }
      const idx = mockKS3.findIndex(k => k.id === id)
      if (idx >= 0) {
        mockKS3.splice(idx, 1)
      }
    }
  },

  // === М-29 ===
  m29: {
    async getAll(projectId?: number): Promise<M29Doc[]> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.m29.getAll(projectId)
      }
      return projectId
        ? mockM29.filter(m => m.project_id === projectId)
        : mockM29
    },

    async create(data: Partial<M29Doc>): Promise<{ id: number }> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.m29.create(data)
      }
      const newId = Math.max(...mockM29.map(m => m.id), 0) + 1
      mockM29.push({
        id: newId,
        number: `М-29 №${newId}`,
        date: new Date().toISOString().split('T')[0],
        total_norm_cost: 0,
        total_actual_cost: 0,
        total_deviation: 0,
        status: 'draft',
        created_at: new Date().toISOString(),
        ...data
      } as M29Doc)
      return { id: newId }
    }
  },

  // === Документы ===
  docs: {
    async generateEstimate(estimateId: number): Promise<{ path: string }> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.docs.generateEstimate(estimateId)
      }
      alert('Генерация документов доступна только в Desktop версии')
      return { path: '' }
    },

    async generateKS2(actId: number): Promise<{ path: string }> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.docs.generateKS2(actId)
      }
      alert('Генерация документов доступна только в Desktop версии')
      return { path: '' }
    },

    async generateKS3(certId: number): Promise<{ path: string }> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.docs.generateKS3(certId)
      }
      alert('Генерация документов доступна только в Desktop версии')
      return { path: '' }
    },

    async generateFOT(estimateId: number): Promise<{ path: string }> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.docs.generateFOT(estimateId)
      }
      alert('Генерация документов доступна только в Desktop версии')
      return { path: '' }
    },

    async generateContract(contractId: number): Promise<{ path: string }> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.docs.generateContract(contractId)
      }
      alert('Генерация документов доступна только в Desktop версии')
      return { path: '' }
    },


    async generateContractFromTemplate(contractId: number, templateId: string): Promise<{ path: string }> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.docs.generateContractFromTemplate(contractId, templateId)
      }
      alert('Генерация документов доступна только в Desktop версии')
      return { path: '' }
    },

    async generateAgreement(
      contractId: number,
      agreementType: AdditionalAgreementTypeType,
      agreementData: AgreementGenerationData = {}
    ): Promise<{ path: string }> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        if (electronAPI.docs.generateAgreement) {
          return electronAPI.docs.generateAgreement(contractId, agreementType, agreementData)
        }
      }
      alert('Генерация документов доступна только в Desktop версии')
      return { path: '' }
    },

    async generateInvoice(
      estimateId: number,
      invoiceData: { number?: string; date?: string; client_name?: string; client_address?: string }
    ): Promise<{ path: string }> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.docs.generateInvoice(estimateId, invoiceData)
      }
      alert('Генерация документов доступна только в Desktop версии')
      return { path: '' }
    },


    async generateM29(m29Id: number): Promise<{ path: string }> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.docs.generateM29(m29Id)
      }
      alert('Генерация документов доступна только в Desktop версии')
      return { path: '' }
    },

    async generateDefektovka(estimateId: number): Promise<{ path: string }> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.docs.generateDefektovka(estimateId)
      }
      alert('Генерация документов доступна только в Desktop версии')
      return { path: '' }
    },

    async generateMaterialRequest(estimateId: number): Promise<{ path: string }> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.docs.generateMaterialRequest(estimateId)
      }
      alert('Генерация документов доступна только в Desktop версии')
      return { path: '' }
    },

    async generateEstimatePDF(estimateId: number): Promise<{ path: string }> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        if (electronAPI.docs.generateEstimatePDF) {
          return electronAPI.docs.generateEstimatePDF(estimateId)
        }
        return electronAPI.docs.generateEstimate(estimateId)
      }
      alert('Генерация документов доступна только в Desktop версии')
      return { path: '' }
    },

    async generatePackage(estimateId: number): Promise<{ folder: string; generated: Array<{ type: string; path: string }>; errors: string[] }> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        if (electronAPI.docs.generatePackage) {
          return electronAPI.docs.generatePackage(estimateId)
        }
      }
      alert('Генерация документов доступна только в Desktop версии')
      return { folder: '', generated: [], errors: [] }
    },

    async getEstimateContext(estimateId: number): Promise<DocumentContext | null> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        if (electronAPI.docs.getEstimateContext) {
          return electronAPI.docs.getEstimateContext(estimateId)
        }
      }
      return null
    },

    async getEstimateSnapshot(estimateId: number, options?: { templateVersion?: string; generatedAt?: string }): Promise<EstimateDocumentSnapshot | null> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        if (electronAPI.docs.getEstimateSnapshot) {
          return electronAPI.docs.getEstimateSnapshot(estimateId, options)
        }
      }
      return null
    }
  },

  diagnostics: {
    async openLogsFolder(): Promise<{ path?: string } | void> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        if (electronAPI.diagnostics?.openLogsFolder) {
          return electronAPI.diagnostics.openLogsFolder()
        }
      }
      alert('Диагностика доступна только в Desktop версии')
      return undefined
    },

    async exportBundle(): Promise<{ path: string }> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        if (electronAPI.diagnostics?.exportBundle) {
          return electronAPI.diagnostics.exportBundle()
        }
      }
      alert('Диагностика доступна только в Desktop версии')
      return { path: '' }
    },
  },

  // === Shell ===
  shell: {
    async openPath(path: string): Promise<void> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.shell.openPath(path)
      }
      console.log('openPath:', path)
    },

    async showItemInFolder(path: string): Promise<void> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.shell.showItemInFolder(path)
      }
      console.log('showItemInFolder:', path)
    },

    async openExternal(url: string): Promise<void> {
      if (isElectron()) {
        const electronAPI = getElectronAPI()!
        return electronAPI.shell.openExternal(url)
      }
      window.open(url, '_blank')
    }
  }
}

export default api

// =============== Обратная совместимость со старым API ===============
// Это позволяет существующим компонентам работать без изменений

export const estimatesApi = {
  list: async (params?: { page?: number; search?: string; status?: string; estimate_type?: string }) => {
    const data = await api.estimates.getAll()
    let filtered = data
    if (params?.search) {
      const s = params.search.toLowerCase()
      filtered = filtered.filter(e =>
        e.name.toLowerCase().includes(s) ||
        e.number.toLowerCase().includes(s)
      )
    }
    if (params?.status) {
      filtered = filtered.filter(e => e.status === params.status)
    }
    if (params?.estimate_type) {
      filtered = filtered.filter(e => (e.estimate_type || 'local') === params.estimate_type)
    }
    return { data: { items: filtered, total: filtered.length, page: 1, pages: 1 } }
  },
  get: async (id: number) => {
    const data = await api.estimates.get(id)
    return { data }
  },
  create: async (data: any) => {
    const result = await api.estimates.create(data)
    return { data: { id: result.id } }
  },
  update: async (id: number, data: any) => {
    await api.estimates.update(id, data)
    return { data: { success: true } }
  },
  delete: async (id: number) => {
    await api.estimates.delete(id)
    return { data: { success: true } }
  },
  getItems: async (id: number) => {
    // Используем новое API для получения элементов
    const data = await api.estimateItems.getAll(id)
    return { data }
  },
  addItem: async (id: number, data: any) => {
    // Используем новое API для добавления
    const result = await api.estimateItems.add(id, data)
    return { data: { id: result.id } }
  },
  recalculate: async (id: number) => {
    if (isElectron()) {
      const electronAPI = getElectronAPI()!
      const result = await (electronAPI as any).estimates.recalculate(id)
      return { data: result }
    }
    return { data: {} }
  },
  copy: async () => ({ data: { id: 0 } }), // TODO: implement estimate copy
  approve: async () => ({ data: {} }) // TODO: implement estimate approve
}

export const projectsApi = {
  list: async () => {
    const data = await api.projects.getAll()
    return { data: { items: data, total: data.length } }
  },
  get: async (id: number) => {
    const data = await api.projects.get(id)
    return { data }
  },
  create: async (data: any) => {
    const result = await api.projects.create(data)
    return { data: { id: result.id } }
  },
  update: async (id: number, data: any) => {
    await api.projects.update(id, data)
    return { data: { success: true } }
  },
  delete: async (id: number) => {
    await api.projects.delete(id)
    return { data: { success: true } }
  }
}

export const contractsApi = {
  list: async (params?: any) => {
    const data = await api.contracts.getAll(params?.project_id)
    return { data: { items: data, total: data.length } }
  },
  create: async (data: any) => {
    const result = await api.contracts.create(data)
    return { data: { id: result.id } }
  },
  update: async (id: number, data: any) => {
    await api.contracts.update(id, data)
    return { data: { success: true } }
  },
  delete: async (id: number) => {
    await api.contracts.delete(id)
    return { data: { success: true } }
  }
}

export const ks2Api = {
  list: async (params?: any) => {
    const data = await api.ks2.getAll(params?.project_id)
    return { data: { items: data, total: data.length } }
  },
  create: async (data: any) => {
    const result = await api.ks2.create(data)
    return { data: { id: result.id } }
  },
  delete: async (id: number) => {
    await api.ks2.delete(id)
    return { data: { success: true } }
  },
  getItems: async (id: number) => {
    const data = await api.ks2.getItems(id)
    return { data }
  },
  createItem: async (data: any) => {
    const result = await api.ks2.createItem(data)
    return { data: result }
  },
  deleteItem: async (id: number) => {
    await api.ks2.deleteItem(id)
    return { data: { success: true } }
  }
}

export const ks3Api = {
  list: async (params?: any) => {
    const data = await api.ks3.getAll(params?.project_id)
    return { data: { items: data, total: data.length } }
  },
  create: async (data: any) => {
    const result = await api.ks3.create(data)
    return { data: { id: result.id } }
  },
  delete: async (id: number) => {
    await api.ks3.delete(id)
    return { data: { success: true } }
  }
}

export const m29Api = {
  list: async (params?: any) => {
    const data = await api.m29.getAll(params?.project_id)
    return { data: { items: data, total: data.length } }
  },
  create: async (data: any) => {
    const result = await api.m29.create(data)
    return { data: { id: result.id } }
  }
}

export const templatesApi = {
  list: async () => {
    if (isElectron()) {
      const api = getElectronAPI()
      return api?.templates.getList() || []
    }
    // Mock data
    return [
      { id: 'contract-individual', name: 'Договор подряда (физ. лицо)', category: 'contracts' },
      { id: 'contract-company', name: 'Договор подряда (юр. лицо)', category: 'contracts' }
    ]
  }
}

export const documentsApi = {
  generate: async (type: string, id: number) => {
    if (type === 'estimate') return api.docs.generateEstimate(id)
    if (type === 'ks2') return api.docs.generateKS2(id)
    if (type === 'ks3') return api.docs.generateKS3(id)
    if (type === 'contract') return api.docs.generateContract(id)
    return { path: '' }
  },
  getEstimateContext: async (estimateId: number) => {
    return api.docs.getEstimateContext(estimateId)
  },
  getEstimateSnapshot: async (estimateId: number, options?: { templateVersion?: string; generatedAt?: string }) => {
    return api.docs.getEstimateSnapshot(estimateId, options)
  }
}

// AI API для интеграции с Gemini (реальный вызов)
export const aiApi = {
  // Анализ фото для создания сметы
  analyzePhoto: async (imageBase64: string): Promise<{ data: any }> => {
    console.log('AI: Анализ фото через Gemini...')
    try {
      const result = await gemini.analyzePhoto(imageBase64)
      return { data: result }
    } catch (error: any) {
      console.error('Gemini error:', error)
      return { data: { items: [], description: error.message || 'Ошибка' } }
    }
  },

  // Генерация позиций сметы по описанию
  generateEstimateItems: async (description: string, city?: string): Promise<{ data: any }> => {
    console.log('AI: Генерация позиций...')
    try {
      const result = await gemini.generateEstimateItems(description, city)
      return { data: result }
    } catch (error: any) {
      console.error('Gemini error:', error)
      return { data: { items: [] } }
    }
  },

  // Чат с AI ассистентом
  chat: async (message: string, context?: string, history?: Array<{ role: string, content: string }>): Promise<{ data: { message: string } }> => {
    console.log('AI Chat:', message)
    try {
      const reply = await gemini.chat(message, context, history)
      return { data: { message: reply } }
    } catch (error: any) {
      console.error('Gemini error:', error)
      return { data: { message: 'Ошибка: ' + (error.message || 'Не удалось получить ответ') } }
    }
  },

  // Подбор расценок
  suggestPrices: async (items: any[], city?: string): Promise<{ data: any }> => {
    try {
      const updated = await gemini.generateEstimateItems('Подбери расценки для: ' + JSON.stringify(items), city)
      return { data: { items: updated } }
    } catch {
      return { data: { items } }
    }
  },

  // ИИ-подсказки работ
  suggestWorks: async (query: string): Promise<{ data: { items: Array<{ code: string; name: string; unit: string; price: number; reason?: string }> } }> => {
    console.log('AI: Подбор работ по запросу:', query)

    // Встроенная база расценок для работы без API
    const localDatabase = [
      { code: 'ФЕР11-01-001', name: 'Штукатурка стен по маякам', unit: 'м²', price: 650, keywords: ['штукатурка', 'стен', 'маяк'] },
      { code: 'ФЕР11-01-002', name: 'Штукатурка потолков', unit: 'м²', price: 750, keywords: ['штукатурка', 'потолок'] },
      { code: 'ФЕР11-02-001', name: 'Шпаклёвка стен под обои', unit: 'м²', price: 320, keywords: ['шпаклёвка', 'шпатлёвка', 'обои', 'стен'] },
      { code: 'ФЕР11-02-002', name: 'Шпаклёвка стен под покраску', unit: 'м²', price: 450, keywords: ['шпаклёвка', 'шпатлёвка', 'покраска', 'стен'] },
      { code: 'ФЕР11-03-001', name: 'Покраска стен водоэмульсионной краской', unit: 'м²', price: 280, keywords: ['покраска', 'краска', 'стен'] },
      { code: 'ФЕР11-03-002', name: 'Покраска потолков', unit: 'м²', price: 320, keywords: ['покраска', 'потолок'] },
      { code: 'ФЕР11-04-001', name: 'Оклейка стен обоями', unit: 'м²', price: 350, keywords: ['обои', 'оклейка', 'стен'] },
      { code: 'ФЕР15-01-001', name: 'Укладка ламината', unit: 'м²', price: 450, keywords: ['ламинат', 'пол', 'укладка'] },
      { code: 'ФЕР15-01-002', name: 'Укладка линолеума', unit: 'м²', price: 280, keywords: ['линолеум', 'пол'] },
      { code: 'ФЕР15-02-001', name: 'Укладка керамической плитки на пол', unit: 'м²', price: 1200, keywords: ['плитка', 'керамическая', 'пол'] },
      { code: 'ФЕР15-02-002', name: 'Укладка керамической плитки на стены', unit: 'м²', price: 1100, keywords: ['плитка', 'керамическая', 'стен'] },
      { code: 'ФЕР15-03-001', name: 'Стяжка пола цементная', unit: 'м²', price: 550, keywords: ['стяжка', 'пол', 'цемент'] },
      { code: 'ФЕР15-03-002', name: 'Наливной пол самовыравнивающийся', unit: 'м²', price: 450, keywords: ['наливной', 'пол', 'самовыравнивающийся'] },
      { code: 'ФЕР09-01-001', name: 'Монтаж подвесного потолка', unit: 'м²', price: 650, keywords: ['потолок', 'подвесной', 'монтаж'] },
      { code: 'ФЕР09-01-002', name: 'Натяжной потолок', unit: 'м²', price: 800, keywords: ['потолок', 'натяжной'] },
      { code: 'ФЕР08-01-001', name: 'Электромонтажные работы (точка)', unit: 'точка', price: 1500, keywords: ['электр', 'розетка', 'выключатель', 'точка'] },
      { code: 'ФЕР08-01-002', name: 'Прокладка кабеля', unit: 'м', price: 120, keywords: ['кабель', 'электр', 'прокладка'] },
      { code: 'ФЕР16-01-001', name: 'Сантехнические работы (точка)', unit: 'точка', price: 2500, keywords: ['сантехника', 'точка', 'вода'] },
      { code: 'ФЕР16-01-002', name: 'Установка унитаза', unit: 'шт', price: 3500, keywords: ['унитаз', 'установка'] },
      { code: 'ФЕР16-01-003', name: 'Установка раковины', unit: 'шт', price: 2500, keywords: ['раковина', 'установка', 'мойка'] },
      { code: 'ФЕР16-01-004', name: 'Установка ванны', unit: 'шт', price: 5000, keywords: ['ванна', 'установка'] },
      { code: 'ФЕР46-01-001', name: 'Демонтаж покрытий пола', unit: 'м²', price: 250, keywords: ['демонтаж', 'пол'] },
      { code: 'ФЕР46-01-002', name: 'Демонтаж обоев', unit: 'м²', price: 80, keywords: ['демонтаж', 'обои'] },
      { code: 'ФЕР46-01-003', name: 'Демонтаж плитки', unit: 'м²', price: 350, keywords: ['демонтаж', 'плитка'] },
      { code: 'ФЕР10-01-001', name: 'Установка межкомнатных дверей', unit: 'шт', price: 4500, keywords: ['дверь', 'межкомнатная', 'установка'] },
      { code: 'ФЕР10-01-002', name: 'Установка входной двери', unit: 'шт', price: 8000, keywords: ['дверь', 'входная', 'установка'] },
    ]

    // Локальный поиск по ключевым словам
    const queryLower = query.toLowerCase()
    const queryWords = queryLower.split(/\s+/)

    const localResults = localDatabase
      .map(item => {
        const matchCount = item.keywords.filter(kw =>
          queryWords.some(qw => kw.includes(qw) || qw.includes(kw))
        ).length
        return { ...item, matchCount }
      })
      .filter(item => item.matchCount > 0)
      .sort((a, b) => b.matchCount - a.matchCount)
      .slice(0, 5)
      .map(item => ({
        code: item.code,
        name: item.name,
        unit: item.unit,
        price: item.price,
        reason: 'Из базы расценок'
      }))

    // Пробуем AI если есть ключ
    try {
      const result = await gemini.generateEstimateItems(query)
      if (result.items && result.items.length > 0) {
        return {
          data: {
            items: result.items.map((item: any) => ({
              code: item.code || 'AI-001',
              name: item.name,
              unit: item.unit || 'шт',
              price: item.price || 0,
              reason: 'Рекомендация ИИ'
            }))
          }
        }
      }
    } catch {
      console.log('AI не доступен, используем локальную базу')
    }

    // Возвращаем локальные результаты
    if (localResults.length > 0) {
      return { data: { items: localResults } }
    }

    // Если ничего не найдено, возвращаем общую рекомендацию
    return {
      data: {
        items: [{
          code: 'CUSTOM-001',
          name: query,
          unit: 'м²',
          price: 500,
          reason: 'Укажите цену вручную'
        }]
      }
    }
  },

  // Проверка сметы на ошибки
  validateEstimate: async (): Promise<{ data: any }> => {
    return {
      data: {
        valid: true,
        warnings: ['Рекомендуется проверить объёмы работ'],
        errors: []
      }
    }
  }
}

// Справочники
export const referencesApi = {
  getWorks: async (search?: string) => {
    const works = [
      { id: 1, code: 'Е1-01', name: 'Демонтаж покрытий пола', unit: 'м²', price: 250 },
      { id: 2, code: 'Е1-02', name: 'Демонтаж дверных блоков', unit: 'шт', price: 800 },
      { id: 3, code: 'Е11-01', name: 'Штукатурка стен', unit: 'м²', price: 650 },
      { id: 4, code: 'Е11-02', name: 'Шпаклёвка стен', unit: 'м²', price: 320 },
      { id: 5, code: 'Е11-03', name: 'Окраска стен', unit: 'м²', price: 280 },
      { id: 6, code: 'Е15-01', name: 'Укладка ламината', unit: 'м²', price: 450 },
      { id: 7, code: 'Е15-02', name: 'Укладка плитки', unit: 'м²', price: 1200 },
      { id: 8, code: 'Е8-01', name: 'Электромонтажные работы', unit: 'точка', price: 1500 },
    ]
    if (search) {
      const s = search.toLowerCase()
      return { data: { items: works.filter(w => w.name.toLowerCase().includes(s) || w.code.toLowerCase().includes(s)) } }
    }
    return { data: { items: works } }
  },

  getMaterials: async (search?: string) => {
    const materials = [
      { id: 1, name: 'Цемент М500', unit: 'мешок', price: 450 },
      { id: 2, name: 'Песок строительный', unit: 'м³', price: 1200 },
      { id: 3, name: 'Гипсокартон 12мм', unit: 'лист', price: 380 },
      { id: 4, name: 'Профиль ПП 60х27', unit: 'шт', price: 180 },
      { id: 5, name: 'Ламинат 32 класс', unit: 'м²', price: 850 },
      { id: 6, name: 'Плитка керамическая', unit: 'м²', price: 1200 },
      { id: 7, name: 'Краска водоэмульсионная', unit: 'л', price: 350 },
      { id: 8, name: 'Грунтовка глубокого проникновения', unit: 'л', price: 180 },
    ]
    if (search) {
      const s = search.toLowerCase()
      return { data: { items: materials.filter(m => m.name.toLowerCase().includes(s)) } }
    }
    return { data: { items: materials } }
  }
}

// Alias для worksApi
export const worksApi = {
  list: async (params?: { search?: string }) => {
    return referencesApi.getWorks(params?.search)
  },
  search: async (query: string) => {
    return referencesApi.getWorks(query)
  }
}

// Alias для materialsApi
export const materialsApi = {
  list: async (params?: { search?: string }) => {
    return referencesApi.getMaterials(params?.search)
  },
  search: async (query: string) => {
    return referencesApi.getMaterials(query)
  }
}















