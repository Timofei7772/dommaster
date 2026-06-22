/**
 * ZARU Смета - Договоры с реальным API
 * Подключение к базе данных + связь со сметами
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, contractsApi, estimatesApi } from '@/lib/api'
import {
  FileText,
  Plus,
  Search,
  CheckCircle,
  Clock,
  AlertCircle,
  Sparkles,
  FileSignature,
  User,
  Download,
  Trash2,
  Link as LinkIcon
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { isElectron } from '@/lib/electron'
import TemplateSelectionModal from '@/components/TemplateSelectionModal'

// Типы клиентов
const clientTypeLabels = {
  individual: { label: 'Физ. лицо', icon: User, color: 'text-blue-600 bg-blue-100' },
  legal: { label: 'Юр. лицо', icon: FileText, color: 'text-purple-600 bg-purple-100' },
  ip: { label: 'ИП', icon: FileSignature, color: 'text-amber-600 bg-amber-100' },
}

const statusConfig: Record<string, { label: string; icon: typeof Clock; class: string }> = {
  draft: { label: 'Черновик', icon: Clock, class: 'badge-warning' },
  active: { label: 'Активный', icon: FileSignature, class: 'badge-info' },
  completed: { label: 'Завершён', icon: CheckCircle, class: 'badge-success' },
  cancelled: { label: 'Отменён', icon: AlertCircle, class: 'badge-error' },
}

export default function Contracts() {
  const [search, setSearch] = useState('')
  const queryClient = useQueryClient()

  // Загрузка договоров из БД
  const { data: contractsData, isLoading } = useQuery({
    queryKey: ['contracts'],
    queryFn: () => contractsApi.list()
  })

  // Загрузка смет для выбора при создании договора
  const { data: estimatesData } = useQuery({
    queryKey: ['estimates'],
    queryFn: () => estimatesApi.list()
  })

  const contracts = contractsData?.data?.items || []
  const estimates = estimatesData?.data?.items || []

  const filteredContracts = contracts.filter((c: any) =>
    !search ||
    c.number?.toLowerCase().includes(search.toLowerCase()) ||
    c.client?.toLowerCase().includes(search.toLowerCase()) ||
    c.subject?.toLowerCase().includes(search.toLowerCase())
  )

  const totalValue = contracts.reduce((sum: number, c: any) => sum + (c.amount || 0), 0)
  const activeCount = contracts.filter((c: any) => c.status === 'active').length

  // Создание договора
  const createMutation = useMutation({
    mutationFn: (data: any) => contractsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      toast.success('Договор создан!')
    },
    onError: () => toast.error('Ошибка создания договора')
  })

  // Удаление договора
  const deleteMutation = useMutation({
    mutationFn: (id: number) => contractsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      toast.success('Договор удалён')
    }
  })

  // Состояние для выбора шаблона
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null)

  // Генерация документа
  const generateDoc = async (contractId: number) => {
    if (!isElectron()) {
      toast.error('Генерация доступна только в Desktop версии')
      return
    }
    // Открываем модальное окно выбора шаблона
    setSelectedContractId(contractId)
    setShowTemplateModal(true)
  }

  const handleTemplateSelect = async (templateId: string) => {
    if (!selectedContractId) return

    try {
      const result = await api.docs.generateContractFromTemplate(selectedContractId, templateId)

      if (result?.path) {
        toast.success('Документ создан!')
        await api.shell.openPath(result.path)
      }
    } catch (e: any) {
      console.error(e)
      toast.error('Ошибка: ' + (e.message || 'Не удалось создать документ'))
    } finally {
      setShowTemplateModal(false)
      setSelectedContractId(null)
    }
  }

  // Быстрое создание договора из сметы
  const createFromEstimate = async (estimateId: number) => {
    const estimate = estimates.find((e: any) => e.id === estimateId)
    if (!estimate) return

    await createMutation.mutateAsync({
      project_id: estimate.project_id,
      estimate_id: estimateId,
      number: `Д-${estimate.number || estimateId}`,
      date: new Date().toISOString().split('T')[0],
      client: estimate.project_name || '',
      client_type: 'individual',
      subject: estimate.name,
      amount: estimate.total_with_vat || estimate.total_cost || 0,
      prepayment_percent: 30,
      status: 'draft'
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Модальное окно выбора шаблона */}
      {showTemplateModal && (
        <TemplateSelectionModal
          onClose={() => setShowTemplateModal(false)}
          onSelect={handleTemplateSelect}
        />
      )}

      {/* Шапка */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-7 h-7 text-indigo-600" />
            Договоры подряда
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Всего: {contracts.length} • Активных: {activeCount} • Сумма: {formatCurrency(totalValue)}
          </p>
        </div>
      </div>

      {/* Подсказка про связь со сметами */}
      <div className="card bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-indigo-600" />
          <div>
            <p className="font-medium text-indigo-900 dark:text-indigo-100">Шаблоны договоров</p>
            <p className="text-sm text-indigo-700 dark:text-indigo-300">
              Договоры создаются автоматически из смет с заполненной суммой.
              Перейдите в смету и нажмите "Создать документы → Договор".
            </p>
          </div>
        </div>
      </div>

      {/* Поиск */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Поиск по номеру, клиенту..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
          />
        </div>
      </div>

      {/* Быстрое создание из сметы */}
      {estimates.length > 0 && (
        <div className="card p-4">
          <h3 className="font-medium mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Создать договор из сметы
          </h3>
          <div className="flex flex-wrap gap-2">
            {estimates.slice(0, 5).map((est: any) => (
              <button
                key={est.id}
                onClick={() => createFromEstimate(est.id)}
                disabled={createMutation.isPending}
                className="px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-lg text-sm hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
              >
                {est.number || `Смета #${est.id}`}: {formatCurrency(est.total_with_vat || est.total_cost || 0)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Список договоров */}
      <div className="space-y-4">
        {filteredContracts.length === 0 ? (
          <div className="card p-12 text-center">
            <FileText className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <h3 className="text-lg font-medium mb-2">Нет договоров</h3>
            <p className="text-slate-500 mb-4">
              Создайте договор из сметы или добавьте вручную
            </p>
          </div>
        ) : (
          filteredContracts.map((contract: any) => {
            const status = statusConfig[contract.status] || statusConfig.draft
            const StatusIcon = status.icon
            const clientType = clientTypeLabels[contract.client_type as keyof typeof clientTypeLabels] || clientTypeLabels.individual
            const ClientIcon = clientType.icon

            return (
              <div key={contract.id} className="card p-4 hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-bold text-lg">{contract.number}</h3>
                      <span className={`badge ${status.class}`}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {status.label}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${clientType.color}`}>
                        <ClientIcon className="w-3 h-3 inline mr-1" />
                        {clientType.label}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-slate-500">Клиент:</span>
                        <p className="font-medium">{contract.client || contract.client_name || '—'}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Предмет:</span>
                        <p className="font-medium truncate">{contract.subject || '—'}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Сумма:</span>
                        <p className="font-bold text-green-600">{formatCurrency(contract.amount || 0)}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Дата:</span>
                        <p className="font-medium">{formatDate(contract.date)}</p>
                      </div>
                    </div>

                    {/* Связь со сметой */}
                    {contract.estimate_id && (
                      <div className="mt-2 flex items-center gap-2 text-sm text-indigo-600">
                        <LinkIcon className="w-4 h-4" />
                        <Link to={`/estimates/${contract.estimate_id}`} className="hover:underline">
                          Связано со сметой #{contract.estimate_id}
                        </Link>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => generateDoc(contract.id)}
                      className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                      title="Скачать документ"
                    >
                      <Download className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(contract.id)}
                      className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg text-red-600"
                      title="Удалить"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

