import { useState, Fragment } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Search,
  Filter,
  FileText,
  FileCheck,
  FileSignature,
  Briefcase,
  MoreVertical,
  Copy,
  Trash2,
  CheckCircle,
  Clock,
  AlertCircle,
  Camera,
  Sparkles,
  Edit,
  Eye,
  FileSpreadsheet,
  Upload,
  ChevronDown
} from 'lucide-react'
import { estimatesApi } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import CreateEstimateModal from '@/components/CreateEstimateModal'
import DefektovkaInlineEditor from '@/components/DefektovkaInlineEditor'
import toast from 'react-hot-toast'

const statusConfig = {
  draft: { label: 'Черновик', icon: Clock, class: 'badge-warning' },
  in_review: { label: 'На проверке', icon: AlertCircle, class: 'badge-info' },
  approved: { label: 'Утверждена', icon: CheckCircle, class: 'badge-success' },
  rejected: { label: 'Отклонена', icon: AlertCircle, class: 'badge-danger' },
}

const typeLabels = {
  local: 'Локальная',
  object: 'Объектная',
  summary: 'Сводная',
  resource: 'Ресурсная',
  defect: 'Дефектовка'
}

interface ImportFileResult {
  success?: boolean
  filePath?: string
  error?: string
}

interface ParseResult<TData> {
  success?: boolean
  data?: TData
  error?: string
}

interface CreateEstimateResult {
  success?: boolean
  error?: string
  stats?: {
    sections?: number
    items?: number
    totals?: {
      total?: number
    }
  }
}

interface DefektovkaImportData {
  isSmeta2007Format?: boolean
  coefficients: {
    work_coef?: number
    material_coef?: number
  }
}

interface ElectronImportBridge {
  selectExcelFile?: () => Promise<ImportFileResult>
  parseEstimateExcel?: (filePath: string) => Promise<ParseResult<unknown>>
  createEstimateFromData?: (projectId: number | null, data: unknown) => Promise<CreateEstimateResult>
  parseDefektovka?: (filePath: string) => Promise<ParseResult<DefektovkaImportData>>
  createEstimateFromDefektovka?: (projectId: number | null, data: unknown) => Promise<CreateEstimateResult>
}

