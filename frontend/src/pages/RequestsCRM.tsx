import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '@/hooks/useToast'
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api-client'
import { 
  Plus, Trash2, Calendar, User, ChevronRight, ChevronLeft, X, Filter, FolderKanban, Loader2
} from 'lucide-react'
import { staggerContainer, fadeInUp, scaleIn } from '@/lib/motion'
import { format, isPast, isToday } from 'date-fns'

interface Project {
  id: number
  name: string
  code?: string
}

interface Worker {
  id: number
  full_name: string
}

interface Ticket {
  id: number
  project_id?: number
  title: string
  description?: string
  status: string // New / In Progress / Review / Done
  priority: 'Low' | 'Medium' | 'High'
  assigned_to?: number
  deadline?: string
  created_at: string
  project?: Project
  assignee?: Worker
}

export default function RequestsCRM() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)

  // Фильтры
  const [filterProject, setFilterProject] = useState<string>('')
  const [filterWorker, setFilterWorker] = useState<string>('')

  // Модалка создания задачи
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [newProjectId, setNewProjectId] = useState<number | undefined>(undefined)
  const [newAssigneeId, setNewAssigneeId] = useState<number | undefined>(undefined)
  const [deadline, setDeadline] = useState('')
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High'>('Medium')

  const toast = useToast()

  useEffect(() => {
    fetchData()
  }, [filterProject, filterWorker])

  const fetchData = async () => {
    setLoading(true)
    try {
      // Загружаем проекты и мастеров для фильтров
      const projs = await apiGet<Project[]>('/crm-projects/')
      setProjects(projs)

      // Загружаем задачи (всегда из компании)
      let path = '/crm-requests/'
      const params = []
      if (filterProject) params.push(`project_id=${filterProject}`)
      if (filterWorker) params.push(`assigned_to=${filterWorker}`)
      if (params.length) path += `?${params.join('&')}`

      const ticketsData = await apiGet<Ticket[]>(path)
      setTickets(ticketsData)

      // Загружаем рабочих компании из первого попавшегося проекта (или всех)
      if (projs.length > 0) {
        const workersData = await apiGet<Worker[]>(`/crm-projects/${projs[0].id}/workers`)
        setWorkers(workersData)
      }
    } catch (err: any) {
      toast.error('Не удалось загрузить заявки: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title) {
      toast.error('Заголовок задачи обязателен')
      return
    }

    try {
      await apiPost('/crm-requests/', {
        title,
        description,
        project_id: newProjectId || null,
        assigned_to: newAssigneeId || null,
        deadline: deadline || null,
        priority,
        status: 'New'
      })
      toast.success('Заявка успешно создана!')
      setIsModalOpen(false)
      // Очистка полей
      setTitle('')
      setDescription('')
      setNewProjectId(undefined)
      setNewAssigneeId(undefined)
      setDeadline('')
      setPriority('Medium')
      fetchData()
    } catch (err: any) {
      toast.error('Ошибка создания: ' + err.message)
    }
  }

  const handleMoveStatus = async (ticket: Ticket, newStatus: string) => {
    try {
      await apiPut(`/crm-requests/${ticket.id}`, {
        status: newStatus
      })
      toast.success(`Статус изменен на "${newStatus}"`)
      
      // Локальное обновление
      setTickets(tickets.map(t => t.id === ticket.id ? { ...t, status: newStatus } : t))
    } catch (err: any) {
      toast.error('Ошибка при перемещении карточки: ' + err.message)
    }
  }

  const handleDeleteTicket = async (ticketId: number) => {
    if (!confirm('Вы уверены, что хотите удалить эту заявку?')) return
    try {
      await apiDelete(`/crm-requests/${ticketId}`)
      toast.success('Заявка успешно удалена')
      fetchData()
    } catch (err: any) {
      toast.error('Ошибка удаления: ' + err.message)
    }
  }

  // Столбцы Канбана
  const columns = [
    { id: 'New', title: 'Новые заявки', color: 'bg-indigo-500/10 border-indigo-200 dark:border-indigo-900/50 text-indigo-700 dark:text-indigo-400' },
    { id: 'In Progress', title: 'В работе', color: 'bg-blue-500/10 border-blue-200 dark:border-blue-900/50 text-blue-700 dark:text-blue-400' },
    { id: 'Review', title: 'Проверка прораба', color: 'bg-amber-500/10 border-amber-200 dark:border-amber-900/50 text-amber-700 dark:text-amber-400' },
    { id: 'Done', title: 'Выполнено', color: 'bg-emerald-500/10 border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400' }
  ]

  const priorityColors = {
    Low: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    Medium: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
    High: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
  }

  return (
    <motion.div 
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-6 text-slate-800 dark:text-slate-100 h-full flex flex-col"
    >
      {/* Header and Filter */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Журнал заявок и задач (CRM Kanban)</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Управляйте заявками клиентов и внутренними задачами по объектам</p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Add Request button */}
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl shadow-sm text-sm font-semibold transition-all"
          >
            <Plus className="w-4 h-4" />
            Создать заявку
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
          <Filter className="w-4 h-4" />
          Фильтрация доски:
        </span>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-950 dark:text-white focus:outline-none"
          >
            <option value="">Все строительные объекты</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>
            ))}
          </select>
          <select
            value={filterWorker}
            onChange={(e) => setFilterWorker(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-950 dark:text-white focus:outline-none"
          >
            <option value="">Все ответственные мастера</option>
            {workers.map(w => (
              <option key={w.id} value={w.id}>{w.full_name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Kanban Board Layout */}
      {loading ? (
        <div className="flex flex-col justify-center items-center py-20 text-slate-500 gap-2">
          <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
          Загрузка Канбан-доски...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start flex-1 min-h-[500px]">
          {columns.map((col) => {
            const colTickets = tickets.filter(t => t.status === col.id)
            
            return (
              <div 
                key={col.id} 
                className="bg-slate-50/50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-4 flex flex-col gap-3 h-full max-h-[80vh] overflow-y-auto"
              >
                {/* Column Title */}
                <div className={`px-3 py-1.5 border rounded-xl flex justify-between items-center ${col.color}`}>
                  <span className="font-bold text-xs uppercase tracking-wider">{col.title}</span>
                  <span className="text-xs font-bold px-2 py-0.5 bg-white/40 dark:bg-black/20 rounded-full">{colTickets.length}</span>
                </div>

                {/* Column Cards */}
                <div className="flex flex-col gap-2.5 flex-1">
                  {colTickets.length === 0 ? (
                    <div className="text-center py-10 text-xs text-slate-400 italic">Столбец пуст</div>
                  ) : (
                    colTickets.map((ticket) => {
                      const dlDate = ticket.deadline ? new Date(ticket.deadline) : null
                      const isOverdue = dlDate && isPast(dlDate) && !isToday(dlDate) && ticket.status !== 'Done'

                      return (
                        <motion.div
                          key={ticket.id}
                          layoutId={`ticket-${ticket.id}`}
                          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow relative flex flex-col justify-between"
                        >
                          <div className="space-y-2.5">
                            {/* Card top flags */}
                            <div className="flex justify-between items-center">
                              <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider ${priorityColors[ticket.priority]}`}>
                                {ticket.priority}
                              </span>
                              <button 
                                onClick={() => handleDeleteTicket(ticket.id)}
                                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-rose-500 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Card title and desc */}
                            <h4 className="font-bold text-sm text-slate-900 dark:text-white leading-snug">{ticket.title}</h4>
                            {ticket.description && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-3">{ticket.description}</p>
                            )}

                            {/* Project code if any */}
                            {ticket.project && (
                              <div className="flex items-center gap-1 text-[10px] text-slate-400 font-semibold bg-slate-50 dark:bg-slate-900 px-2 py-1 rounded-lg w-max">
                                <FolderKanban className="w-3 h-3 text-slate-400" />
                                <span className="truncate max-w-[150px]">{ticket.project.name}</span>
                              </div>
                            )}

                            {/* Deadline and Assignee */}
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center text-[10px] text-slate-500">
                              <div className="flex items-center gap-1">
                                <User className="w-3.5 h-3.5 text-slate-400" />
                                <span className="font-medium truncate max-w-[80px]">{ticket.assignee ? ticket.assignee.full_name : 'Не назначен'}</span>
                              </div>

                              {ticket.deadline ? (
                                <div className={`flex items-center gap-1 font-semibold ${isOverdue ? 'text-rose-500' : ''}`}>
                                  <Calendar className="w-3.5 h-3.5" />
                                  <span>{format(new Date(ticket.deadline), 'dd.MM.yy')}</span>
                                </div>
                              ) : (
                                <span>Без срока</span>
                              )}
                            </div>
                          </div>

                          {/* Card movement actions */}
                          <div className="flex justify-end gap-1.5 mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700">
                            {col.id !== 'New' && (
                              <button
                                onClick={() => handleMoveStatus(ticket, col.id === 'In Progress' ? 'New' : col.id === 'Review' ? 'In Progress' : 'Review')}
                                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 transition-colors"
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </button>
                            )}
                            {col.id !== 'Done' && (
                              <button
                                onClick={() => handleMoveStatus(ticket, col.id === 'New' ? 'In Progress' : col.id === 'In Progress' ? 'Review' : 'Done')}
                                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 transition-colors"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </motion.div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* --- CREATE TASK MODAL --- */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
            <motion.div
              variants={scaleIn}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <h3 className="font-bold text-lg text-slate-950 dark:text-white">Создать новую заявку/задачу</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateTicket} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Название задачи *</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Устранить протечку трубы в с/у"
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-950 dark:text-white focus:outline-none focus:border-violet-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Описание неисправности / Задачи</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Подробности для мастера..."
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-950 dark:text-white focus:outline-none focus:border-violet-500 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Объект / Проект</label>
                    <select
                      value={newProjectId || ''}
                      onChange={(e) => setNewProjectId(e.target.value ? Number(e.target.value) : undefined)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-violet-500 text-slate-950 dark:text-white"
                    >
                      <option value="">Без привязки к проекту</option>
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>[{p.code}] {p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Ответственный</label>
                    <select
                      value={newAssigneeId || ''}
                      onChange={(e) => setNewAssigneeId(e.target.value ? Number(e.target.value) : undefined)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-violet-500 text-slate-950 dark:text-white"
                    >
                      <option value="">Не назначать</option>
                      {workers.map(w => (
                        <option key={w.id} value={w.id}>{w.full_name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Срок выполнения (Deadline)</label>
                    <input
                      type="date"
                      value={deadline}
                      onChange={(e) => setDeadline(e.target.value)}
                      className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-violet-500 text-slate-950 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Приоритет</label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-violet-500 text-slate-950 dark:text-white"
                    >
                      <option value="Low">Низкий (Low)</option>
                      <option value="Medium">Средний (Medium)</option>
                      <option value="High">Высокий (High)</option>
                    </select>
                  </div>
                </div>

                <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-5 py-2.5 border border-slate-200 dark:border-slate-700 dark:text-slate-300 hover:bg-slate-50 rounded-xl text-sm font-semibold transition-colors"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-all"
                  >
                    Создать
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
