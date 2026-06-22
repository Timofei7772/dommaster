import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  FileText,
  Search,
  ArrowRight,
  Calculator,
  Loader2,
} from 'lucide-react'
import { estimatesApi } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { useSettings } from '@/hooks/useSettings'
import KPPreviewModal from '@/components/KPPreviewModal'

export default function CommercialProposal() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { settings } = useSettings()
  const estimateIdParam = searchParams.get('estimate_id')

  // Если пришли с estimate_id — загружаем данные и открываем modal
  const [selectedEstimateId, setSelectedEstimateId] = useState<number | null>(
    estimateIdParam ? Number(estimateIdParam) : null
  )
  const [showKPModal, setShowKPModal] = useState(!!estimateIdParam)
  const [searchQuery, setSearchQuery] = useState('')

  // Загрузка списка смет (для выбора)
  const { data: estimatesList, isLoading: isLoadingList } = useQuery({
    queryKey: ['estimates-for-kp'],
    queryFn: () => estimatesApi.list(),
    enabled: !selectedEstimateId,
  })

  // Загрузка конкретной сметы (для modal)
  const { data: estimateData, isLoading: isLoadingEstimate } = useQuery({
    queryKey: ['estimate', selectedEstimateId],
    queryFn: () => estimatesApi.get(selectedEstimateId!),
    enabled: !!selectedEstimateId,
  })

  // Загрузка позиций сметы
  const { data: itemsData, isLoading: isLoadingItems } = useQuery({
    queryKey: ['estimate-items', selectedEstimateId],
    queryFn: () => estimatesApi.getItems(selectedEstimateId!),
    enabled: !!selectedEstimateId,
  })

  const estimate = estimateData?.data
  const items = useMemo(() => itemsData?.data || [], [itemsData])

  // Когда данные загружены — открываем modal
  useEffect(() => {
    if (selectedEstimateId && estimate && items.length >= 0 && !isLoadingEstimate && !isLoadingItems) {
      setShowKPModal(true)
    }
  }, [selectedEstimateId, estimate, items, isLoadingEstimate, isLoadingItems])

  const handleSelectEstimate = (id: number) => {
    setSelectedEstimateId(id)
  }

  const handleCloseModal = () => {
    setShowKPModal(false)
    setSelectedEstimateId(null)
    // Убираем estimate_id из URL если был
    if (estimateIdParam) {
      navigate('/commercial-proposal', { replace: true })
    }
  }

  // Фильтрация смет по поисковому запросу
  const allEstimates = estimatesList?.data?.items || []
  const filteredEstimates = searchQuery
    ? allEstimates.filter((e: any) =>
        (e.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.number || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.client_name || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allEstimates

  // Загрузка сметы по estimate_id из URL
  if (selectedEstimateId && (isLoadingEstimate || isLoadingItems)) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-3 text-slate-600">Загрузка сметы...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <FileText className="w-7 h-7 text-blue-600" />
          Коммерческое предложение
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">
          Выберите смету для формирования КП
        </p>
      </div>

      {/* Поиск */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Поиск по названию, номеру или заказчику..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none text-sm"
        />
      </div>

      {/* Список смет */}
      {isLoadingList ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          <span className="ml-2 text-slate-500">Загрузка смет...</span>
        </div>
      ) : filteredEstimates.length === 0 ? (
        <div className="text-center py-12">
          <Calculator className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">
            {searchQuery ? 'Сметы не найдены' : 'Нет доступных смет'}
          </p>
          <p className="text-sm text-slate-400 mt-1">
            {searchQuery ? 'Попробуйте изменить запрос' : 'Создайте смету, чтобы сформировать КП'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredEstimates.map((est: any) => (
            <div
              key={est.id}
              className="card p-4 hover:shadow-md transition-all cursor-pointer group"
              onClick={() => handleSelectEstimate(est.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg shrink-0">
                      <FileText className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-900 dark:text-white truncate">
                        {est.name || 'Без названия'}
                      </h3>
                      <div className="flex items-center gap-3 text-sm text-slate-500 mt-0.5">
                        {est.number && <span>№ {est.number}</span>}
                        {est.client_name && <span>| {est.client_name}</span>}
                        {est.address && <span>| {est.address}</span>}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0 ml-4">
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Итого</p>
                    <p className="font-bold text-blue-600">
                      {formatCurrency(est.total_with_vat || est.total_cost || 0)}
                    </p>
                  </div>
                  <button className="p-2 rounded-lg bg-gradient-to-r from-indigo-500 to-blue-600 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* KP Preview Modal */}
      {showKPModal && estimate && (
        <KPPreviewModal
          estimateId={selectedEstimateId!}
          estimate={estimate}
          items={items}
          settings={settings}
          onClose={handleCloseModal}
        />
      )}
    </div>
  )
}
