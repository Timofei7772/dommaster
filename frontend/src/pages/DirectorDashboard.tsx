import { useQuery } from '@tanstack/react-query'
import { TrendingUp, TrendingDown, Building2, Users, CalendarClock, DollarSign, AlertCircle, CheckCircle, Clock, Hammer, MapPin } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import Badge from '@/components/ui/Badge'
import Skeleton from '@/components/ui/Skeleton'
import { apiGet } from '@/lib/api-client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { motion } from 'framer-motion'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

// ── Типы API ──────────────────────────────────────────────────────────────────

interface DirectorSummary {
  total_profit: number
  profit_trend: number
  active_projects: number
  workers_available: number
  workers_busy: number
  revenue_forecast: number
  revenue_forecast_change: number
}

interface ProfitPoint {
  month: string
  profit: number
  revenue: number
}

interface WorkerLoad {
  name: string
  projects: number
  load_percent: number
  status: 'free' | 'partial' | 'busy'
}

interface Deadline {
  project_name: string
  address: string
  stage: string
  deadline: string
  days_left: number
}

interface ActiveObject {
  id: number
  name: string
  address: string
  stage: string
  progress: number
  deadline?: string
  amount?: number
  status: string
}

// ── Вспомогательные утилиты ────────────────────────────────────────────────────

const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']

function getStageLabel(stage: string): string {
  const map: Record<string, string> = {
    foundation: 'Фундамент',
    walls: 'Возведение стен',
    roof: 'Кровля',
    facade: 'Фасад',
    engineering: 'Инженерные сети',
    finishing: 'Отделка',
    landscaping: 'Благоустройство',
    commissioning: 'Сдача объекта',
  }
  return map[stage.toLowerCase()] || stage
}

const workerBarColor = (status: string) =>
  status === 'busy' ? '#ef4444' : status === 'partial' ? '#f59e0b' : '#10b981'

// ── Основной компонент ─────────────────────────────────────────────────────────

