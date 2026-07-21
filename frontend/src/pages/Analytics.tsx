import { useState, useEffect } from 'react'
import {
  AlertTriangle,
  Filter,
  DollarSign,
  PieChart,
  Target,
  BarChart,
} from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { apiGet } from '@/lib/api-client'

// ==================== TYPES ====================
interface FunnelStage {
  stage: string
  count: number
  conversion_from_prev: number | null
}

interface SourceROI {
  source: string
  leads_count: number
  sales_count: number
  revenue: number
  profit: number
}

interface Forecast {
  expected_profit: number
  potential_revenue: number
}

interface RiskyDeal {
  id: number
  title: string
  stage: string
  reason: string
  days_stalled: number
}

interface AnalyticsData {
  funnel: FunnelStage[]
  sources: SourceROI[]
  forecast: Forecast
  risky_deals: RiskyDeal[]
}

const STAGE_LABELS: Record<string, string> = {
  lead: 'Лид',
  contact: 'Контакт',
  call: 'Звонок',
  meeting: 'Встреча',
  advance: 'Аванс',
  master: 'В работе',
  control: 'Контроль',
  profit: 'Закрыто',
}

const STAGE_COLORS: Record<string, string> = {
  lead: 'bg-slate-100 text-slate-800',
  contact: 'bg-indigo-100 text-indigo-800',
  call: 'bg-violet-100 text-violet-800',
  meeting: 'bg-amber-100 text-amber-800',
  advance: 'bg-emerald-100 text-emerald-800',
  master: 'bg-blue-100 text-blue-800',
  control: 'bg-orange-100 text-orange-800',
  profit: 'bg-green-100 text-green-800',
}

// ==================== API ====================
export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const json = await apiGet<AnalyticsData>('/analytics/')
        setData(json)
      } catch (e) {
        console.error('Failed to load analytics', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center text-slate-400">
        Загрузка аналитики...
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex h-[50vh] items-center justify-center text-red-500">
        Ошибка загрузки данных
      </div>
    )
  }

  // Общая статистика для шапки
  const totalLeads = data.funnel[0]?.count || 0
  const totalClosed = data.funnel[data.funnel.length - 1]?.count || 0
  const globalConversion = totalLeads > 0 ? ((totalClosed / totalLeads) * 100).toFixed(1) : '0.0'

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      
      {/* Шапка */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <BarChart className="w-6 h-6 text-indigo-600" />
            Аналитика Конвейера
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Ключевые метрики для принятия решений. Конверсия базы: <span className="font-bold text-slate-700 dark:text-slate-300">{globalConversion}%</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* ЛЕВАЯ КОЛОНКА (Воронка + Риски) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Воронка */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-5">
              <Filter className="w-5 h-5 text-blue-500" />
              Воронка продаж
            </h2>
            
            <div className="space-y-3">
              {data.funnel.map((item) => {
                const maxCount = data.funnel[0]?.count || 1
                const percentWidth = Math.max(5, (item.count / maxCount) * 100)
                
                return (
                  <div key={item.stage} className="relative">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {STAGE_LABELS[item.stage] || item.stage}
                      </span>
                      <div className="flex items-center gap-2">
                        {item.conversion_from_prev !== null && (
                          <span className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded">
                            {item.conversion_from_prev}% 
                          </span>
                        )}
                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                          {item.count}
                        </span>
                      </div>
                    </div>
                    {/* Визуальная линия воронки */}
                    <div className="h-2 w-full bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 transition-all duration-500" 
                        style={{ width: `${percentWidth}%` }}
                      ></div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Рискованные сделки */}
          <div className="bg-red-50 dark:bg-red-900/10 rounded-2xl border border-red-200 dark:border-red-900/50 p-5">
            <h2 className="text-lg font-semibold text-red-700 dark:text-red-400 flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5" />
              Требуют внимания ({data.risky_deals.length})
            </h2>
            
            {data.risky_deals.length === 0 ? (
              <p className="text-sm text-red-600/70">Нет зависших или проблемных сделок.</p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {data.risky_deals.map(deal => (
                  <div key={deal.id} className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-red-100 dark:border-red-900/30">
                    <div className="flex items-start justify-between">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-1 flex-1 pr-2">
                        {deal.title}
                      </p>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap", STAGE_COLORS[deal.stage])}>
                        {STAGE_LABELS[deal.stage]}
                      </span>
                    </div>
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1.5 flex items-center gap-1">
                      ⚠️ {deal.reason}
                    </p>
                    <div className="mt-2 text-right">
                       <a href={`/pipeline`} className="text-[11px] text-blue-600 hover:underline">В конвейер →</a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ПРАВАЯ КОЛОНКА (Прогноз + Источники) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Прогноз дохода (Блок C) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl shadow-sm border border-emerald-400 p-5 text-white">
              <div className="flex items-center gap-2 text-emerald-100 mb-2">
                <Target className="w-5 h-5" />
                <h3 className="text-sm font-medium">Ожидаемая прибыль</h3>
              </div>
              <p className="text-3xl font-bold">{formatCurrency(data.forecast.expected_profit)}</p>
              <p className="text-xs text-emerald-100 mt-1 opacity-80">
                С учетом вероятности закрытия
              </p>
            </div>
            
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
              <div className="flex items-center gap-2 text-slate-500 mb-2">
                <DollarSign className="w-5 h-5" />
                <h3 className="text-sm font-medium">Потенциальная выручка</h3>
              </div>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">
                {formatCurrency(data.forecast.potential_revenue)}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Сумма всех сделок в работе
              </p>
            </div>
          </div>

          {/* Источники лидов (Блок B) */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-slate-700/50">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <PieChart className="w-5 h-5 text-purple-500" />
                Источники лидов и ROI
              </h2>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 text-xs uppercase">
                  <tr>
                    <th className="px-5 py-3 font-medium">Источник</th>
                    <th className="px-5 py-3 font-medium text-center">Лиды</th>
                    <th className="px-5 py-3 font-medium text-center">Продажи</th>
                    <th className="px-5 py-3 font-medium text-right">Выручка</th>
                    <th className="px-5 py-3 font-medium text-right text-emerald-600">Прибыль</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {data.sources.map((src, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white capitalize flex items-center gap-2">
                         <div className="w-2 h-2 rounded-full bg-purple-400"></div>
                         {src.source}
                      </td>
                      <td className="px-5 py-3.5 text-center font-semibold">{src.leads_count}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="inline-flex px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">
                          {src.sales_count}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-medium text-slate-600 dark:text-slate-300">
                        {formatCurrency(src.revenue)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-bold text-emerald-600">
                        {formatCurrency(src.profit)}
                      </td>
                    </tr>
                  ))}
                  
                  {data.sources.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                        Нет данных по источникам
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
      
    </div>
  )
}
