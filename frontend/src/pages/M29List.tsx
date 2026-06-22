import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileSpreadsheet,
  Plus,
  Search,
  Download,
  Edit,
  Calendar,
  Package,
  CheckCircle,
  Clock,
  Building2,
  Printer,
  Filter,
  Sparkles
} from 'lucide-react'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { m29Api, estimatesApi } from '@/lib/api'
import { isElectron, getElectronAPI } from '@/lib/electron'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import toast from 'react-hot-toast'

interface M29Item {
  id: number
  materialName: string
  unit: string
  normQuantity: number
  actualQuantity: number
  deviation: number
  price: number
  normCost: number
  actualCost: number
  deviationCost: number
  reason?: string
}

interface M29Document {
  id: number
  number: string
  date: string
  period: string
  objectName: string
  objectAddress: string
  contractor: string
  status: 'draft' | 'approved' | 'closed'
  items: M29Item[]
  totalNormCost: number
  totalActualCost: number
  totalDeviation: number
  project_id?: number
  estimate_id?: number
}

const statusConfig = {
  draft: { label: 'Черновик', color: 'badge-warning', icon: Clock },
  approved: { label: 'Утверждён', color: 'badge-success', icon: CheckCircle },
  closed: { label: 'Закрыт', color: 'badge-secondary', icon: FileSpreadsheet },
}

