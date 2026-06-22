/**
 * ZARU Смета - КС-3 с реальным API
 * Справки о стоимости на основе КС-2
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ks3Api, ks2Api } from '@/lib/api'
import {
  FileSpreadsheet,
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

const statusConfig = {
  draft: { label: 'Черновик', icon: Clock, class: 'badge-warning' },
  pending: { label: 'На подпись', icon: AlertCircle, class: 'badge-info' },
  signed: { label: 'Подписан', icon: CheckCircle, class: 'badge-success' },
}

export default function KS3List() {
  const [search, setSearch] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [selectedKS2Ids, setSelectedKS2Ids] = useState<number[]>([])
  const queryClient = useQueryClient()

  // Загрузка КС-3 из БД
  const { data: ks3Data, isLoading } = useQuery({
    queryKey: ['ks3-certs'],
    queryFn: () => ks3Api.list()
  })

  // Загрузка КС-2 для создания КС-3
  const { data: ks2Data } = useQuery({
    queryKey: ['ks2-acts'],
    queryFn: () => ks2Api.list()
  })

  const certs = ks3Data?.data?.items || []
  const ks2Acts = ks2Data?.data?.items || []

  const filteredCerts = certs.filter((c: any) =>
    !search ||
    c.number?.toLowerCase().includes(search.toLowerCase()) ||
    c.project_name?.toLowerCase().includes(search.toLowerCase())
  )

  const totalAmount = certs.reduce((sum: number, c: any) => sum + (c.amount || 0), 0)

  // Создание КС-3 из КС-2
  const createMutation = useMutation({
    mutationFn: (data: any) => ks3Api.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ks3-certs'] })
      toast.success('Справка КС-3 создана!')
      setShowCreateForm(false)
      setSelectedKS2Ids([])
    },
    onError: () => toast.error('Ошибка создания КС-3')
  })

  // Удаление
  const deleteMutation = useMutation({
    mutationFn: (id: number) => ks3Api.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ks3-certs'] })
      toast.success('Справка удалена')
    }
  })

  // Создать КС-3 из выбранных КС-2
  const createFromKS2 = async () => {
    if (selectedKS2Ids.length === 0) {
      toast.error('Выберите хотя бы один акт КС-2')
      return
    }

    // Считаем суммы
    let totalAmount = 0
    let totalNoVat = 0
    let totalVat = 0

    // Берем данные первого акта для метаданных (даты и т.д.)
    const firstAct = ks2Acts.find((a: any) => a.id === selectedKS2Ids[0])
    if (!firstAct) return

    // Сначала считаем общую сумму
    selectedKS2Ids.forEach(id => {
      const act = ks2Acts.find((a: any) => a.id === id)
      if (act) {
        totalAmount += (act.amount || 0)
      }
    })
    
    // Правильный расчёт: сумма уже с НДС 20%
    // Сумма без НДС = Сумма с НДС / 1.2
    // НДС = Сумма с НДС - Сумма без НДС
    totalNoVat = Math.round(totalAmount / 1.2 * 100) / 100
    totalVat = Math.round((totalAmount - totalNoVat) * 100) / 100

    await createMutation.mutateAsync({
      project_id: firstAct.project_id,
      ks2_act_id: selectedKS2Ids[0], // Compat
      number: `КС3-${selectedKS2Ids.join('-')}`,
      date: new Date().toISOString().split('T')[0],
      period_from: firstAct.period_from || new Date().toISOString().split('T')[0],
      period_to: firstAct.period_to || new Date().toISOString().split('T')[0],
      amount_without_vat: totalNoVat,
      vat_amount: totalVat,
      amount: totalAmount,
      status: 'draft'
    })
  }

  // Генерация документа
  const generateDoc = async (certId: number) => {
    if (!isElectron()) {
      toast.error('Генерация доступна только в Desktop версии')
      return
    }
    try {
      const api = getElectronAPI()
      const result = await api?.docs.generateKS3(certId)
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
            <FileSpreadsheet className="w-7 h-7 text-blue-600" />
            Справки КС-3
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Всего: {certs.length} • Сумма: {formatCurrency(totalAmount)}
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Создать КС-3
        </button>
      </div>

      {/* Подсказка */}
      <div className="card bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-blue-600" />
          <div>
            <p className="font-medium text-blue-900 dark:text-blue-100">Важно!</p>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              <strong>КС-3 создаётся ТОЛЬКО на основе КС-2</strong>, не напрямую из сметы.
              Сначала создайте акт КС-2, затем на его основе — справку КС-3.
            </p>
          </div>
        </div>
      </div>

      {/* Форма создания */}
      {showCreateForm && (
        <div className="card p-4 border-2 border-blue-200 dark:border-blue-800">
          <h3 className="font-medium mb-3">Создать КС-3 на основе акта КС-2</h3>

          {ks2Acts.length === 0 ? (
            <div>
              <p className="text-slate-500 mb-2">Сначала создайте акт КС-2</p>
              <Link to="/ks2" className="text-blue-600 hover:underline">
                Перейти к КС-2 →
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Выберите КС-2:</label>
                <div className="border rounded-lg p-2 max-h-60 overflow-y-auto space-y-2 dark:border-slate-700">
                  {ks2Acts.map((act: any) => (
                    <label key={act.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedKS2Ids.includes(act.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedKS2Ids(prev => [...prev, act.id])
                          } else {
                            setSelectedKS2Ids(prev => prev.filter(id => id !== act.id))
                          }
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <div className="font-medium">{act.number} от {formatDate(act.date)}</div>
                        <div className="text-sm text-slate-500">{formatCurrency(act.amount || 0)}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="btn-ghost"
                >
                  Отмена
                </button>
                <button
                  onClick={createFromKS2}
                  disabled={createMutation.isPending || selectedKS2Ids.length === 0}
                  className="btn-primary"
                >
                  {createMutation.isPending ? 'Создание...' : `Создать справку (${selectedKS2Ids.length})`}
                </button>
              </div>
            </div>
          )}
        </div>
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

      {/* Список справок */}
      <div className="space-y-4">
        {filteredCerts.length === 0 ? (
          <div className="card p-12 text-center">
            <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <h3 className="text-lg font-medium mb-2">Нет справок КС-3</h3>
            <p className="text-slate-500">Создайте КС-3 на основе акта КС-2</p>
          </div>
        ) : (
          filteredCerts.map((cert: any) => {
            const status = statusConfig[cert.status as keyof typeof statusConfig] || statusConfig.draft
            const StatusIcon = status.icon

            return (
              <div key={cert.id} className="card p-4 hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-bold text-lg">{cert.number}</h3>
                      <span className={`badge ${status.class}`}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {status.label}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-slate-500">Дата:</span>
                        <p className="font-medium">{formatDate(cert.date)}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Без НДС:</span>
                        <p className="font-medium">{formatCurrency(cert.amount_without_vat || 0)}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">НДС:</span>
                        <p className="font-medium">{formatCurrency(cert.vat_amount || 0)}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Итого:</span>
                        <p className="font-bold text-green-600">{formatCurrency(cert.amount || 0)}</p>
                      </div>
                    </div>

                    {/* Связь с КС-2 */}
                    {cert.ks2_act_id && (
                      <div className="mt-2 flex items-center gap-2 text-sm text-blue-600">
                        <LinkIcon className="w-4 h-4" />
                        <Link to="/ks2" className="hover:underline">
                          На основе КС-2 #{cert.ks2_act_id}
                        </Link>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => generateDoc(cert.id)}
                      className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                      title="Скачать PDF"
                    >
                      <Download className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(cert.id)}
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