export default function DirectorDashboard() {
  // ── Запросы ────────────────────────────────────────────────────────────────

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['director-summary'],
    queryFn: () => apiGet<DirectorSummary>('/director/summary'),
    refetchInterval: 60_000, // автообновление каждую минуту
  })

  const { data: profitTimeline, isLoading: timelineLoading } = useQuery({
    queryKey: ['director-profit'],
    queryFn: () => apiGet<ProfitPoint[]>('/director/profit-timeline'),
  })

  const { data: workerLoad } = useQuery({
    queryKey: ['director-workers'],
    queryFn: () => apiGet<WorkerLoad[]>('/director/worker-load'),
  })

  const { data: deadlines } = useQuery({
    queryKey: ['director-deadlines'],
    queryFn: () => apiGet<Deadline[]>('/director/upcoming-deadlines'),
  })

  const { data: activeObjects } = useQuery({
    queryKey: ['director-active-objects'],
    queryFn: () => apiGet<ActiveObject[]>('/director/active-objects'),
  })

  // ── KPI карточки ────────────────────────────────────────────────────────────

  const workerLoadPercent = summary
    ? Math.round((summary.workers_busy / (summary.workers_available + summary.workers_busy || 1)) * 100)
    : 0

  const kpiCards = [
    {
      title: 'Чистая прибыль',
      value: summary?.total_profit ?? null,
      prefix: '',
      trend: summary?.profit_trend ?? null,
      icon: TrendingUp,
      color: 'emerald' as const,
      format: 'currency' as const,
    },
    {
      title: 'Активные объекты',
      value: summary?.active_projects ?? null,
      prefix: '',
      trend: null,
      icon: Building2,
      color: 'blue' as const,
      format: 'number' as const,
    },
    {
      title: 'Загрузка мастеров',
      value: workerLoadPercent,
      prefix: '%',
      trend: null,
      icon: Users,
      color: 'violet' as const,
      format: 'number' as const,
    },
    {
      title: 'Прогноз выручки',
      value: summary?.revenue_forecast ?? null,
      prefix: '',
      trend: summary?.revenue_forecast_change ?? null,
      icon: DollarSign,
      color: 'amber' as const,
      format: 'currency' as const,
    },
  ]

  const colorConfig: Record<string, { bg: string; icon: string; gradient: string }> = {
    emerald: { bg: 'bg-emerald-50 dark:bg-emerald-950/50', icon: 'text-emerald-600 dark:text-emerald-400', gradient: 'from-emerald-400 to-emerald-600' },
    blue: { bg: 'bg-blue-50 dark:bg-blue-950/50', icon: 'text-blue-600 dark:text-blue-400', gradient: 'from-blue-400 to-blue-600' },
    violet: { bg: 'bg-violet-50 dark:bg-violet-950/50', icon: 'text-violet-600 dark:text-violet-400', gradient: 'from-violet-400 to-violet-600' },
    amber: { bg: 'bg-amber-50 dark:bg-amber-950/50', icon: 'text-amber-600 dark:text-amber-400', gradient: 'from-amber-400 to-orange-500' },
  }

  function renderKpiValue(value: number | null, format: 'currency' | 'number') {
    if (value === null) return '—'
    if (format === 'currency') return formatCurrency(value)
    return value.toLocaleString('ru')
  }

  // ── Загрузка ────────────────────────────────────────────────────────────────

  if (summaryLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48 mt-2" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card><CardContent className="p-6"><Skeleton className="h-72 w-full" /></CardContent></Card>
          <Card><CardContent className="p-6"><Skeleton className="h-72 w-full" /></CardContent></Card>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Building2 className="w-7 h-7 text-primary-600" />
            Панель руководителя
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Сводка по компании на сегодня &middot;{' '}
            {new Date().toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* ── KPI Row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map((kpi, i) => (
          <motion.div
            key={kpi.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{kpi.title}</span>
                  <div className={`p-2 rounded-lg ${colorConfig[kpi.color].bg}`}>
                    <kpi.icon className={`w-5 h-5 ${colorConfig[kpi.color].icon}`} />
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-2xl font-bold text-slate-800 dark:text-white">
                    {renderKpiValue(kpi.value, kpi.format)}
                    {kpi.prefix && kpi.value !== null ? <span className="text-lg ml-0.5">{kpi.prefix}</span> : null}
                  </span>
                  {kpi.trend !== null && (
                    <span
                      className={`flex items-center text-sm font-medium mb-1 ${
                        kpi.trend >= 0 ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {kpi.trend >= 0 ? (
                        <TrendingUp className="w-4 h-4 mr-0.5" />
                      ) : (
                        <TrendingDown className="w-4 h-4 mr-0.5" />
                      )}
                      {Math.abs(kpi.trend)}%
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* ── Charts Row ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profit Timeline */}
        <Card>
          <CardHeader>
            <CardTitle>
              <TrendingUp className="w-5 h-5 text-violet-600" />
              Динамика прибыли
            </CardTitle>
            <CardDescription>За последние 12 месяцев</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {profitTimeline && profitTimeline.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={profitTimeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      }}
                      formatter={(value: number) => formatCurrency(value)}
                    />
                    <Line
                      type="monotone"
                      dataKey="profit"
                      stroke="#7c3aed"
                      strokeWidth={2}
                      dot={{ fill: '#7c3aed', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6 }}
                      name="Прибыль"
                    />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                      strokeDasharray="5 5"
                      name="Выручка"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400">
                  <div className="text-center">
                    <TrendingUp className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Нет данных за период</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Worker Load */}
        <Card>
          <CardHeader>
            <CardTitle>
              <Users className="w-5 h-5 text-violet-600" />
              Загрузка мастеров
            </CardTitle>
            <CardDescription>Кто чем занят сейчас</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {workerLoad && workerLoad.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={workerLoad} layout="vertical" barCategoryGap={8}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12 }} stroke="#94a3b8" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} stroke="#94a3b8" width={130} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      }}
                      formatter={(value: number) => [`${value}%`, 'Загрузка']}
                    />
                    <Bar dataKey="load_percent" radius={[0, 6, 6, 0]} maxBarSize={20}>
                      {(workerLoad || []).map((_, i) => (
                        <Cell key={i} fill={workerBarColor(workerLoad[i]?.status || 'free')} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400">
                  <div className="text-center">
                    <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Нет данных по мастерам</p>
                  </div>
                </div>
              )}
            </div>
            {/* Легенда загрузки */}
            {workerLoad && workerLoad.length > 0 && (
              <div className="flex items-center justify-center gap-4 mt-4 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Свободен
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Частично
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Занят
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Deadlines ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>
            <CalendarClock className="w-5 h-5 text-violet-600" />
            Ближайшие дедлайны
          </CardTitle>
          <CardDescription>Сроки сдачи объектов в ближайшие 14 дней</CardDescription>
        </CardHeader>
        <CardContent>
          {deadlines && deadlines.length > 0 ? (
            <div className="space-y-3">
              {deadlines.map((d, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                        d.days_left <= 2
                          ? 'bg-rose-100 dark:bg-rose-900/50'
                          : d.days_left <= 5
                          ? 'bg-amber-100 dark:bg-amber-900/50'
                          : 'bg-blue-100 dark:bg-blue-900/50'
                      }`}
                    >
                      <CalendarClock
                        className={`w-5 h-5 ${
                          d.days_left <= 2
                            ? 'text-rose-600'
                            : d.days_left <= 5
                            ? 'text-amber-600'
                            : 'text-blue-600'
                        }`}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 dark:text-slate-200 truncate">{d.project_name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {d.address} &middot; {d.stage}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p
                      className={`font-bold ${
                        d.days_left <= 2
                          ? 'text-rose-600 dark:text-rose-400'
                          : d.days_left <= 5
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {d.days_left} {d.days_left === 1 ? 'день' : d.days_left < 5 ? 'дня' : 'дн.'}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {new Date(d.deadline).toLocaleDateString('ru')}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400">
              <CalendarClock className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Нет ближайших дедлайнов</p>
              <p className="text-xs text-slate-400 mt-1">На ближайшие 14 дней сроки не запланированы</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Active Objects ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Building2 className="w-5 h-5 text-violet-600" />
            Активные объекты
          </CardTitle>
          <CardDescription>
            {(activeObjects?.length ?? 0) > 0
              ? `${activeObjects!.length} объектов в работе`
              : 'Объекты строительства'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeObjects && activeObjects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {activeObjects.map((obj, i) => (
                <motion.div
                  key={obj.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="p-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:shadow-md transition-shadow cursor-pointer"
                >
                  {/* Заголовок */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm truncate">
                        {obj.name}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                        <MapPin className="w-3 h-3 shrink-0" />
                        {obj.address}
                      </p>
                    </div>
                    <Badge status={obj.status} />
                  </div>

                  {/* Этап */}
                  <div className="flex items-center gap-2 mb-3 text-xs">
                    <Hammer className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-slate-600 dark:text-slate-400 font-medium">
                      {getStageLabel(obj.stage)}
                    </span>
                  </div>

                  {/* Прогресс бар */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Прогресс</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{obj.progress}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-600"
                        initial={{ width: 0 }}
                        animate={{ width: `${obj.progress}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                      />
                    </div>
                  </div>

                  {/* Дедлайн */}
                  {obj.deadline && (
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-xs">
                      <span className="text-slate-500 flex items-center gap-1">
                        <CalendarClock className="w-3.5 h-3.5" />
                        Срок
                      </span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {formatDate(obj.deadline)}
                      </span>
                    </div>
                  )}

                  {/* Сумма */}
                  {obj.amount !== undefined && obj.amount > 0 && (
                    <div className="mt-1.5 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Сумма</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(obj.amount)}
                      </span>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400">
              <Building2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Нет активных объектов</p>
              <p className="text-xs text-slate-400 mt-1">Создайте проект, чтобы он появился здесь</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
