import { useState } from 'react'
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Users,
  MapPin,
  AlertTriangle,
  CheckCircle,
  Circle,
  Plus,
  BarChart3
} from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'

interface Project {
  id: number
  name: string
  client: string
  address: string
  status: 'planning' | 'active' | 'paused' | 'completed'
  startDate: string
  endDate: string
  progress: number
  budget: number
  workers: string[]
  color: string
}

const statusConfig = {
  planning: { label: 'Планирование', color: 'bg-blue-500', textColor: 'text-blue-600' },
  active: { label: 'В работе', color: 'bg-green-500', textColor: 'text-green-600' },
  paused: { label: 'Приостановлен', color: 'bg-amber-500', textColor: 'text-amber-600' },
  completed: { label: 'Завершён', color: 'bg-slate-400', textColor: 'text-slate-600' },
}

const demoProjects: Project[] = [
  { id: 1, name: 'ЖК Солнечный кв.45', client: 'Иванов А.П.', address: 'ул. Солнечная, д.10, кв.45', status: 'active', startDate: '2026-01-05', endDate: '2026-02-15', progress: 75, budget: 850000, workers: ['Бригада Мастер-Строй'], color: '#3B82F6' },
  { id: 2, name: 'Офис на Тверской', client: 'ООО Альфа', address: 'ул. Тверская, д.25', status: 'active', startDate: '2026-01-10', endDate: '2026-03-01', progress: 45, budget: 2100000, workers: ['Петров С.И.', 'Бригада СантехПро'], color: '#10B981' },
  { id: 3, name: 'Коттедж Рублёвка', client: 'Петров С.В.', address: 'Рублёво-Успенское ш., д.15', status: 'planning', startDate: '2026-02-01', endDate: '2026-05-30', progress: 0, budget: 5500000, workers: [], color: '#8B5CF6' },
  { id: 4, name: 'Квартира на Арбате', client: 'Сидорова М.К.', address: 'Арбат, д.40, кв.12', status: 'paused', startDate: '2025-12-01', endDate: '2026-01-20', progress: 60, budget: 420000, workers: ['Иванов Д.С.'], color: '#F59E0B' },
  { id: 5, name: 'Студия Сокол', client: 'Козлов И.И.', address: 'ул. Соколиная, д.5, кв.101', status: 'completed', startDate: '2025-11-15', endDate: '2026-01-08', progress: 100, budget: 280000, workers: ['Бригада Отделка+'], color: '#6B7280' },
]

const daysOfWeek = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']