export default function Estimates() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(searchParams.get('new') === 'true')
  const [showFilters, setShowFilters] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [activeMenu, setActiveMenu] = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [expandedDefects, setExpandedDefects] = useState<Set<number>>(new Set())
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const importBridge = (window.electronAPI as typeof window.electronAPI & { import?: ElectronImportBridge } | undefined)?.import

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['estimates', search, statusFilter, typeFilter],
    queryFn: () => estimatesApi.list({
      search: search || undefined,
      status: statusFilter || undefined,
      estimate_type: typeFilter || undefined
    }),
  })

  // Мутация для удаления
  const deleteMutation = useMutation({
    mutationFn: (id: number) => estimatesApi.delete(id),
    onSuccess: () => {
      toast.success('Смета удалена')
      queryClient.invalidateQueries({ queryKey: ['estimates'] })
      setDeleteConfirm(null)
    },
    onError: () => {
      toast.error('Ошибка при удалении сметы')
    }
  })

  // Мутация для копирования
  const copyMutation = useMutation({
    mutationFn: async (id: number) => {
      // Получаем смету
      const response = await estimatesApi.get(id)
      const original = response.data
      if (!original) {
        throw new Error('Смета не найдена')
      }
      // Создаем копию
      return estimatesApi.create({
        name: `${original.name} (копия)`,
        number: `${original.number}-COPY`,
        estimate_type: original.estimate_type,
        description: original.description,
        overhead_percent: original.overhead_percent,
        profit_percent: original.profit_percent,
        vat_percent: original.vat_percent,
      })
    },
    onSuccess: (response) => {
      toast.success('Смета скопирована')
      queryClient.invalidateQueries({ queryKey: ['estimates'] })
      navigate(`/estimates/${response.data.id}`)
    },
    onError: () => {
      toast.error('Ошибка при копировании сметы')
    }
  })

  const estimates = data?.data?.items || []

  const toggleDefectRow = (id: number) => {
    setExpandedDefects(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Обработчик удаления
  const handleDelete = (id: number) => {
    deleteMutation.mutate(id)
  }

  // Обработчик копирования
  const handleCopy = (id: number) => {
    setActiveMenu(null)
    copyMutation.mutate(id)
  }

  // Экспорт в PDF
  const handleExportExcel = async (id?: number) => {
    void id
    toast.success('Для экспорта в PDF откройте смету и нажмите кнопку PDF')
  }

  // Генерация документов
  const handleGenerateDocument = async (id?: number, type?: string) => {
    void id
    void type
    toast.success('Для генерации документов откройте смету и выберите нужный документ')
  }

  // Сброс фильтров
  const resetFilters = () => {
    setStatusFilter('')
    setTypeFilter('')
    setSearch('')
    setShowFilters(false)
  }

  // Закрытие меню при клике вне
  const handleClickOutside = () => {
    if (activeMenu !== null) {
      setActiveMenu(null)
    }
  }

  // Импорт из Excel
  const handleImport = async () => {
    if (!importBridge?.selectExcelFile || !importBridge.parseEstimateExcel || !importBridge.createEstimateFromData) {
      toast.error('Функция доступна только в десктопной версии')
      return
    }

    try {
      const toastId = toast.loading('Выбор файла...')
      const fileResult = await importBridge.selectExcelFile()

      if (!fileResult.success || !fileResult.filePath) {
        toast.dismiss(toastId)
        return
      }

      toast.loading('Чтение файла...', { id: toastId })
      const parseResult = await importBridge.parseEstimateExcel(fileResult.filePath)

      if (!parseResult.success || !parseResult.data) {
        toast.error('Ошибка чтения файла: ' + parseResult.error, { id: toastId })
        return
      }

      toast.loading('Создание сметы...', { id: toastId })
      const createResult = await importBridge.createEstimateFromData(null, parseResult.data)

      if (createResult.success) {
        toast.success('Смета успешно импортирована', { id: toastId })
        refetch()
      } else {
        toast.error('Ошибка создания сметы: ' + createResult.error, { id: toastId })
      }
    } catch (error) {
      console.error(error)
      toast.error('Произошла ошибка при импорте')
    }
  }

  // Импорт дефектовки (формат ZARU AI смета)
  const handleImportDefektovka = async () => {
    if (!importBridge?.selectExcelFile || !importBridge.parseDefektovka || !importBridge.createEstimateFromDefektovka) {
      toast.error('Функция доступна только в десктопной версии')
      return
    }

    try {
      const toastId = toast.loading('Выбор файла дефектовки...')
      const fileResult = await importBridge.selectExcelFile()

      if (!fileResult.success || !fileResult.filePath) {
        toast.dismiss(toastId)
        return
      }

      toast.loading('Анализ дефектовки...', { id: toastId })
      const parseResult = await importBridge.parseDefektovka(fileResult.filePath)

      if (!parseResult.success || !parseResult.data) {
        toast.error('Ошибка чтения файла: ' + parseResult.error, { id: toastId })
        return
      }

      const data = parseResult.data
      
      // Показываем информацию о найденных данных
      const info = data.isSmeta2007Format 
        ? `Формат ZARU AI смета\nКоэфф. работ: ${data.coefficients.work_coef}\nКоэфф. материалов: ${data.coefficients.material_coef}`
        : 'Стандартный формат'
      
      toast.loading(`Создание сметы...\n${info}`, { id: toastId })
      const createResult = await importBridge.createEstimateFromDefektovka(null, data)

      if (createResult.success) {
        const stats = createResult.stats
        const sectionsCount = stats?.sections ?? 0
        const itemsCount = stats?.items ?? 0
        const totalAmount = stats?.totals?.total ?? 0
        toast.success(
          `Смета создана!\nРазделов: ${sectionsCount}, Позиций: ${itemsCount}\nИтого: ${totalAmount.toLocaleString('ru-RU')} ₽`,
          { id: toastId, duration: 5000 }
        )
        refetch()
      } else {
        toast.error('Ошибка создания сметы: ' + createResult.error, { id: toastId })
      }
    } catch (error) {
      console.error(error)
      toast.error('Произошла ошибка при импорте дефектовки')
    }
  }

  return (
    <div className="space-y-6 animate-fade-in" onClick={handleClickOutside}>
      {/* Заголовок */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Сметы</h1>
          <p className="text-slate-600 dark:text-slate-400">
            Управление локальными, объектными и сводными сметами
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/scanner')}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
          >
            <Camera className="w-5 h-5" />
            <span className="hidden sm:inline">AI Сканер</span>
            <Sparkles className="w-4 h-4 text-violet-500" />
          </button>

          <button
            onClick={handleImport}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all shadow-sm hover:shadow-md"
          >
            <FileSpreadsheet className="w-5 h-5" />
            <span className="hidden sm:inline">Импорт Excel</span>
          </button>

          <button
            onClick={handleImportDefektovka}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-all shadow-sm hover:shadow-md"
            title="Импорт дефектовки формата ZaruAI Смета с автоматическим расчётом коэффициентов"
          >
            <Upload className="w-5 h-5" />
            <span className="hidden sm:inline">Дефектовка</span>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Новая смета
          </button>
        </div>
      </div>

      {/* Поиск и фильтры */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Поиск по названию или номеру..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`btn-secondary flex items-center gap-2 ${showFilters ? 'ring-2 ring-primary-500' : ''}`}
        >
          <Filter className="w-5 h-5" />
          Фильтры
          {(statusFilter || typeFilter) && (
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary-500 text-white rounded-full">
              {(statusFilter ? 1 : 0) + (typeFilter ? 1 : 0)}
            </span>
          )}
        </button>
      </div>

      {/* Панель фильтров */}
      {showFilters && (
        <div className="card p-4 animate-fade-in">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium mb-1">Статус</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="input"
              >
                <option value="">Все статусы</option>
                <option value="draft">Черновик</option>
                <option value="in_review">На проверке</option>
                <option value="approved">Утверждена</option>
                <option value="rejected">Отклонена</option>
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium mb-1">Тип сметы</label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="input"
              >
                <option value="">Все типы</option>
                <option value="local">Локальная</option>
                <option value="object">Объектная</option>
                <option value="summary">Сводная</option>
                <option value="resource">Ресурсная</option>
                <option value="defect">Дефектовка</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={resetFilters}
                className="btn-secondary"
              >
                Сбросить
              </button>
              <button
                onClick={() => refetch()}
                className="btn-primary"
              >
                Применить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Список смет */}
      {isLoading ? (
        <div className="card p-8 text-center">
          <div className="animate-pulse">Загрузка...</div>
        </div>
      ) : estimates.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600" />
          <h3 className="mt-4 text-lg font-medium text-slate-900 dark:text-white">
            Сметы не найдены
          </h3>
          <p className="mt-2 text-slate-500">
            Создайте первую смету или воспользуйтесь AI сканером
          </p>
          <div className="flex justify-center gap-3 mt-4">
            <button
              onClick={() => navigate('/scanner')}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all"
            >
              <Camera className="w-5 h-5" />
              AI Сканер
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary"
            >
              Создать вручную
            </button>
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Номер</th>
                  <th>Наименование</th>
                  <th>Тип</th>
                  <th>Статус</th>
                  <th className="text-right">Сумма</th>
                  <th>Дата</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {estimates.map((estimate: any) => {
                  const status = statusConfig[estimate.status as keyof typeof statusConfig] || statusConfig.draft
                  const isDefect = estimate.estimate_type === 'defect'
                  const isExpanded = expandedDefects.has(estimate.id)
                  return (
                    <Fragment key={estimate.id}>
                      <tr key={estimate.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td>
                          <div className="flex items-center gap-2">
                            {isDefect && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleDefectRow(estimate.id)
                                }}
                                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                                title="Развернуть дефектовку"
                              >
                                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-0' : '-rotate-90'}`} />
                              </button>
                            )}
                            <Link
                              to={`/estimates/${estimate.id}`}
                              className="font-mono text-primary-600 hover:text-primary-700 hover:underline"
                            >
                              {estimate.number}
                            </Link>
                          </div>
                        </td>
                        <td>
                          <Link
                            to={`/estimates/${estimate.id}`}
                            className="font-medium text-slate-900 dark:text-white hover:text-primary-600"
                          >
                            {estimate.name}
                          </Link>
                        </td>
                        <td className="text-slate-500">
                          {typeLabels[(estimate.estimate_type || 'local') as keyof typeof typeLabels] || estimate.estimate_type}
                        </td>
                        <td>
                          <span className={`badge ${status.class} flex items-center gap-1 w-fit`}>
                            <status.icon className="w-3 h-3" />
                            {status.label}
                          </span>
                        </td>
                        <td className="text-right font-semibold">
                          {formatCurrency(estimate.total_with_vat)}
                        </td>
                        <td className="text-slate-500">
                          {formatDate(estimate.created_at)}
                        </td>
                        <td>
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setActiveMenu(activeMenu === estimate.id ? null : estimate.id)
                              }}
                              className="btn-ghost p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>

                          {/* Выпадающее меню */}
                          {activeMenu === estimate.id && (
                            <div
                              className="absolute right-0 top-full mt-1 w-64 py-1 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 z-50 animate-fade-in"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="px-4 py-2 text-xs font-semibold text-slate-500 bg-slate-50 dark:bg-slate-800/50">
                                Основное
                              </div>
                              <button
                                onClick={() => {
                                  setActiveMenu(null)
                                  navigate(`/estimates/${estimate.id}`)
                                }}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors"
                              >
                                <Eye className="w-4 h-4 text-slate-500" />
                                Просмотр
                              </button>
                              <button
                                onClick={() => {
                                  setActiveMenu(null)
                                  navigate(`/estimates/${estimate.id}`)
                                }}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors"
                              >
                                <Edit className="w-4 h-4 text-slate-500" />
                                Редактировать
                              </button>
                              <button
                                onClick={() => handleCopy(estimate.id)}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors"
                              >
                                <Copy className="w-4 h-4 text-slate-500" />
                                Копировать
                              </button>

                              <div className="border-t border-slate-100 dark:border-slate-700 my-1"></div>
                              <div className="px-4 py-2 text-xs font-semibold text-slate-500 bg-slate-50 dark:bg-slate-800/50">
                                Документы
                              </div>

                              <button
                                onClick={() => {
                                  if (confirm('Сформировать договор подряда?')) {
                                    handleGenerateDocument(estimate.id, 'contract-individual')
                                  }
                                  setActiveMenu(null)
                                }}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors text-purple-600"
                              >
                                <Briefcase className="w-4 h-4" />
                                Договор подряда
                              </button>

                              <button
                                onClick={() => {
                                  handleGenerateDocument(estimate.id, 'ks2')
                                  setActiveMenu(null)
                                }}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors text-blue-600"
                              >
                                <FileCheck className="w-4 h-4" />
                                Акт КС-2
                              </button>

                              <button
                                onClick={() => {
                                  handleGenerateDocument(estimate.id, 'ks3')
                                  setActiveMenu(null)
                                }}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors text-blue-600"
                              >
                                <FileSignature className="w-4 h-4" />
                                Справка КС-3
                              </button>

                              <button
                                onClick={() => {
                                  handleGenerateDocument(estimate.id, 'm29')
                                  setActiveMenu(null)
                                }}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors text-emerald-600"
                              >
                                <FileText className="w-4 h-4" />
                                Ведомость М-29
                              </button>

                              <button
                                onClick={() => {
                                  handleGenerateDocument(estimate.id, 'commercial-offer')
                                  setActiveMenu(null)
                                }}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors text-amber-600"
                              >
                                <FileText className="w-4 h-4" />
                                Коммерческое предл.
                              </button>

                              <div className="border-t border-slate-100 dark:border-slate-700 my-1"></div>

                              <button
                                onClick={() => handleExportExcel(estimate.id)}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors"
                              >
                                <FileSpreadsheet className="w-4 h-4 text-slate-500" />
                                Экспорт в PDF
                              </button>

                              <div className="border-t border-slate-100 dark:border-slate-700 my-1"></div>

                              <button
                                onClick={() => {
                                  setActiveMenu(null)
                                  setDeleteConfirm(estimate.id)
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                                Удалить
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isDefect && isExpanded && (
                      <tr key={`${estimate.id}-defect`}>
                        <td colSpan={7} className="p-0">
                          <DefektovkaInlineEditor estimateId={estimate.id} />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Модальное окно создания */}
      {showCreateModal && (
        <CreateEstimateModal onClose={() => {
          setShowCreateModal(false)
          setSearchParams({})
        }} />
      )}

      {/* Модальное окно подтверждения удаления */}
      {deleteConfirm !== null && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/50" onClick={() => setDeleteConfirm(null)} />
          <div className="relative min-h-full flex items-center justify-center p-4">
            <div className="relative bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-md p-6 animate-fade-in">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Удалить смету?
                  </h3>
                  <p className="text-sm text-slate-500">
                    Это действие нельзя отменить
                  </p>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 btn-secondary"
                >
                  Отмена
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  disabled={deleteMutation.isPending}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {deleteMutation.isPending ? 'Удаление...' : 'Удалить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
