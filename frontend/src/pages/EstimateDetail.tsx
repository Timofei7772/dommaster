import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Plus,
  Calculator,
  FileCheck,
  Trash2,
  Edit2,
  Bot,
  FileText,
  Users,
  ClipboardList,
  Package,
  FileDown,
  Printer,
  FolderOpen,
  FileSpreadsheet,
  Receipt,
  Truck,
  Save,
  X
} from 'lucide-react'
import { estimatesApi, contractsApi, ks2Api, ks3Api, m29Api, projectsApi, documentsApi, api } from '@/lib/api'
import { type EstimateItem } from '@/lib/estimateItems'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import AddItemModal from '@/components/AddItemModal'
import EditItemModal from '@/components/EditItemModal'
import SectionsManager from '@/components/SectionsManager'
import { useSettings } from '@/hooks/useSettings'
import { estimateItemsQueryKey, estimateQueryKey, estimateSectionsQueryKey } from '@/lib/estimateQueryKeys'
import {
  exportEstimatePdfForDocuments,
  formatEstimatePdfActionError,
} from '@/lib/document-estimate-actions'
import KPPreviewModal from '@/components/KPPreviewModal'

export default function EstimateDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showAddItem, setShowAddItem] = useState(false)
  const [editingItem, setEditingItem] = useState<EstimateItem | null>(null)
  const [isGenerating, setIsGenerating] = useState<string | null>(null)
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null)
  const [showSections, setShowSections] = useState(true)
  const [isEditingHeader, setIsEditingHeader] = useState(false)
  const [showKPPreview, setShowKPPreview] = useState(false)
  const [headerForm, setHeaderForm] = useState<{
    name: string; number: string; client_name: string; address: string;
    overhead_percent: number; profit_percent: number; vat_percent: number
  } | null>(null)
  const viewModeKey = 'zaru_estimate_view_mode'
  const [viewMode, setViewMode] = useState<'full' | 'list'>(() => {
    if (typeof window === 'undefined') return 'full'
    const stored = window.localStorage.getItem(viewModeKey)
    return stored === 'list' ? 'list' : 'full'
  })
  const { settings } = useSettings()

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(viewModeKey, viewMode)
  }, [viewMode])

  // Удаление позиции
  const handleDeleteItem = async (item: EstimateItem) => {
    if (window.confirm(`Удалить позицию "${item.name}"?`)) {
      await api.estimateItems.delete(item.id)
      queryClient.invalidateQueries({ queryKey: estimateItemsQueryKey(id) })
      queryClient.invalidateQueries({ queryKey: estimateQueryKey(id) })
      toast.success('Позиция удалена')
    }
  }

  const { data: estimate, isLoading } = useQuery({
    queryKey: estimateQueryKey(id),
    queryFn: () => estimatesApi.get(Number(id)),
    enabled: !!id,
  })

  const { data: items } = useQuery({
    queryKey: estimateItemsQueryKey(id),
    queryFn: () => estimatesApi.getItems(Number(id)),
    enabled: !!id,
  })

  // Загрузка разделов
  const { data: sections = [] } = useQuery({
    queryKey: estimateSectionsQueryKey(id),
    queryFn: async () => {
      if (window.electronAPI?.estimateSections) {
        return await window.electronAPI.estimateSections.getAll(Number(id))
      }
      return []
    },
    enabled: !!id,
  })

  const { data: project } = useQuery({
    queryKey: ['project', estimate?.data?.project_id],
    queryFn: () => projectsApi.get(estimate?.data?.project_id || 0),
    enabled: !!estimate?.data?.project_id,
  })

  const recalculateMutation = useMutation({
    mutationFn: () => estimatesApi.recalculate(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: estimateQueryKey(id) })
      toast.success('Смета пересчитана')
    },
  })

  // Редактирование шапки сметы
  const startEditHeader = () => {
    if (!data) return
    setHeaderForm({
      name: data.name || '',
      number: data.number || '',
      client_name: data.client_name || '',
      address: data.address || '',
      overhead_percent: data.overhead_percent || 0,
      profit_percent: data.profit_percent || 0,
      vat_percent: data.vat_percent || 20,
    })
    setIsEditingHeader(true)
  }

  const saveHeader = async () => {
    if (!headerForm) return
    try {
      await estimatesApi.update(Number(id), headerForm)
      await recalculateMutation.mutateAsync()
      queryClient.invalidateQueries({ queryKey: estimateQueryKey(id) })
      setIsEditingHeader(false)
      setHeaderForm(null)
      toast.success('Смета сохранена')
    } catch {
      toast.error('Ошибка сохранения сметы')
    }
  }

  const cancelEditHeader = () => {
    setIsEditingHeader(false)
    setHeaderForm(null)
  }

  const data = estimate?.data
  const itemsList = items?.data || []
  const projectData = project?.data

  // Вычисляем итоги — читаем поля которые реально хранятся в БД после recalculateEstimate
  // БД хранит: total_materials, total_labor, subtotal, overhead_amount, profit_amount,
  //            total_cost, vat_cost, total_with_vat
  const r2 = (v: number) => Math.round((v || 0) * 100) / 100
  const clientMaterials = r2(itemsList.reduce((sum: number, item: any) => {
    const rt = item.row_type || 'rascenka'
    if (rt === 'material' || rt === 'mat') return sum + (item.sum_smeta || 0)
    return sum
  }, 0))
  const clientLabor = r2(itemsList.reduce((sum: number, item: any) => {
    const rt = item.row_type || 'rascenka'
    if (!['material','mat','mechanism','meh','comment','spr','empt'].includes(rt) &&
        !rt.startsWith('irazd') && !rt.startsWith('itog') && !rt.startsWith('lz_')) {
      return sum + (item.sum_smeta || 0)
    }
    return sum
  }, 0))
  const clientSubtotal = r2(clientMaterials + clientLabor)

  const calculatedTotals = {
    // Берём данные из БД (поля от recalculateEstimate), фоллбэк — считаем из позиций
    materials:    data?.total_materials ?? clientMaterials,
    labor:        data?.total_works     ?? clientLabor,
    get subtotal() { return r2((data?.total_without_vat as number) || this.materials + this.labor) },
    overhead:     data?.total_overhead ?? (data as any)?.overhead_cost ?? 0,
    profit:       data?.total_profit   ?? (data as any)?.profit_cost ?? 0,
    get total()   { return r2((data?.total_without_vat as number) || this.subtotal + this.overhead + this.profit) },
    get vat()     { return r2((data?.total_vat as number) || this.total * ((data?.vat_percent || 20) / 100)) },
    get totalWithVat() { return r2((data?.total_with_vat as number) || this.total + this.vat) }
  }
  void clientSubtotal // suppress unused

  // Создать Договор и сгенерировать файл
  const createContract = async () => {
    if (!data) return
    setIsGenerating('contract')
    try {
      const contractData = {
        project_id: data.project_id,
        estimate_id: Number(id),
        number: `Д-${data.number}`,
        date: new Date().toISOString().split('T')[0],
        client: data.client_name || projectData?.client_name || settings.company.name,
        client_type: 'individual',
        contractor: settings.company.name,
        subject: data.name,
        amount: data.total_with_vat || data.total_cost || 0,
        prepayment_percent: 30,
        status: 'draft'
      }
      const result = await contractsApi.create(contractData)
      const contractId = result.data?.id

      // Генерируем файл и открываем
      if (contractId) {
        try {
          const docResult = await documentsApi.generate('contract', contractId)
          if (docResult && docResult.path) {
            toast.success('Договор создан и сохранён!')
            await api.shell.openPath(docResult.path)
          } else {
            toast.error('Не удалось сгенерировать файл договора')
          }
        } catch (e) {
          console.error('Contract generation error:', e)
          toast.success('Договор создан, но не удалось открыть файл.')
        }
      }
    } catch {
      toast.error('Ошибка создания договора')
    } finally {
      setIsGenerating(null)
    }
  }

  // Создать КС-2 и сгенерировать файл
  const createKS2 = async () => {
    if (!data) return
    setIsGenerating('ks2')
    try {
      const ks2Data = {
        project_id: data.project_id,
        estimate_id: Number(id),
        number: `КС2-${data.number}-1`,
        date: new Date().toISOString().split('T')[0],
        period_from: new Date().toISOString().split('T')[0],
        period_to: new Date().toISOString().split('T')[0],
        amount: calculatedTotals.totalWithVat || 0,
        status: 'draft',
        // Автозаполнение данных из сметы/проекта
        client_name: data.client_name || projectData?.client_name || '',
        client_address: data.address || projectData?.address || '',
        contractor_name: settings?.company?.name || '',
        object_name: data.name || projectData?.name || ''
      }
      const result = await ks2Api.create(ks2Data)
      const ks2Id = result.data?.id

      // Генерируем файл и открываем
      if (ks2Id) {
        const docResult = await api.docs.generateKS2(ks2Id)
        console.log('КС-2 результат:', docResult)
        if (docResult?.path) {
          toast.success('Акт КС-2 создан!')
          // Открываем файл
          await api.shell.openPath(docResult.path)
        } else {
          toast.success('Акт КС-2 создан, но путь к файлу не получен')
        }
      } else {
        toast.error('Ошибка: ID акта не получен')
      }
    } catch (err) {
      console.error('Ошибка создания КС-2:', err)
      toast.error('Ошибка создания КС-2')
    } finally {
      setIsGenerating(null)
    }
  }

  // Создать КС-3 и сгенерировать файл
  const createKS3 = async () => {
    if (!data) return
    setIsGenerating('ks3')
    try {
      const ks3Data = {
        project_id: data.project_id,
        number: `КС3-${data.number}-1`,
        date: new Date().toISOString().split('T')[0],
        period_from: new Date().toISOString().split('T')[0],
        period_to: new Date().toISOString().split('T')[0],
        amount: calculatedTotals.totalWithVat || 0,
        amount_without_vat: calculatedTotals.total || 0,
        vat_amount: calculatedTotals.vat || 0,
        total_with_vat: calculatedTotals.totalWithVat || 0,
        status: 'draft',
        client_name: data.client_name || projectData?.client_name || '',
        client_address: data.address || projectData?.address || '',
        contractor_name: settings?.company?.name || '',
        object_name: data.name || projectData?.name || ''
      }
      const result = await ks3Api.create(ks3Data)
      const ks3Id = result.data?.id

      if (ks3Id) {
        const docResult = await api.docs.generateKS3(ks3Id)
        console.log('КС-3 результат:', docResult)
        if (docResult?.path) {
          toast.success('Справка КС-3 создана!')
          await api.shell.openPath(docResult.path)
        } else {
          toast.success('Справка КС-3 создана, но путь к файлу не получен')
        }
      } else {
        toast.error('Ошибка: ID справки не получен')
      }
    } catch (err) {
      console.error('Ошибка создания КС-3:', err)
      toast.error('Ошибка создания КС-3')
    } finally {
      setIsGenerating(null)
    }
  }

  // Создать М-29 с автозаполнением материалов из позиций сметы
  const createM29 = async () => {
    if (!data) return
    setIsGenerating('m29')
    try {
      // Собираем материальные позиции из сметы
      const matItems = itemsList.filter((item: any) => {
        const rt = item.row_type || 'rascenka'
        return rt === 'material' || rt === 'mat' || rt === 'rascenka' || rt === 'pr' || rt === 'work'
      })
      const totalMat = matItems.reduce((s: number, item: any) => {
        const quantity = Number(item.quantity || 0)
        const materialPrice = Number(item.material_price ?? item.materials_cost ?? 0)
        const materialTotal = item.materials_total ?? (materialPrice * quantity)
        return s + materialTotal
      }, 0)

      const m29Data = {
        project_id: data.project_id,
        estimate_id: Number(id),
        number: `М29-${data.number}`,
        date: new Date().toISOString().split('T')[0],
        object_name: data.address || data.name,
        total_amount: totalMat,
        status: 'draft'
      }
      const result = await m29Api.create(m29Data)
      const m29Id = (result as any)?.data?.id || (result as any)?.id

      // Добавляем позиции в m29_items через IPC если доступно
      if (m29Id && window.electronAPI) {
        for (const item of matItems) {
          const quantity = Number(item.quantity || 0)
          const materialPrice = Number((item as any).material_price ?? (item as any).materials_cost ?? 0)
          const matAmt = item.materials_total ?? (materialPrice * quantity)
          if (matAmt <= 0) continue
          try {
            await (window.electronAPI as any).m29?.addItem?.({
              m29_id: m29Id,
              name: item.name,
              unit: item.unit || 'шт',
              norm_quantity: item.quantity || 1,
              actual_quantity: item.quantity || 1,
              norm_price: matAmt / (item.quantity || 1),
              actual_price: matAmt / (item.quantity || 1),
              norm_cost: matAmt,
              actual_cost: matAmt,
              deviation: 0
            })
          } catch { /* пропускаем ошибки отдельных позиций */ }
        }

        // Генерируем PDF файл сразу
        try {
          const docResult = await api.docs.generateM29(m29Id)
          if (docResult?.path) {
            toast.success('М-29 создан и открыт!')
            await api.shell.openPath(docResult.path)
            return
          }
        } catch (e) {
          console.error('М-29 generate error:', e)
        }
      }

      toast.success('Отчёт М-29 создан!')
      const goToList = window.confirm('Отчёт М-29 создан! Перейти в раздел М-29?')
      if (goToList) navigate('/m29')
    } catch (e) {
      console.error('М-29 error:', e)
      toast.error('Ошибка создания М-29')
    } finally {
      setIsGenerating(null)
    }
  }

  // Генерировать ФОТ (Ведомость)
  const handleGenerateFOT = async () => {
    if (!data?.id) {
      toast.error('Смета не выбрана')
      return
    }

    setIsGenerating('fot')
    try {
      const result = await api.docs.generateFOT(data.id)
      if (result?.path) {
        toast.success(`✅ ФОТ сохранен:\\n${result.path}`, { duration: 5000 })

        // Предлагаем открыть папку с файлом
        const openFolder = window.confirm('Открыть папку с документом?')
        if (openFolder && api.shell) {
          await api.shell.showItemInFolder(result.path)
        }
      } else {
        toast.error('Ошибка при создании ФОТ')
      }
    } catch (err) {
      console.error('ФОТ ошибка:', err)
      toast.error('Ошибка создания ФОТ: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setIsGenerating(null)
    }
  }

  // Экспорт в PDF (через Electron IPC)
  const exportToPdf = async () => {
    if (!data || !itemsList.length) {
      toast.error('Нет позиций для экспорта')
      return
    }
    setIsGenerating('pdf')
    try {
      await exportEstimatePdfForDocuments({
        estimateId: Number(id),
        docs: api.docs,
        shell: api.shell,
        notifySuccess: toast.success,
        notifyInfo: toast,
      })
    } catch (e) {
      console.error('PDF export error:', e)
      toast.error(formatEstimatePdfActionError(e, 'Ошибка экспорта в PDF'))
    } finally {
      setIsGenerating(null)
    }
  }

  // Экспорт дефектовки (формат ZARU AI смета)
  const exportDefektovka = async () => {
    if (!data) return
    setIsGenerating('defektovka')
    try {
      const result = await api.docs.generateDefektovka(Number(id))
      if (result?.path) {
        toast.success('Дефектовка создана!')
        await api.shell.openPath(result.path)
      } else {
        toast.error('Функция доступна только в desktop версии')
      }
    } catch (e) {
      toast.error('Ошибка создания дефектовки')
      console.error(e)
    } finally {
      setIsGenerating(null)
    }
  }

  // Создать счёт-фактуру
  const createInvoice = async () => {
    if (!data) return
    setIsGenerating('invoice')
    try {
      const invoiceData = {
        number: `СЧ-${data.number}-${Date.now().toString().slice(-4)}`,
        date: new Date().toISOString().split('T')[0],
        client_name: data.client_name || projectData?.client_name || '',
        client_address: data.address || projectData?.address || ''
      }
      const result = await api.docs.generateInvoice(Number(id), invoiceData)
      if (result?.path) {
        toast.success('Счёт-фактура создана!')
        await api.shell.openPath(result.path)
      } else {
        toast.error('Функция доступна только в desktop версии')
      }
    } catch (e) {
      toast.error('Ошибка создания счёта')
      console.error(e)
    } finally {
      setIsGenerating(null)
    }
  }

  // Создать заявку на материалы
  const createMaterialRequest = async () => {
    if (!data) return
    setIsGenerating('material-request')
    try {
      const result = await api.docs.generateMaterialRequest(Number(id))
      if (result?.path) {
        toast.success('Заявка на материалы создана!')
        await api.shell.openPath(result.path)
      } else {
        toast.error('Функция доступна только в desktop версии')
      }
    } catch (e) {
      toast.error('Ошибка создания заявки на материалы')
      console.error(e)
    } finally {
      setIsGenerating(null)
    }
  }
  const getItemTotals = (item: any) => {
    const quantity = Number(item.quantity || 0)
    const materialPrice = Number(item.material_price ?? item.materials_cost ?? 0)
    const laborPrice = Number(item.labor_price ?? item.labor_cost ?? 0)
    const materials = item.materials_total ?? (materialPrice * quantity)
    const labor = item.labor_total ?? (laborPrice * quantity)
    const total = item.total ?? (materials + labor)
    const unitPrice = quantity > 0 ? total / quantity : total
    return { materials, labor, total, unitPrice }
  }

  const getSectionTotals = (sectionItems: any[]) => {
    return sectionItems.reduce(
      (acc, item) => {
        const { materials, labor, total } = getItemTotals(item)
        return {
          materials: acc.materials + materials,
          labor: acc.labor + labor,
          total: acc.total + total
        }
      },
      { materials: 0, labor: 0, total: 0 }
    )
  }

  const sectionGroups = sections
    .map((section: any) => ({
      id: Number(section.id),
      name: section.name || 'Раздел',
      items: itemsList.filter((item: any) => Number(item.section_id) === Number(section.id))
    }))
    .filter((section: any) => section.items.length > 0)

  const unassignedItems = itemsList.filter((item: any) => !item.section_id)
  if (unassignedItems.length > 0) {
    sectionGroups.push({
      id: -1,
      name: 'Прочие работы',
      items: unassignedItems
    })
  }

  const visibleSections = selectedSectionId === null
    ? sectionGroups
    : sectionGroups.filter((section: any) => section.id === selectedSectionId)

  const visibleItemsCount = visibleSections.reduce((sum: number, section: any) => sum + section.items.length, 0)
  const filteredItems = selectedSectionId === null
    ? itemsList
    : itemsList.filter((item: any) => item.section_id === selectedSectionId)

  const getSectionName = (sectionId: number | null) => {
    if (!sectionId) return null
    const section = sections.find((s: any) => s.id === sectionId)
    return section?.name || null
  }

  const sectionRows = visibleSections.flatMap((section: any) => {
    const sectionTotals = getSectionTotals(section.items)
    const rows: JSX.Element[] = [
      <tr key={`section-${section.id}`} className="bg-slate-100 dark:bg-slate-800">
        <td colSpan={8} className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100">
          Раздел: {section.name}
        </td>
      </tr>
    ]

    section.items.forEach((item: any, index: number) => {
      const { materials, labor, total, unitPrice } = getItemTotals(item)
      rows.push(
        <tr key={`item-${section.id}-${item.id || index}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 align-top">
          <td className="px-2 py-2 text-slate-500 text-xs">{index + 1}</td>
          <td className="px-3 py-2">
            {item.justification && <p className="text-xs text-slate-400">{item.justification}</p>}
            <p className="font-medium leading-5 break-words">{item.name}</p>
          </td>
          <td className="px-2 py-2 text-slate-600 text-xs">{item.unit || 'шт'}</td>
          <td className="px-2 py-2 text-right text-xs">{item.quantity || 0}</td>
          <td className="px-2 py-2 text-right text-xs">{formatCurrency(unitPrice)}</td>
          <td className="px-2 py-2 text-right text-xs">{formatCurrency(materials)}</td>
          <td className="px-2 py-2 text-right text-xs">{formatCurrency(labor)}</td>
          <td className="px-2 py-2">
            <div className="flex items-center justify-between gap-1">
              <span className="font-semibold text-xs">{formatCurrency(total)}</span>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => setEditingItem(item)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded" title="Редактировать">
                  <Edit2 className="w-3 h-3 text-slate-400" />
                </button>
                <button onClick={() => handleDeleteItem(item)} className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title="Удалить">
                  <Trash2 className="w-3 h-3 text-red-400" />
                </button>
              </div>
            </div>
          </td>
        </tr>
      )
    })

    rows.push(
      <tr key={`section-total-${section.id}`} className="bg-slate-50 dark:bg-slate-800/80 font-semibold">
        <td colSpan={5} className="px-3 py-2 text-right">Итого по разделу:</td>
        <td className="px-3 py-2 text-right whitespace-nowrap">{formatCurrency(sectionTotals.materials)}</td>
        <td className="px-3 py-2 text-right whitespace-nowrap">{formatCurrency(sectionTotals.labor)}</td>
        <td className="px-3 py-2 text-right whitespace-nowrap">{formatCurrency(sectionTotals.total)}</td>
      </tr>
    )

    return rows
  })

  // Печать сметы — через PDF генерацию
  const printEstimate = async () => {
    if (!data) return
    try {
      setIsGenerating('print')
      await exportEstimatePdfForDocuments({
        estimateId: Number(id),
        docs: api.docs,
        shell: api.shell,
        notifySuccess: toast.success,
        notifyInfo: toast,
        successMessage: 'PDF для печати создан',
      })
    } catch (e) {
      console.error('Print error:', e)
      toast.error(formatEstimatePdfActionError(e, 'Ошибка при подготовке печати'))
    } finally {
      setIsGenerating(null)
    }
  }

  if (isLoading) {
    return <div className="animate-pulse h-64 bg-slate-200 dark:bg-slate-700 rounded"></div>
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500 dark:text-slate-400 mb-4">Смета не найдена</p>
        <Link to="/estimates" className="btn-primary">К списку смет</Link>
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Навигация */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <Link to="/estimates" className="text-slate-500 hover:text-primary-600 flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" />Сметы
          </Link>
          <span className="text-slate-400">/</span>
          <span className="font-medium">{data?.number}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAddItem(true)} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" />Добавить позицию
          </button>
          <button onClick={() => recalculateMutation.mutate()} className="btn-secondary flex items-center gap-2 text-sm">
            <Calculator className="w-4 h-4" />Пересчитать
          </button>
        </div>
      </div>

      {/* Заголовок и итоги */}
      <div className="card p-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            {isEditingHeader && headerForm ? (
              <div className="space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-500">Название сметы</label>
                    <input className="input w-full text-sm" value={headerForm.name}
                      onChange={e => setHeaderForm({...headerForm, name: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Номер</label>
                    <input className="input w-full text-sm" value={headerForm.number}
                      onChange={e => setHeaderForm({...headerForm, number: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Заказчик</label>
                    <input className="input w-full text-sm" value={headerForm.client_name}
                      onChange={e => setHeaderForm({...headerForm, client_name: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Адрес объекта</label>
                    <input className="input w-full text-sm" value={headerForm.address}
                      onChange={e => setHeaderForm({...headerForm, address: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Накладные расходы, %</label>
                    <input type="number" className="input w-full text-sm" value={headerForm.overhead_percent}
                      onChange={e => setHeaderForm({...headerForm, overhead_percent: parseFloat(e.target.value) || 0})} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Сметная прибыль, %</label>
                    <input type="number" className="input w-full text-sm" value={headerForm.profit_percent}
                      onChange={e => setHeaderForm({...headerForm, profit_percent: parseFloat(e.target.value) || 0})} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">НДС, %</label>
                    <input type="number" className="input w-full text-sm" value={headerForm.vat_percent}
                      onChange={e => setHeaderForm({...headerForm, vat_percent: parseFloat(e.target.value) || 20})} />
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={saveHeader} className="btn-primary flex items-center gap-1 text-sm">
                    <Save className="w-4 h-4" />Сохранить
                  </button>
                  <button onClick={cancelEditHeader} className="btn-secondary flex items-center gap-1 text-sm">
                    <X className="w-4 h-4" />Отмена
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <div>
                  <h1 className="text-xl font-bold">{data?.name}</h1>
                  {data?.client_name && <p className="text-sm text-slate-500">Заказчик: {data.client_name}</p>}
                  {data?.address && <p className="text-sm text-slate-500">Адрес: {data.address}</p>}
                </div>
                <button onClick={startEditHeader} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded mt-1" title="Редактировать шапку сметы">
                  <Edit2 className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 text-right shrink-0">
            <div>
              <p className="text-xs text-slate-500">Позиций</p>
              <p className="text-lg font-bold">{itemsList.length}</p>
            </div>
            <div className="h-8 w-px bg-slate-200 dark:bg-slate-700"></div>
            <div>
              <p className="text-xs text-slate-500">Итого с НДС</p>
              <p className="text-xl font-bold text-primary-600">{formatCurrency(calculatedTotals.totalWithVat)}</p>
            </div>
          </div>
        </div>

        {/* Компактные итоги */}
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 text-sm">
          <div className="bg-slate-50 dark:bg-slate-800 rounded p-2">
            <p className="text-xs text-slate-500">Материалы</p>
            <p className="font-semibold">{formatCurrency(calculatedTotals.materials)}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded p-2">
            <p className="text-xs text-slate-500">Работы</p>
            <p className="font-semibold">{formatCurrency(calculatedTotals.labor)}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded p-2">
            <p className="text-xs text-slate-500">Накладные {data?.overhead_percent || 0}%</p>
            <p className="font-semibold">{formatCurrency(calculatedTotals.overhead)}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded p-2">
            <p className="text-xs text-slate-500">Прибыль {data?.profit_percent || 0}%</p>
            <p className="font-semibold">{formatCurrency(calculatedTotals.profit)}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded p-2">
            <p className="text-xs text-slate-500">Без НДС</p>
            <p className="font-semibold">{formatCurrency(calculatedTotals.total)}</p>
          </div>
          <div className="bg-primary-50 dark:bg-primary-900/30 rounded p-2">
            <p className="text-xs text-primary-600">НДС {data?.vat_percent || 20}%</p>
            <p className="font-semibold text-primary-700">{formatCurrency(calculatedTotals.vat)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* Таблица позиций */}
        <div className="xl:col-span-3">
          <div className="card">
            <div className="card-header flex flex-wrap items-center justify-between gap-2 py-2 px-4">
              <div className="flex items-center gap-3">
                <h2 className="font-semibold text-sm">Локальная смета ({visibleItemsCount}{selectedSectionId !== null ? ` / ${itemsList.length}` : ''})</h2>
                <div className="inline-flex rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden text-xs">
                  <button
                    onClick={() => setViewMode('full')}
                    className={`px-2 py-1 transition-colors ${viewMode === 'full' ? 'bg-primary-600 text-white' : 'bg-transparent text-slate-600 dark:text-slate-300'}`}
                  >
                    Полная
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`px-2 py-1 transition-colors ${viewMode === 'list' ? 'bg-primary-600 text-white' : 'bg-transparent text-slate-600 dark:text-slate-300'}`}
                  >
                    Список
                  </button>
                </div>
              </div>
              <button onClick={() => setShowSections(!showSections)} className={`btn-ghost text-xs flex items-center gap-1 ${showSections ? 'text-primary-600' : ''}`}>
                <FolderOpen className="w-4 h-4" />
                {showSections ? 'Скрыть' : 'Разделы'}
              </button>
            </div>

            {showSections && (
              <div className="border-b p-3 bg-slate-50 dark:bg-slate-800/50">
                <SectionsManager
                  estimateId={Number(id)}
                  selectedSectionId={selectedSectionId}
                  onSelectSection={setSelectedSectionId}
                />
              </div>
            )}

            {viewMode === 'full' ? (
              <>
                <div className="p-4 border-b bg-slate-50/70 dark:bg-slate-900/30">
                  <div className="text-center mb-3">
                    <h3 className="text-lg font-bold">ЛОКАЛЬНАЯ СМЕТА № {data.number || 'Б/Н'}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">на {data.name || 'Ремонтно-отделочные работы'}</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                    <p><span className="text-slate-500">Заказчик:</span> {data.client_name || projectData?.client_name || '—'}</p>
                    <p><span className="text-slate-500">Подрядчик:</span> {settings?.company?.name || '—'}</p>
                    <p className="md:col-span-2"><span className="text-slate-500">Объект:</span> {data.address || projectData?.address || data.name || '—'}</p>
                    <p><span className="text-slate-500">Дата:</span> {new Date().toLocaleDateString('ru-RU')}</p>
                    <p><span className="text-slate-500">Всего позиций:</span> {itemsList.length}</p>
                  </div>
                </div>

                {visibleItemsCount === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-slate-500 text-sm">{selectedSectionId !== null ? 'В выбранном разделе нет позиций' : 'Добавьте позиции в смету'}</p>
                    <button onClick={() => setShowAddItem(true)} className="btn-primary mt-3 text-sm">Добавить позицию</button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[700px]">
                      <colgroup>
                        <col style={{width:'2.5rem'}} />
                        <col />
                        <col style={{width:'4rem'}} />
                        <col style={{width:'4.5rem'}} />
                        <col style={{width:'6.5rem'}} />
                        <col style={{width:'6.5rem'}} />
                        <col style={{width:'6.5rem'}} />
                        <col style={{width:'8rem'}} />
                      </colgroup>
                      <thead className="bg-slate-50 dark:bg-slate-800">
                        <tr>
                          <th className="px-2 py-2 text-left font-medium text-slate-600 dark:text-slate-400">№</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Наименование работ и затрат</th>
                          <th className="px-2 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Ед.</th>
                          <th className="px-2 py-2 text-right font-medium text-slate-600 dark:text-slate-400">Кол-во</th>
                          <th className="px-2 py-2 text-right font-medium text-slate-600 dark:text-slate-400">Цена ед.</th>
                          <th className="px-2 py-2 text-right font-medium text-slate-600 dark:text-slate-400">Материалы</th>
                          <th className="px-2 py-2 text-right font-medium text-slate-600 dark:text-slate-400">Работа</th>
                          <th className="px-2 py-2 text-right font-medium text-slate-600 dark:text-slate-400">Стоимость</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {sectionRows}
                      </tbody>
                      <tfoot className="bg-primary-50 dark:bg-primary-900/20 font-semibold">
                        <tr>
                          <td colSpan={5} className="px-3 py-2 text-right">Итого по смете:</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">{formatCurrency(calculatedTotals.materials)}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">{formatCurrency(calculatedTotals.labor)}</td>
                          <td className="px-3 py-2 text-right text-primary-700 whitespace-nowrap">{formatCurrency(calculatedTotals.subtotal)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <>
                {filteredItems.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-slate-500 text-sm">{selectedSectionId !== null ? 'В разделе нет позиций' : 'Добавьте позиции в смету'}</p>
                    <button onClick={() => setShowAddItem(true)} className="btn-primary mt-3 text-sm">Добавить позицию</button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-800">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400 w-10">№</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Наименование</th>
                          <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400 w-16">Ед.</th>
                          <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-slate-400 w-16">Кол.</th>
                          <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-slate-400 w-24">Материалы</th>
                          <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-slate-400 w-24">Работа</th>
                          <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-slate-400 w-28">Всего</th>
                          <th className="px-3 py-2 w-16"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredItems.map((item: any, i: number) => {
                          const quantity = Number(item.quantity || 0)
                          const materialPrice = Number((item as any).material_price ?? (item as any).materials_cost ?? 0)
                          const laborPrice = Number(item.labor_price ?? item.labor_cost ?? 0)
                          const itemMaterials = item.materials_total ?? (materialPrice * quantity)
                          const itemLabor = item.labor_total ?? (laborPrice * quantity)
                          const itemTotal = item.total ?? (itemMaterials + itemLabor)
                          return (
                            <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                              <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                              <td className="px-3 py-2">
                                <p className="font-medium">{item.name}</p>
                                {item.section_id && <p className="text-xs text-slate-400">{getSectionName(item.section_id)}</p>}
                              </td>
                              <td className="px-3 py-2 text-slate-600">{item.unit}</td>
                              <td className="px-3 py-2 text-right">{item.quantity}</td>
                              <td className="px-3 py-2 text-right text-slate-600">{formatCurrency(itemMaterials)}</td>
                              <td className="px-3 py-2 text-right text-slate-600">{formatCurrency(itemLabor)}</td>
                              <td className="px-3 py-2 text-right font-semibold">{formatCurrency(itemTotal)}</td>
                              <td className="px-3 py-2">
                                <div className="flex gap-1 justify-end">
                                  <button onClick={() => setEditingItem(item)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded" title="Редактировать">
                                    <Edit2 className="w-4 h-4 text-slate-400" />
                                  </button>
                                  <button onClick={() => handleDeleteItem(item)} className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded" title="Удалить">
                                    <Trash2 className="w-4 h-4 text-red-400" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot className="bg-slate-50 dark:bg-slate-800 font-semibold">
                        <tr>
                          <td colSpan={4} className="px-3 py-2 text-right">Итого:</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(calculatedTotals.materials)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(calculatedTotals.labor)}</td>
                          <td className="px-3 py-2 text-right text-primary-600">{formatCurrency(calculatedTotals.subtotal)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Компактная панель документов */}
        <div className="xl:col-span-1">
          <div className="card sticky top-4">
            <div className="card-header py-2 px-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-t-xl">
              <h3 className="font-semibold text-sm flex items-center gap-2"><FileText className="w-4 h-4" />Документы</h3>
            </div>
            <div className="p-2 space-y-1">
              <button onClick={createContract} disabled={isGenerating === 'contract'} className="w-full p-2 text-left rounded hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-sm transition-colors">
                <FileText className="w-4 h-4 text-blue-500" /><span>Договор</span>
              </button>
              <button onClick={handleGenerateFOT} disabled={isGenerating === 'fot'} className="w-full p-2 text-left rounded hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-sm transition-colors disabled:opacity-50">
                <Users className="w-4 h-4 text-green-500" /><span>{isGenerating === 'fot' ? 'Создание...' : 'ФОТ'}</span>
              </button>
              <button onClick={createKS2} disabled={isGenerating === 'ks2'} className="w-full p-2 text-left rounded hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-sm transition-colors">
                <ClipboardList className="w-4 h-4 text-orange-500" /><span>Акт КС-2</span>
              </button>
              <button onClick={createKS3} disabled={isGenerating === 'ks3'} className="w-full p-2 text-left rounded hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-sm transition-colors">
                <FileCheck className="w-4 h-4 text-purple-500" /><span>Справка КС-3</span>
              </button>
              <button onClick={createM29} disabled={isGenerating === 'm29'} className="w-full p-2 text-left rounded hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-sm transition-colors">
                <Package className="w-4 h-4 text-amber-500" /><span>М-29</span>
              </button>
              <button onClick={exportDefektovka} disabled={isGenerating === 'defektovka'} className="w-full p-2 text-left rounded hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-sm transition-colors">
                <FileSpreadsheet className="w-4 h-4 text-cyan-500" /><span>Дефектовка</span>
              </button>
              <button onClick={createInvoice} disabled={isGenerating === 'invoice'} className="w-full p-2 text-left rounded hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-sm transition-colors">
                <Receipt className="w-4 h-4 text-rose-500" /><span>Счёт-фактура</span>
              </button>
              <button onClick={createMaterialRequest} disabled={isGenerating === 'material-request'} className="w-full p-2 text-left rounded hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-sm transition-colors">
                <Truck className="w-4 h-4 text-teal-500" /><span>Заявка на материалы</span>
              </button>

              <hr className="my-2" />

              <div className="grid grid-cols-2 gap-1">
                <button onClick={exportToPdf} disabled={isGenerating === 'pdf'} className="p-2 text-center rounded hover:bg-slate-50 dark:hover:bg-slate-800 text-xs transition-colors">
                  <FileDown className="w-4 h-4 mx-auto mb-1 text-red-600" />{isGenerating === 'pdf' ? '...' : 'PDF'}
                </button>
                <button onClick={printEstimate} className="p-2 text-center rounded hover:bg-slate-50 dark:hover:bg-slate-800 text-xs transition-colors">
                  <Printer className="w-4 h-4 mx-auto mb-1 text-slate-600" />Печать
                </button>
              </div>

              <button
                onClick={async () => {
                  try {
                    setIsGenerating('package')
                    const result = await api.docs.generatePackage(Number(id))
                    if (result?.generated?.length) {
                      toast.success(`Создано ${result.generated.length} документов!${result.errors?.length ? `\n⚠️ ${result.errors.length} ошибок` : ''}`)
                    } else {
                      toast.error('Не удалось создать пакет')
                    }
                  } catch (e: any) {
                    console.error('Package error:', e)
                    toast.error('Ошибка: ' + (e.message || 'Не удалось создать пакет'))
                  } finally {
                    setIsGenerating(null)
                  }
                }}
                disabled={isGenerating === 'package'}
                className="w-full p-2.5 text-center rounded bg-gradient-to-r from-amber-500 to-orange-600 text-white text-sm font-medium hover:from-amber-600 hover:to-orange-700 transition-all mt-2 flex items-center justify-center gap-2"
              >
                <Package className="w-4 h-4" />
                {isGenerating === 'package' ? 'Генерация...' : 'Пакет документов'}
              </button>

              <button
                onClick={() => setShowKPPreview(true)}
                className="w-full p-2.5 text-center rounded bg-gradient-to-r from-indigo-500 to-blue-600 text-white text-sm font-medium hover:from-indigo-600 hover:to-blue-700 transition-all flex items-center justify-center gap-2 mt-2"
              >
                <FileText className="w-4 h-4" />Сформировать КП
              </button>
              <Link to={`/ai?estimate_id=${id}`} className="block w-full p-2 text-center rounded bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm hover:from-indigo-600 hover:to-purple-700">
                <Bot className="w-4 h-4 inline mr-1" />ИИ-помощник
              </Link>
            </div>
          </div>
        </div>
      </div>

      {showAddItem && <AddItemModal estimateId={Number(id)} onClose={() => setShowAddItem(false)} defaultSectionId={selectedSectionId} />}
      {editingItem && <EditItemModal estimateId={Number(id)} item={editingItem} onClose={() => setEditingItem(null)} />}
      {showKPPreview && data && (
        <KPPreviewModal
          estimateId={Number(id)}
          estimate={data}
          items={itemsList}
          settings={settings}
          onClose={() => setShowKPPreview(false)}
        />
      )}
    </div>
  )
}