export default function ProjectCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 0, 11))
  const [view, setView] = useState<'month' | 'week' | 'list'>('month')
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('all')

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  const startDay = (firstDayOfMonth.getDay() + 6) % 7
  const daysInMonth = lastDayOfMonth.getDate()

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))
  const today = () => setCurrentDate(new Date())

  const getProjectsForDate = (day: number) => {
    const date = new Date(year, month, day)
    const dateStr = date.toISOString().split('T')[0]
    return demoProjects.filter(p => {
      if (filterStatus !== 'all' && p.status !== filterStatus) return false
      return dateStr >= p.startDate && dateStr <= p.endDate
    })
  }

  const filteredProjects = filterStatus === 'all' 
    ? demoProjects 
    : demoProjects.filter(p => p.status === filterStatus)

  const calendarDays = []
  for (let i = 0; i < startDay; i++) {
    calendarDays.push({ day: 0, projects: [] })
  }
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push({ day, projects: getProjectsForDate(day) })
  }

  const activeProjects = demoProjects.filter(p => p.status === 'active').length
  const totalBudget = demoProjects.reduce((sum, p) => sum + p.budget, 0)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="w-7 h-7 text-primary-600" />
            Календарь проектов
          </h1>
          <p className="text-slate-600 dark:text-slate-400">Планирование и сроки</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input w-40">
            <option value="all">Все статусы</option>
            <option value="planning">Планирование</option>
            <option value="active">В работе</option>
            <option value="paused">Приостановлен</option>
            <option value="completed">Завершён</option>
          </select>
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
            {(['month', 'week', 'list'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={cn("px-3 py-1.5 text-sm rounded-md transition-all", view === v ? "bg-white dark:bg-slate-700 shadow text-primary-600" : "text-slate-600")}>
                {v === 'month' ? 'Месяц' : v === 'week' ? 'Неделя' : 'Список'}
              </button>
            ))}
          </div>
          <button className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />Новый проект
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-bold">{activeProjects}</p>
            <p className="text-xs text-slate-500">Активных</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <Circle className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold">{demoProjects.filter(p => p.status === 'planning').length}</p>
            <p className="text-xs text-slate-500">В планировании</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-2xl font-bold">{demoProjects.filter(p => p.status === 'paused').length}</p>
            <p className="text-xs text-slate-500">Приостановлено</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-2xl font-bold">{formatCurrency(totalBudget)}</p>
            <p className="text-xs text-slate-500">Общий бюджет</p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-3 card p-4">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button onClick={prevMonth} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 className="text-xl font-bold min-w-[200px] text-center">
                {months[month]} {year}
              </h2>
              <button onClick={nextMonth} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
            <button onClick={today} className="btn-secondary text-sm">Сегодня</button>
          </div>

          {/* Calendar Grid */}
          {view === 'month' && (
            <div>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {daysOfWeek.map(d => (
                  <div key={d} className="text-center text-sm font-medium text-slate-500 py-2">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((cell, i) => {
                  const isToday = cell.day === 11 && month === 0 && year === 2026
                  return (
                    <div key={i} className={cn(
                      "min-h-[100px] p-1 border rounded-lg",
                      cell.day === 0 ? "bg-slate-50 dark:bg-slate-800/30 border-transparent" : "border-slate-100 dark:border-slate-800",
                      isToday && "ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-900/20"
                    )}>
                      {cell.day > 0 && (
                        <>
                          <div className={cn("text-sm font-medium mb-1", isToday ? "text-primary-600" : "text-slate-700 dark:text-slate-300")}>
                            {cell.day}
                          </div>
                          <div className="space-y-1">
                            {cell.projects.slice(0, 3).map(p => (
                              <div key={p.id} onClick={() => setSelectedProject(p)}
                                className="text-xs px-1 py-0.5 rounded truncate cursor-pointer hover:opacity-80"
                                style={{ backgroundColor: p.color + '20', color: p.color }}>
                                {p.name.slice(0, 15)}
                              </div>
                            ))}
                            {cell.projects.length > 3 && (
                              <div className="text-xs text-slate-400">+{cell.projects.length - 3}</div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {view === 'list' && (
            <div className="space-y-3">
              {filteredProjects.map(p => (
                <div key={p.id} onClick={() => setSelectedProject(p)}
                  className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl cursor-pointer hover:shadow-md transition-shadow">
                  <div className="w-1 h-16 rounded-full" style={{ backgroundColor: p.color }} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{p.name}</h3>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full", statusConfig[p.status].color, "text-white")}>
                        {statusConfig[p.status].label}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500">{p.client} • {p.address}</p>
                    <div className="flex items-center gap-4 mt-2 text-sm">
                      <span className="flex items-center gap-1 text-slate-500">
                        <Clock className="w-4 h-4" />
                        {new Date(p.startDate).toLocaleDateString('ru')} - {new Date(p.endDate).toLocaleDateString('ru')}
                      </span>
                      <span className="font-medium text-primary-600">{formatCurrency(p.budget)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold" style={{ color: p.color }}>{p.progress}%</div>
                    <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${p.progress}%`, backgroundColor: p.color }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Selected Project */}
          {selectedProject ? (
            <div className="card p-4">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold">{selectedProject.name}</h3>
                <span className={cn("text-xs px-2 py-1 rounded-full text-white", statusConfig[selectedProject.status].color)}>
                  {statusConfig[selectedProject.status].label}
                </span>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-slate-600">
                  <Users className="w-4 h-4" />{selectedProject.client}
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <MapPin className="w-4 h-4" />{selectedProject.address}
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <Clock className="w-4 h-4" />
                  {new Date(selectedProject.startDate).toLocaleDateString('ru')} - {new Date(selectedProject.endDate).toLocaleDateString('ru')}
                </div>
                <div className="pt-2 border-t">
                  <div className="flex justify-between mb-1">
                    <span>Прогресс</span>
                    <span className="font-bold">{selectedProject.progress}%</span>
                  </div>
                  <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" 
                      style={{ width: `${selectedProject.progress}%`, backgroundColor: selectedProject.color }} />
                  </div>
                </div>
                <div className="pt-2 border-t">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Бюджет</span>
                    <span className="font-bold text-primary-600">{formatCurrency(selectedProject.budget)}</span>
                  </div>
                </div>
                {selectedProject.workers.length > 0 && (
                  <div className="pt-2 border-t">
                    <p className="text-slate-500 mb-2">Исполнители:</p>
                    {selectedProject.workers.map(w => (
                      <div key={w} className="text-sm bg-slate-100 dark:bg-slate-800 rounded px-2 py-1 mb-1">{w}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="card p-4 text-center text-slate-400">
              <Calendar className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>Выберите проект</p>
            </div>
          )}

          {/* Legend */}
          <div className="card p-4">
            <h3 className="font-semibold mb-3">Статусы</h3>
            <div className="space-y-2">
              {Object.entries(statusConfig).map(([key, val]) => (
                <div key={key} className="flex items-center gap-2 text-sm">
                  <div className={cn("w-3 h-3 rounded-full", val.color)} />
                  <span>{val.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming */}
          <div className="card p-4">
            <h3 className="font-semibold mb-3">Ближайшие дедлайны</h3>
            <div className="space-y-2">
              {demoProjects
                .filter(p => p.status !== 'completed')
                .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())
                .slice(0, 3)
                .map(p => (
                  <div key={p.id} className="flex items-center justify-between text-sm p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                    <span className="truncate">{p.name}</span>
                    <span className="text-slate-500 whitespace-nowrap ml-2">
                      {new Date(p.endDate).toLocaleDateString('ru')}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
