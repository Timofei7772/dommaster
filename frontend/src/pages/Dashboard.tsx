import { useState, useEffect } from 'react'
import {
  FileText,
  TrendingUp,
  Package,
  DollarSign,
  Plus,
  ArrowRight,
  Camera,
  Sparkles,
  Users,
  Briefcase,
  Calendar,
  Target,
  Award,
  CheckCircle,
  AlertTriangle,
  BarChart3,
  Activity,
  Loader2
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { formatCurrency } from '@/lib/utils'
import api from '@/lib/api'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RePieChart,
  Pie,
  Cell
} from 'recharts'

// Цвета для категорий диаграммы
const CATEGORY_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316']

const statusConfig: Record<string, { label: string; class: string }> = {
  draft: { label: 'Черновик', class: 'bg-slate-100 text-slate-600' },
  in_review: { label: 'На проверке', class: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Утверждена', class: 'bg-green-100 text-green-700' },
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month')
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState<any[]>([])
  const [estimates, setEstimates] = useState<any[]>([])
  const [contracts, setContracts] = useState<any[]>([])

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        const [p, e, c] = await Promise.all([
          api.projects.getAll(),
          api.estimates.getAll(),
          api.contracts.getAll()
        ])
        setProjects(p || [])
        setEstimates(e || [])
        setContracts(c || [])
      } catch (err) {
        console.error('Dashboard load error:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  // Вычисляем KPI из реальных данных
  const activeProjects = projects.filter((p: any) => p.status === 'active')
  const completedProjects = projects.filter((p: any) => p.status === 'completed')
  const approvedEstimates = estimates.filter((e: any) => e.status === 'approved')

  const totalRevenue = estimates.reduce((sum: number, e: any) => sum + (e.total_with_vat || e.total_cost || 0), 0)
  const totalProfit = estimates.reduce((sum: number, e: any) => sum + (e.total_profit || 0), 0)
  const avgEstimateValue = estimates.length > 0 ? totalRevenue / estimates.length : 0
  const conversionRate = estimates.length > 0
    ? Math.round((approvedEstimates.length / estimates.length) * 100)
    : 0

  const kpis = {
    revenue: totalRevenue,
    revenueGrowth: 0,
    profit: totalProfit,
    profitMargin: totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0,
    activeProjects: activeProjects.length,
    completedThisMonth: completedProjects.length,
    avgEstimateValue,
    conversionRate,
  }

  // Статистика по статусам смет для диаграммы
  const categoryData = (() => {
    const statusCounts: Record<string, number> = {}
    for (const e of estimates) {
      const status = e.status || 'draft'
      statusCounts[status] = (statusCounts[status] || 0) + (e.total_with_vat || e.total_cost || 0)
    }
    const statusLabels: Record<string, string> = {
      draft: 'Черновики', approved: 'Утверждённые', in_review: 'На проверке',
      completed: 'Завершённые', active: 'Активные'
    }
    const entries = Object.entries(statusCounts)
    if (entries.length === 0) return [{ name: 'Нет данных', value: 100, color: '#94A3B8' }]
    const total = entries.reduce((s, [, v]) => s + v, 0)
    return entries.map(([key, val], i) => ({
      name: statusLabels[key] || key,
      value: total > 0 ? Math.round((val / total) * 100) : 0,
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length]
    }))
  })()

  // Последние сметы (первые 5)
  const recentEstimates = [...estimates]
    .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .slice(0, 5)

  // Данные для графика — группируем сметы по месяцам
  const revenueData = (() => {
    const months: Record<string, { revenue: number; profit: number }> = {}
    const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']

    for (const e of estimates) {
      const date = new Date(e.created_at || Date.now())
      const key = `${date.getFullYear()}-${date.getMonth()}`
      if (!months[key]) months[key] = { revenue: 0, profit: 0 }
      months[key].revenue += e.total_with_vat || e.total_cost || 0
      months[key].profit += e.total_profit || 0
    }

    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([key, data]) => {
        const [, monthIdx] = key.split('-')
        return { month: monthNames[parseInt(monthIdx)], ...data }
      })
  })()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 text-primary-600 animate-spin" />
          <p className="text-slate-500">Загрузка данных...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-primary-600" />
            Панель управления
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Обзор бизнеса — {projects.length} проектов, {estimates.length} смет
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
            {(['week', 'month', 'year'] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-sm rounded-md transition-all ${period === p ? 'bg-white dark:bg-slate-700 shadow text-primary-600' : 'text-slate-600'}`}>
                {p === 'week' ? 'Неделя' : p === 'month' ? 'Месяц' : 'Год'}
              </button>
            ))}
          </div>
          <button onClick={() => navigate('/scanner')} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-lg hover:shadow-lg">
            <Camera className="w-5 h-5" />AI Сканер<Sparkles className="w-4 h-4" />
          </button>
          <button onClick={() => navigate('/estimates/new')} className="btn-primary flex items-center gap-2">
            <Plus className="w-5 h-5" />Новая смета
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Выручка</p>
              <p className="text-2xl font-bold mt-1">{formatCurrency(kpis.revenue)}</p>
              <div className="flex items-center gap-1 mt-1 text-slate-500 text-sm">
                <TrendingUp className="w-4 h-4" />{estimates.length} смет
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Прибыль</p>
              <p className="text-2xl font-bold mt-1">{formatCurrency(kpis.profit)}</p>
              <div className="flex items-center gap-1 mt-1 text-slate-500 text-sm">
                <Target className="w-4 h-4" />Маржа {kpis.profitMargin}%
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Проекты</p>
              <p className="text-2xl font-bold mt-1">{kpis.activeProjects}</p>
              <div className="flex items-center gap-1 mt-1 text-slate-500 text-sm">
                <CheckCircle className="w-4 h-4 text-green-500" />{kpis.completedThisMonth} завершено
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center">
              <Briefcase className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Конверсия</p>
              <p className="text-2xl font-bold mt-1">{kpis.conversionRate}%</p>
              <div className="flex items-center gap-1 mt-1 text-slate-500 text-sm">
                <Award className="w-4 h-4 text-amber-500" />Ср. чек {formatCurrency(kpis.avgEstimateValue)}
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <Activity className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Быстрый доступ к документам */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary-600" />
            Документы
          </h3>
          <Link to="/documents" className="text-primary-600 hover:underline text-sm flex items-center gap-1">
            Все документы <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Link to="/estimates" className="flex flex-col items-center p-4 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 hover:shadow-md transition-all group">
            <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <span className="font-medium text-sm">Сметы</span>
            <span className="text-xs text-slate-500">{estimates.length} док.</span>
          </Link>
          <Link to="/contracts" className="flex flex-col items-center p-4 rounded-xl bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 hover:shadow-md transition-all group">
            <div className="w-12 h-12 rounded-full bg-purple-500 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <Briefcase className="w-6 h-6 text-white" />
            </div>
            <span className="font-medium text-sm">Договоры</span>
            <span className="text-xs text-slate-500">{contracts.length} док.</span>
          </Link>
          <Link to="/ks2" className="flex flex-col items-center p-4 rounded-xl bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 hover:shadow-md transition-all group">
            <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
            <span className="font-medium text-sm">КС-2</span>
            <span className="text-xs text-slate-500">Акты</span>
          </Link>
          <Link to="/ks3" className="flex flex-col items-center p-4 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20 hover:shadow-md transition-all group">
            <div className="w-12 h-12 rounded-full bg-amber-500 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <span className="font-medium text-sm">КС-3</span>
            <span className="text-xs text-slate-500">Справки</span>
          </Link>
          <Link to="/m29" className="flex flex-col items-center p-4 rounded-xl bg-gradient-to-br from-rose-50 to-rose-100 dark:from-rose-900/20 dark:to-rose-800/20 hover:shadow-md transition-all group">
            <div className="w-12 h-12 rounded-full bg-rose-500 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <Package className="w-6 h-6 text-white" />
            </div>
            <span className="font-medium text-sm">М-29</span>
            <span className="text-xs text-slate-500">Ведомости</span>
          </Link>
          <Link to="/templates" className="flex flex-col items-center p-4 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-700/50 hover:shadow-md transition-all group border-2 border-dashed border-slate-300 dark:border-slate-600">
            <div className="w-12 h-12 rounded-full bg-slate-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
              <Plus className="w-6 h-6 text-white" />
            </div>
            <span className="font-medium text-sm">Создать</span>
            <span className="text-xs text-slate-500">документ</span>
          </Link>
        </div>
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg">Выручка и прибыль</h3>
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500"></span>Выручка</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500"></span>Прибыль</span>
            </div>
          </div>
          <div className="h-[280px]">
            {revenueData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="month" stroke="#94A3B8" />
                  <YAxis stroke="#94A3B8" tickFormatter={(v) => `${(v / 1000000).toFixed(1)}М`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ backgroundColor: '#1E293B', border: 'none', borderRadius: '8px', color: '#fff' }} />
                  <Area type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" name="Выручка" />
                  <Area type="monotone" dataKey="profit" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorProfit)" name="Прибыль" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400">
                <div className="text-center">
                  <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>Создайте сметы для отображения графика</p>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="card p-5">
          <h3 className="font-semibold text-lg mb-4">Работы по категориям</h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <RePieChart>
                <Pie data={categoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value">
                  {categoryData.map((entry, i) => <Cell key={`cell-${i}`} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ backgroundColor: '#1E293B', border: 'none', borderRadius: '8px', color: '#fff' }} />
              </RePieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 mt-2">
            {categoryData.map((c) => (
              <div key={c.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: c.color }}></span>{c.name}</span>
                <span className="font-medium">{c.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Projects & Estimates */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg flex items-center gap-2"><Briefcase className="w-5 h-5 text-primary-600" />Активные проекты</h3>
            <Link to="/estimates" className="text-primary-600 hover:underline text-sm flex items-center gap-1">Все<ArrowRight className="w-4 h-4" /></Link>
          </div>
          <div className="space-y-4">
            {activeProjects.length > 0 ? activeProjects.slice(0, 5).map((p: any) => (
              <div key={p.id} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl cursor-pointer hover:shadow-md transition-all" onClick={() => navigate(`/projects/${p.id}`)}>
                <div className="flex items-start justify-between">
                  <div><p className="font-medium">{p.name}</p><p className="text-sm text-slate-500">{p.client_name || 'Без заказчика'}</p></div>
                  <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-700">Активен</span>
                </div>
                <div className="flex justify-between mt-3 text-sm">
                  <span className="text-slate-500 flex items-center gap-1"><Calendar className="w-4 h-4" />{p.created_at ? new Date(p.created_at).toLocaleDateString('ru') : '—'}</span>
                  <span className="font-semibold text-green-600">{formatCurrency(p.total_amount || 0)}</span>
                </div>
              </div>
            )) : (
              <div className="text-center py-8 text-slate-400">
                <Briefcase className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>Нет активных проектов</p>
                <button onClick={() => navigate('/projects/new')} className="mt-3 text-primary-600 hover:underline text-sm">Создать проект</button>
              </div>
            )}
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg flex items-center gap-2"><FileText className="w-5 h-5 text-primary-600" />Последние сметы</h3>
            <Link to="/estimates" className="text-primary-600 hover:underline text-sm flex items-center gap-1">Все<ArrowRight className="w-4 h-4" /></Link>
          </div>
          <div className="space-y-3">
            {recentEstimates.length > 0 ? recentEstimates.map((e: any) => {
              const s = statusConfig[e.status] || statusConfig.draft
              return (
                <div key={e.id} className="flex items-center gap-4 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg cursor-pointer" onClick={() => navigate(`/estimates/${e.id}`)}>
                  <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center"><FileText className="w-5 h-5 text-primary-600" /></div>
                  <div className="flex-1 min-w-0"><p className="font-medium truncate">{e.name}</p><p className="text-sm text-slate-500">{e.number}</p></div>
                  <div className="text-right"><p className="font-semibold">{formatCurrency(e.total_with_vat || e.total_cost || 0)}</p><span className={`text-xs px-2 py-0.5 rounded-full ${s.class}`}>{s.label}</span></div>
                </div>
              )
            }) : (
              <div className="text-center py-8 text-slate-400">
                <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>Нет смет</p>
              </div>
            )}
          </div>
          <button onClick={() => navigate('/estimates/new')} className="w-full mt-4 py-3 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 hover:border-primary-500 hover:text-primary-600 flex items-center justify-center gap-2">
            <Plus className="w-5 h-5" />Создать смету
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg flex items-center gap-2"><Users className="w-5 h-5 text-primary-600" />Статистика документов</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <p className="text-3xl font-bold text-blue-600">{estimates.length}</p>
              <p className="text-sm text-slate-500 mt-1">Смет</p>
            </div>
            <div className="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
              <p className="text-3xl font-bold text-purple-600">{contracts.length}</p>
              <p className="text-sm text-slate-500 mt-1">Договоров</p>
            </div>
            <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
              <p className="text-3xl font-bold text-green-600">{approvedEstimates.length}</p>
              <p className="text-sm text-slate-500 mt-1">Утверждено</p>
            </div>
            <div className="text-center p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
              <p className="text-3xl font-bold text-amber-600">{projects.length}</p>
              <p className="text-sm text-slate-500 mt-1">Проектов</p>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <h3 className="font-semibold text-lg mb-4">Быстрые действия</h3>
          <div className="space-y-3">
            <button onClick={() => navigate('/scanner')} className="w-full p-4 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-xl hover:shadow-lg flex items-center gap-3">
              <Camera className="w-6 h-6" /><div className="text-left"><p className="font-medium">AI Сканер</p><p className="text-sm opacity-80">Фото → Смета</p></div><Sparkles className="w-5 h-5 ml-auto" />
            </button>
            <button onClick={() => navigate('/commercial-proposal')} className="w-full p-4 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl hover:shadow-lg flex items-center gap-3">
              <Briefcase className="w-6 h-6" /><div className="text-left"><p className="font-medium">Создать КП</p><p className="text-sm opacity-80">Коммерческое</p></div>
            </button>
            <button onClick={() => navigate('/material-requests')} className="w-full p-4 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-3">
              <Package className="w-6 h-6 text-slate-600" /><div className="text-left"><p className="font-medium">Заявка</p><p className="text-sm text-slate-500">На материалы</p></div>
            </button>
            <button onClick={() => navigate('/ai')} className="w-full p-4 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-amber-500" /><div className="text-left"><p className="font-medium">ИИ-помощник</p><p className="text-sm text-slate-500">Спросить</p></div>
            </button>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {estimates.filter((e: any) => e.status === 'draft').length > 0 && (
        <div className="card p-5 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-amber-200 dark:border-amber-800">
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-amber-900 dark:text-amber-100">Требует внимания</h4>
              <ul className="mt-2 space-y-1 text-sm text-amber-800 dark:text-amber-200">
                <li>— {estimates.filter((e: any) => e.status === 'draft').length} смет в статусе черновик</li>
                {contracts.filter((c: any) => c.status === 'draft').length > 0 && (
                  <li>— {contracts.filter((c: any) => c.status === 'draft').length} неподписанных договоров</li>
                )}
              </ul>
            </div>
            <button onClick={() => navigate('/estimates')} className="text-amber-600 hover:text-amber-800 text-sm whitespace-nowrap">Все →</button>
          </div>
        </div>
      )}
    </div>
  )
}
