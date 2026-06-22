/**
 * ZARU Смета - КС-2 с реальным API
 * Акты выполненных работ на основе смет
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ks2Api, estimatesApi } from '@/lib/api'
import {
  FileCheck,
  Plus,
  Search,
  Download,
  CheckCircle,
  Clock,
  AlertCircle,
  Sparkles,
  Trash2,
  Link as LinkIcon
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { isElectron, getElectronAPI } from '@/lib/electron'
import CreateKS2Modal from '@/components/CreateKS2Modal'

const statusConfig = {
  draft: { label: 'Черновик', icon: Clock, class: 'badge-warning' },
  pending: { label: 'На подпись', icon: AlertCircle, class: 'badge-info' },
  signed: { label: 'Подписан', icon: CheckCircle, class: 'badge-success' },
}

export default function KS2List() {
  const [search, setSearch] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [selectedEstimateId, setSelectedEstimateId] = useState<number | null>(null)
  const [showItemsModal, setShowItemsModal] = useState(false)
  const queryClient = useQueryClient()

  // Загрузка КС-2 из БД
  const { data: ks2Data, isLoading } = useQuery({
    queryKey: ['ks2-acts'],
    queryFn: () => ks2Api.list()
  })

  // Загрузка смет для создания КС-2
  const { data: estimatesData } = useQuery({
    queryKey: ['estimates'],
    queryFn: () => estimatesApi.list()
  })

  const acts = ks2Data?.data?.items || []
  const estimates = estimatesData?.data?.items || []

  const filteredActs = acts.filter((a: any) =>
    !search ||
    a.number?.toLowerCase().includes(search.toLowerCase()) ||
    a.project_name?.toLowerCase().includes(search.toLowerCase())
  )

  const totalAmount = acts.reduce((sum: number, a: any) => sum + (a.amount || 0), 0)

  // Создание КС-2 из сметы
  const createMutation = useMutation({
    mutationFn: (data: any) => ks2Api.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ks2-acts'] })
      toast.success('Акт КС-2 создан!')
      setShowCreateForm(false)
      setSelectedEstimateId(null)
    },
    onError: () => toast.error('Ошибка создания КС-2')
  })

  // Удаление
  const deleteMutation = useMutation({
    mutationFn: (id: number) => ks2Api.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ks2-acts'] })
      toast.success('Акт удалён')
    }
  })

  // Создать КС-2 из выбранной сметы
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
      number: `КС2-${estimate.number || selectedEstimateId}-${Date.now() % 1000}`,
      date: new Date().toISOString().split('T')[0],
      period_from: new Date().toISOString().split('T')[0],
      period_to: new Date().toISOString().split('T')[0],
      amount: estimate.total_with_vat || estimate.total_cost || 0,
      status: 'draft'
    })
  }

  // Генерация документа
  const generateDoc = async (actId: number) => {
    if (!isElectron()) {
      toast.error('Генерация доступна только в Desktop версии')
      return
    }
    try {
      const api = getElectronAPI()
      const result = await api?.docs.generateKS2(actId)
      if (result?.path) {
        toast.success('Документ создан!')
        api?.shell.openPath(result.path)
      }
    } catch {
      toast.error('Ошибка генерации')
    }
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
      {/* Шапка */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileCheck className="w-7 h-7 text-emerald-600" />
            Акты КС-2
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Всего: {acts.length} • Сумма: {formatCurrency(totalAmount)}
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Создать КС-2
        </button>
      </div>

      {/* Подсказка */}
      <div className="card bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-emerald-600" />
          <div>
            <p className="font-medium text-emerald-900 dark:text-emerald-100">Правильный порядок</p>
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              <strong>Смета → Договор → КС-2 → КС-3</strong>.
              КС-2 создаётся на основе сметы с указанием выполненного объёма работ.
            </p>
          </div>
        </div>
      </div>

      {/* Форма создания */}
      {showCreateForm && (
        <div className="card p-4 border-2 border-emerald-200 dark:border-emerald-800">
          <h3 className="font-medium mb-3">Создать КС-2 на основе сметы</h3>

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
                      {est.number || `#${est.id}`} — {est.name} ({formatCurrency(est.total_with_vat || est.total_cost || 0)})
                    </option>
                  ))}
                </select>
              </div>

              {selectedEstimateId && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                  <p className="text-sm">
                    <strong>Сумма акта:</strong>{' '}
                    {formatCurrency(estimates.find((e: any) => e.id === selectedEstimateId)?.total_with_vat || 0)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Вы можете выбрать конкретные позиции сметы для включения в акт.
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setShowItemsModal(true)}
                  disabled={!selectedEstimateId}
                  className="btn-primary"
                >
                  Выбрать позиции
                </button>
                <button
                  onClick={createFromEstimate}
                  disabled={!selectedEstimateId || createMutation.isPending}
                  className="btn-outline"
                >
                  {createMutation.isPending ? 'Создание...' : 'Создать со всеми позициями'}
                </button>
                <button
                  onClick={() => {
                    setShowCreateForm(false)
                    setSelectedEstimateId(null)
                  }}
                  className="btn-ghost"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Модальное окно выбора позиций */}
      {showItemsModal && selectedEstimateId && (
        <CreateKS2Modal
          estimateId={selectedEstimateId}
          onClose={() => setShowItemsModal(false)}
          onSuccess={() => {
            setShowCreateForm(false)
            setSelectedEstimateId(null)
            queryClient.invalidateQueries({ queryKey: ['ks2-acts'] })
          }}
        />
      )}

      {/* Поиск */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          placeholder="Поиск по номеру..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
        />
      </div>

      {/* Список актов */}
      <div className="space-y-4">
        {filteredActs.length === 0 ? (
          <div className="card p-12 text-center">
            <FileCheck className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <h3 className="text-lg font-medium mb-2">Нет актов КС-2</h3>
            <p className="text-slate-500">Создайте КС-2 на основе сметы</p>
          </div>
        ) : (
          filteredActs.map((act: any) => {
            const status = statusConfig[act.status as keyof typeof statusConfig] || statusConfig.draft
            const StatusIcon = status.icon

            return (
              <div key={act.id} className="card p-4 hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-bold text-lg">{act.number}</h3>
                      <span className={`badge ${status.class}`}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {status.label}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-slate-500">Дата:</span>
                        <p className="font-medium">{formatDate(act.date)}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Период:</span>
                        <p className="font-medium">
                          {formatDate(act.period_from)} — {formatDate(act.period_to)}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500">Сумма:</span>
                        <p className="font-bold text-green-600">{formatCurrency(act.amount || 0)}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Проект:</span>
                        <p className="font-medium truncate">{act.project_name || '—'}</p>
                      </div>
                    </div>

                    {/* Связь со сметой */}
                    {act.estimate_id && (
                      <div className="mt-2 flex items-center gap-2 text-sm text-emerald-600">
                        <LinkIcon className="w-4 h-4" />
                        <Link to={`/estimates/${act.estimate_id}`} className="hover:underline">
                          Смета #{act.estimate_id}
                        </Link>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => generateDoc(act.id)}
                      className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                      title="Скачать PDF"
                    >
                      <Download className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(act.id)}
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