export default function M29List() {
  const [search, setSearch] = useState('')
  const [selectedDoc, setSelectedDoc] = useState<M29Document | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedEstimateId, setSelectedEstimateId] = useState<number | null>(null)
  const queryClient = useQueryClient()

  // Загрузка M29 из БД
  const { data: m29Data, isLoading } = useQuery({
    queryKey: ['m29-docs'],
    queryFn: () => m29Api.list()
  })

  // Загрузка смет для создания M29
  const { data: estimatesData } = useQuery({
    queryKey: ['estimates'],
    queryFn: () => estimatesApi.list()
  })

  const documents: M29Document[] = (m29Data?.data?.items || []).map((doc: any) => ({
    id: doc.id,
    number: doc.number || `М29-${doc.id}`,
    date: doc.date || new Date().toISOString(),
    period: doc.period || formatDate(doc.date),
    objectName: doc.object_name || 'Объект',
    objectAddress: doc.address || '',
    contractor: doc.contractor || 'Подрядчик',
    status: doc.status || 'draft',
    items: doc.items || [],
    totalNormCost: doc.total_norm_cost || 0,
    totalActualCost: doc.total_actual_cost || 0,
    totalDeviation: (doc.total_actual_cost || 0) - (doc.total_norm_cost || 0),
    project_id: doc.project_id,
    estimate_id: doc.estimate_id
  }))
  
  const estimates = estimatesData?.data?.items || []

  const filteredDocs = documents.filter(doc => {
    const matchesSearch = !search || 
      doc.number.toLowerCase().includes(search.toLowerCase()) ||
      doc.objectName.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || doc.status === statusFilter
    return matchesSearch && matchesStatus
  })

  // Создание M29 из сметы
  const createMutation = useMutation({
    mutationFn: (data: any) => m29Api.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['m29-docs'] })
      toast.success('Ведомость М-29 создана!')
      setShowCreateModal(false)
      setSelectedEstimateId(null)
    },
    onError: () => toast.error('Ошибка создания М-29')
  })

  // Создать М-29 из выбранной сметы
  const createFromEstimate = async () => {
    if (!selectedEstimateId) {
      toast.error('Выберите смету')
      return
    }
    const estimate = estimates.find((e: any) => e.id === selectedEstimateId)
    if (!estimate) return

    await createMutation.mutateAsync({
      project_id: estimate.project_id,
      estimate_id: selectedEstimateId,
      number: `М29-${estimate.number || selectedEstimateId}-${Date.now() % 1000}`,
      date: new Date().toISOString().split('T')[0],
      object_name: estimate.name,
      total_norm_cost: estimate.materials_cost || 0,
      total_actual_cost: estimate.materials_cost || 0,
      status: 'draft'
    })
  }

  // Генерация документа M29
  const generateDoc = async (docId: number) => {
    if (!isElectron()) {
      toast.error('Генерация доступна только в Desktop версии')
      return
    }
    try {
      const electronApi = getElectronAPI()
      const result = await electronApi?.docs.generateM29(docId)
      if (result?.path) {
        toast.success('Документ М-29 создан!')
        electronApi?.shell.openPath(result.path)
      }
    } catch (e: any) {
      console.error(e)
      toast.error('Ошибка генерации: ' + (e.message || 'Неизвестная ошибка'))
    }
  }

  const exportToPDF = (doc: M29Document) => {
    const pdf = new jsPDF('landscape')
    const pw = pdf.internal.pageSize.width

    // Заголовок
    pdf.setFontSize(10)
    pdf.text('Унифицированная форма № М-29', 14, 15)
    
    pdf.setFontSize(14)
    pdf.setFont('helvetica', 'bold')
    pdf.text('ВЕДОМОСТЬ СПИСАНИЯ МАТЕРИАЛОВ', pw/2, 25, { align: 'center' })
    
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'normal')
    pdf.text(`№ ${doc.number} от ${formatDate(doc.date)}`, pw/2, 32, { align: 'center' })
    pdf.text(`Отчётный период: ${doc.period}`, pw/2, 38, { align: 'center' })

    // Информация об объекте
    pdf.setFontSize(9)
    pdf.text(`Объект: ${doc.objectName}`, 14, 48)
    pdf.text(`Адрес: ${doc.objectAddress}`, 14, 54)
    pdf.text(`Подрядчик: ${doc.contractor}`, 14, 60)

    // Таблица
    const tableData = doc.items.map((item, i) => [
      i + 1,
      item.materialName,
      item.unit,
      item.normQuantity,
      item.actualQuantity,
      item.deviation > 0 ? `+${item.deviation}` : item.deviation,
      formatCurrency(item.price),
      formatCurrency(item.normCost),
      formatCurrency(item.actualCost),
      item.deviation > 0 ? `+${formatCurrency(item.deviationCost)}` : formatCurrency(item.deviationCost),
      item.reason || '-'
    ])

    autoTable(pdf, {
      startY: 68,
      head: [[
        '№', 'Наименование материала', 'Ед.', 
        'По норме', 'Факт', 'Откл.',
        'Цена', 'Сумма норма', 'Сумма факт', 'Откл. сумма',
        'Причина'
      ]],
      body: tableData,
      foot: [[
        '', 'ИТОГО:', '', '', '', '',
        '', formatCurrency(doc.totalNormCost), formatCurrency(doc.totalActualCost),
        doc.totalDeviation > 0 ? `+${formatCurrency(doc.totalDeviation)}` : formatCurrency(doc.totalDeviation),
        ''
      ]],
      theme: 'grid',
      headStyles: { fillColor: [66, 66, 66], fontSize: 7, halign: 'center' },
      footStyles: { fillColor: [240, 240, 240], fontStyle: 'bold', fontSize: 8 },
      styles: { fontSize: 7, cellPadding: 2 },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { cellWidth: 50 },
        2: { halign: 'center', cellWidth: 12 },
        3: { halign: 'center', cellWidth: 18 },
        4: { halign: 'center', cellWidth: 18 },
        5: { halign: 'center', cellWidth: 15 },
        6: { halign: 'right', cellWidth: 22 },
        7: { halign: 'right', cellWidth: 25 },
        8: { halign: 'right', cellWidth: 25 },
        9: { halign: 'right', cellWidth: 25 },
        10: { cellWidth: 35 },
      },
    })

    const finalY = (pdf as any).lastAutoTable.finalY + 15

    // Подписи
    pdf.setFontSize(9)
    pdf.text('Материально-ответственное лицо:', 14, finalY)
    pdf.text('_________________ / _________________', 14, finalY + 10)
    
    pdf.text('Проверил:', pw/2 - 30, finalY)
    pdf.text('_________________ / _________________', pw/2 - 30, finalY + 10)
    
    pdf.text('Утвердил:', pw - 80, finalY)
    pdf.text('_________________ / _________________', pw - 80, finalY + 10)

    pdf.save(`М-29_${doc.number}.pdf`)
    toast.success('М-29 экспортирован в PDF')
  }

  const exportToExcel = (doc: M29Document) => {
    const data = doc.items.map((item, i) => ({
      '№': i + 1,
      'Наименование': item.materialName,
      'Ед.изм.': item.unit,
      'По норме': item.normQuantity,
      'Фактически': item.actualQuantity,
      'Отклонение': item.deviation,
      'Цена': item.price,
      'Сумма по норме': item.normCost,
      'Сумма фактическая': item.actualCost,
      'Отклонение сумма': item.deviationCost,
      'Причина': item.reason || '',
    }))
    
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'М-29')
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    saveAs(new Blob([buf]), `М-29_${doc.number}.xlsx`)
    toast.success('Экспорт в Excel выполнен')
  }

  // Статистика
  const totalDocs = documents.length
  const approvedDocs = documents.filter(d => d.status === 'approved').length
  const totalDeviation = documents.reduce((sum, d) => sum + d.totalDeviation, 0)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Заголовок */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileSpreadsheet className="w-7 h-7 text-emerald-600" />
            Форма М-29
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Ведомости списания материалов на объекты
          </p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Новая ведомость
        </button>
      </div>

      {/* Подсказка */}
      <div className="card bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-emerald-600" />
          <div>
            <p className="font-medium text-emerald-900 dark:text-emerald-100">Форма М-29</p>
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              Ведомость создаётся на основе сметы для учёта фактического расхода материалов.
            </p>
          </div>
        </div>
      </div>

      {/* Форма создания */}
      {showCreateModal && (
        <div className="card p-4 border-2 border-emerald-200 dark:border-emerald-800">
          <h3 className="font-medium mb-3">Создать М-29 на основе сметы</h3>
          {estimates.length === 0 ? (
            <p className="text-slate-500">Сначала создайте смету</p>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Выберите смету:</label>
                <select
                  value={selectedEstimateId || ''}
                  onChange={(e) => setSelectedEstimateId(Number(e.target.value) || null)}
                  className="w-full p-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
                >
                  <option value="">-- Выберите --</option>
                  {estimates.map((est: any) => (
                    <option key={est.id} value={est.id}>
                      {est.number || `#${est.id}`} — {est.name} ({formatCurrency(est.materials_cost || est.total_cost || 0)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={createFromEstimate}
                  disabled={!selectedEstimateId || createMutation.isPending}
                  className="btn-primary"
                >
                  {createMutation.isPending ? 'Создание...' : 'Создать М-29'}
                </button>
                <button
                  onClick={() => { setShowCreateModal(false); setSelectedEstimateId(null) }}
                  className="btn-secondary"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Всего ведомостей</p>
            <p className="text-xl font-bold">{totalDocs}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <CheckCircle className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Утверждено</p>
            <p className="text-xl font-bold">{approvedDocs}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Package className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">На проверке</p>
            <p className="text-xl font-bold">{totalDocs - approvedDocs}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center",
            totalDeviation >= 0 ? "bg-red-100 dark:bg-red-900/30" : "bg-green-100 dark:bg-green-900/30"
          )}>
            <Package className={cn("w-6 h-6", totalDeviation >= 0 ? "text-red-600" : "text-green-600")} />
          </div>
          <div>
            <p className="text-sm text-slate-500">Отклонение (всего)</p>
            <p className={cn(
              "text-xl font-bold",
              totalDeviation >= 0 ? "text-red-600" : "text-green-600"
            )}>
              {totalDeviation >= 0 ? '+' : ''}{formatCurrency(totalDeviation)}
            </p>
          </div>
        </div>
      </div>

      {/* Фильтры */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Поиск по номеру или объекту..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input"
          >
            <option value="all">Все статусы</option>
            <option value="draft">Черновики</option>
            <option value="approved">Утверждённые</option>
            <option value="closed">Закрытые</option>
          </select>
        </div>
      </div>

      {/* Список документов */}
      <div className="space-y-4">
        {filteredDocs.map(doc => {
          const status = statusConfig[doc.status]
          const StatusIcon = status.icon

          return (
            <div key={doc.id} className="card p-5 hover:shadow-lg transition-shadow">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                {/* Основная информация */}
                <div className="flex-1">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                      <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold">{doc.number}</h3>
                        <span className={`badge ${status.color} flex items-center gap-1`}>
                          <StatusIcon className="w-3 h-3" />
                          {status.label}
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400">{doc.objectName}</p>
                      <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {doc.period}
                        </span>
                        <span className="flex items-center gap-1">
                          <Building2 className="w-4 h-4" />
                          {doc.contractor}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Суммы */}
                <div className="grid grid-cols-3 gap-4 text-center lg:w-80">
                  <div>
                    <p className="text-xs text-slate-500">По норме</p>
                    <p className="font-semibold">{formatCurrency(doc.totalNormCost)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Факт</p>
                    <p className="font-semibold">{formatCurrency(doc.totalActualCost)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Откл.</p>
                    <p className={cn(
                      "font-semibold",
                      doc.totalDeviation > 0 ? "text-red-600" : "text-green-600"
                    )}>
                      {doc.totalDeviation > 0 ? '+' : ''}{formatCurrency(doc.totalDeviation)}
                    </p>
                  </div>
                </div>

                {/* Действия */}
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setSelectedDoc(selectedDoc?.id === doc.id ? null : doc)}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg" 
                    title="Просмотр"
                  >
                    <Edit className="w-5 h-5 text-slate-500" />
                  </button>
                  <button 
                    onClick={() => generateDoc(doc.id)}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg" 
                    title="Сгенерировать PDF (Desktop)"
                  >
                    <Download className="w-5 h-5 text-slate-500" />
                  </button>
                  <button 
                    onClick={() => exportToExcel(doc)}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg" 
                    title="Экспорт в Excel"
                  >
                    <FileSpreadsheet className="w-5 h-5 text-green-600" />
                  </button>
                  <button 
                    onClick={() => exportToPDF(doc)}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg" 
                    title="PDF"
                  >
                    <Printer className="w-5 h-5 text-slate-500" />
                  </button>
                </div>
              </div>

              {/* Развёрнутая таблица при выборе */}
              {selectedDoc?.id === doc.id && (
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-slate-800">
                          <th className="p-2 text-center">№</th>
                          <th className="p-2 text-left">Материал</th>
                          <th className="p-2 text-center">Ед.</th>
                          <th className="p-2 text-center">Норма</th>
                          <th className="p-2 text-center">Факт</th>
                          <th className="p-2 text-center">Откл.</th>
                          <th className="p-2 text-right">Цена</th>
                          <th className="p-2 text-right">Сумма норма</th>
                          <th className="p-2 text-right">Сумма факт</th>
                          <th className="p-2 text-left">Причина</th>
                        </tr>
                      </thead>
                      <tbody>
                        {doc.items.map((item, i) => (
                          <tr key={item.id} className="border-b border-slate-100 dark:border-slate-800">
                            <td className="p-2 text-center">{i + 1}</td>
                            <td className="p-2">{item.materialName}</td>
                            <td className="p-2 text-center">{item.unit}</td>
                            <td className="p-2 text-center">{item.normQuantity}</td>
                            <td className="p-2 text-center">{item.actualQuantity}</td>
                            <td className={cn(
                              "p-2 text-center font-medium",
                              item.deviation > 0 ? "text-red-600" : item.deviation < 0 ? "text-green-600" : ""
                            )}>
                              {item.deviation > 0 ? '+' : ''}{item.deviation}
                            </td>
                            <td className="p-2 text-right">{formatCurrency(item.price)}</td>
                            <td className="p-2 text-right">{formatCurrency(item.normCost)}</td>
                            <td className="p-2 text-right">{formatCurrency(item.actualCost)}</td>
                            <td className="p-2 text-slate-500">{item.reason || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="font-bold bg-slate-50 dark:bg-slate-900">
                          <td colSpan={7} className="p-2 text-right">ИТОГО:</td>
                          <td className="p-2 text-right">{formatCurrency(doc.totalNormCost)}</td>
                          <td className="p-2 text-right">{formatCurrency(doc.totalActualCost)}</td>
                          <td className={cn(
                            "p-2",
                            doc.totalDeviation > 0 ? "text-red-600" : "text-green-600"
                          )}>
                            {doc.totalDeviation > 0 ? '+' : ''}{formatCurrency(doc.totalDeviation)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <button 
                    onClick={() => setSelectedDoc(null)}
                    className="mt-3 text-sm text-slate-500 hover:text-slate-700"
                  >
                    Свернуть
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {filteredDocs.length === 0 && (
        <div className="card p-12 text-center">
          <FileSpreadsheet className="w-16 h-16 mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium mb-2">Ведомости не найдены</h3>
          <p className="text-slate-500 mb-6">
            Создайте ведомость М-29 для учёта материалов на объекте
          </p>
          <button onClick={() => setShowCreateModal(true)} className="btn-primary"><Plus className="w-4 h-4 mr-2" />Создать ведомость</button>
        </div>
      )}
    </div>
  )
}

