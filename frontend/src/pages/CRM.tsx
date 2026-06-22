import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '@/hooks/useToast'
import { apiGet, apiPost, apiDelete } from '@/lib/api-client'
import { 
  Building2, Briefcase, Users, Calendar, DollarSign, Plus, Share2, 
  Trash2, ArrowRight, Eye, ClipboardList, Clock, CheckCircle2, ChevronRight, X, ExternalLink, Copy
} from 'lucide-react'
import { staggerContainer, fadeInUp, scaleIn } from '@/lib/motion'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

interface ProjectObject {
  id: number
  name: string
  address?: string
  object_type?: string
  area?: number
  floors?: number
  status: string
}

interface Project {
  id: number
  code?: string
  name: string
  description?: string
  customer_name?: string
  customer_contact?: string
  status: 'planning' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled'
  planned_start?: string
  planned_end?: string
  budget: number
  spent: number
  objects: ProjectObject[]
}

interface Client {
  id: number
  name: string
  phone?: string
  email?: string
  company?: string
  client_type: string
}

export default function CRM() {
  const [projects, setProjects] = useState<Project[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [activeTab, setActiveTab] = useState<'projects' | 'clients'>('projects')
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [shareLink, setShareLink] = useState<string | null>(null)
  
  // Форма проекта
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerContact, setCustomerContact] = useState('')
  const [plannedStart, setPlannedStart] = useState('')
  const [plannedEnd, setPlannedEnd] = useState('')
  const [budget, setBudget] = useState(0)

  const toast = useToast()

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const projs = await apiGet<Project[]>('/crm-projects/')
      setProjects(projs)
      const cls = await apiGet<Client[]>('/clients/')
      setClients(cls)
    } catch (err: any) {
      toast.error('Не удалось загрузить данные CRM: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name) {
      toast.error('Название проекта обязательно')
      return
    }

    try {
      await apiPost('/crm-projects/', {
        name,
        description,
        customer_name: customerName,
        customer_contact: customerContact,
        planned_start: plannedStart || null,
        planned_end: plannedEnd || null,
        budget: Number(budget),
        objects: []
      })
      toast.success('Проект успешно создан!')
      setIsModalOpen(false)
      // Очистка полей
      setName('')
      setDescription('')
      setCustomerName('')
      setCustomerContact('')
      setPlannedStart('')
      setPlannedEnd('')
      setBudget(0)
      fetchData()
    } catch (err: any) {
      toast.error('Ошибка создания проекта: ' + err.message)
    }
  }

  const handleDeleteProject = async (projectId: number) => {
    if (!confirm('Вы уверены, что хотите удалить этот проект со всеми этапами, платежами и фотографиями?')) return
    try {
      await apiDelete(`/crm-projects/${projectId}`)
      toast.success('Проект успешно удален')
      fetchData()
    } catch (err: any) {
      toast.error('Ошибка удаления: ' + err.message)
    }
  }

  const handleShareProject = async (projectId: number) => {
    try {
      const res = await apiPost<{ share_token: string; client_url: string }>(`/crm-projects/${projectId}/share`, {})
      setShareLink(res.client_url)
    } catch (err: any) {
      toast.error('Не удалось сгенерировать ссылку доступа: ' + err.message)
    }
  }

  const copyToClipboard = () => {
    if (shareLink) {
      navigator.clipboard.writeText(shareLink)
      toast.success('Ссылка скопирована в буфер обмена!')
    }
  }

  // Расчет показателей
  const totalBudget = projects.reduce((acc, p) => acc + p.budget, 0)
  const totalSpent = projects.reduce((acc, p) => acc + p.spent, 0)
  const statusLabels = {
    planning: { label: 'Планирование', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
    in_progress: { label: 'В работе', color: 'bg-sky-500/10 text-sky-500 border-sky-500/20' },
    on_hold: { label: 'Приостановлен', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' },
    completed: { label: 'Завершен', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
    cancelled: { label: 'Отменен', color: 'bg-rose-500/10 text-rose-500 border-rose-500/20' },
  }

  return (
    <motion.div 
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-6 text-slate-800 dark:text-slate-100"
    >
      {/* Top Banner Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Всего проектов', value: projects.length, icon: Briefcase, color: 'from-blue-500 to-indigo-600' },
          { label: 'Проекты в работе', value: projects.filter(p => p.status === 'in_progress').length, icon: Clock, color: 'from-sky-400 to-blue-500' },
          { label: 'Общий бюджет смет', value: `${totalBudget.toLocaleString()} ₽`, icon: DollarSign, color: 'from-emerald-400 to-teal-500' },
          { label: 'Всего клиентов', value: clients.length, icon: Users, color: 'from-purple-500 to-pink-500' },
        ].map((stat, i) => (
          <motion.div 
            key={i} 
            variants={fadeInUp}
            className="relative overflow-hidden bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{stat.label}</p>
                <p className="text-2xl font-bold mt-1 text-slate-900 dark:text-white">{stat.value}</p>
              </div>
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center text-white shadow-sm`}>
                <stat.icon className="w-6 h-6" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Tabs Control */}
      <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700">
        <div className="flex space-x-1">
          {[
            { id: 'projects', label: 'Строительные проекты', icon: Briefcase },
            { id: 'clients', label: 'Реестр клиентов', icon: Users },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-5 py-3 border-b-2 font-medium text-sm transition-all ${
                activeTab === tab.id 
                  ? 'border-violet-600 text-violet-600 dark:text-violet-400 dark:border-violet-500 font-semibold' 
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
        
        {activeTab === 'projects' && (
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl shadow-sm text-sm font-medium transition-all"
          >
            <Plus className="w-4 h-4" />
            Создать проект
          </button>
        )}
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-64 bg-slate-100 dark:bg-slate-800 animate-pulse rounded-2xl border border-slate-200 dark:border-slate-700" />
          ))}
        </div>
      ) : activeTab === 'projects' ? (
        projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
            <Building2 className="w-16 h-16 text-slate-400 dark:text-slate-500 mb-4" />
            <p className="text-lg font-semibold text-slate-900 dark:text-white">Проектов пока нет</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Создайте свой первый строительный проект для ведения графиков и смет</p>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
            >
              Создать проект
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {projects.map((project) => {
              const statusCfg = statusLabels[project.status] || { label: project.status, color: 'bg-slate-500/10 text-slate-500' }
              return (
                <motion.div
                  key={project.id}
                  variants={fadeInUp}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
                >
                  <div className="p-6 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{project.code}</span>
                        <h3 className="font-bold text-lg text-slate-950 dark:text-white mt-1 leading-snug line-clamp-2">{project.name}</h3>
                      </div>
                      <span className={`px-2.5 py-1 text-xs font-medium rounded-full border ${statusCfg.color}`}>
                        {statusCfg.label}
                      </span>
                    </div>

                    {project.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{project.description.split('[SHARE_TOKEN:')[0]}</p>
                    )}

                    <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                      {project.customer_name && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">Заказчик:</span>
                          <span className="font-medium">{project.customer_name}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-slate-400">Бюджет проекта:</span>
                        <span className="font-medium text-slate-900 dark:text-white">{project.budget.toLocaleString()} ₽</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Даты проведения:</span>
                        <span className="font-medium">
                          {project.planned_start ? format(new Date(project.planned_start), 'dd.MM.yyyy') : '—'} – {project.planned_end ? format(new Date(project.planned_end), 'dd.MM.yyyy') : '—'}
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar placeholder or stages indicator */}
                    <div className="pt-2">
                      <div className="flex justify-between text-xs text-slate-400 mb-1">
                        <span>Физический прогресс</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">В процессе</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-gradient-to-r from-violet-500 to-indigo-600 h-full rounded-full w-2/3" />
                      </div>
                    </div>
                  </div>

                  {/* Actions Links Panel */}
                  <div className="bg-slate-50 dark:bg-slate-800/80 px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center">
                    <div className="flex items-center gap-1.5">
                      <Link 
                        to={`/schedule?projectId=${project.id}`} 
                        title="График работ" 
                        className="p-2 text-slate-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                      >
                        <Calendar className="w-4 h-4" />
                      </Link>
                      <Link 
                        to={`/payments?projectId=${project.id}`} 
                        title="Платежи" 
                        className="p-2 text-slate-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                      >
                        <DollarSign className="w-4 h-4" />
                      </Link>
                      <Link 
                        to={`/photos?projectId=${project.id}`} 
                        title="Фотоотчеты" 
                        className="p-2 text-slate-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                      >
                        <ClipboardList className="w-4 h-4" />
                      </Link>
                      <button 
                        onClick={() => handleShareProject(project.id)}
                        title="Поделиться доступом" 
                        className="p-2 text-slate-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleDeleteProject(project.id)}
                        className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <Link 
                        to={`/estimates`} 
                        className="flex items-center gap-1 text-xs font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-700"
                      >
                        Сметы
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )
      ) : (
        /* Clients List Tab */
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Реестр заказчиков (CRM)</h3>
          </div>
          {clients.length === 0 ? (
            <div className="p-12 text-center text-slate-500 dark:text-slate-400">
              Заказчики отсутствуют. Создайте сметы, чтобы добавить клиентов.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                    <th className="px-6 py-4">Имя / Компания</th>
                    <th className="px-6 py-4">Тип</th>
                    <th className="px-6 py-4">Телефон</th>
                    <th className="px-6 py-4">Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {clients.map((client) => (
                    <tr key={client.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4 font-semibold text-slate-950 dark:text-white">
                        {client.name}
                        {client.company && (
                          <span className="block text-xs text-slate-400 font-normal mt-0.5">{client.company}</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 text-xs rounded-full border ${
                          client.client_type === 'company' 
                            ? 'bg-purple-500/10 text-purple-600 border-purple-500/20' 
                            : 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20'
                        }`}>
                          {client.client_type === 'company' ? 'Юр. лицо' : 'Физ. лицо'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{client.phone || '—'}</td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{client.email || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* --- CREATE PROJECT MODAL --- */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
            <motion.div
              variants={scaleIn}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <h3 className="font-bold text-lg text-slate-950 dark:text-white">Новый строительный проект</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateProject} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Название проекта *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Строительство коттеджа КП Миллениум"
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-950 dark:text-white focus:outline-none focus:border-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Описание / Заметки</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    placeholder="Дополнительные детали объекта..."
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-950 dark:text-white focus:outline-none focus:border-violet-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Заказчик (ФИО)</label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Алексей Петров"
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-950 dark:text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Контакты заказчика</label>
                    <input
                      type="text"
                      value={customerContact}
                      onChange={(e) => setCustomerContact(e.target.value)}
                      placeholder="+7 (999) 123-45-67"
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-950 dark:text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Начало</label>
                    <input
                      type="date"
                      value={plannedStart}
                      onChange={(e) => setPlannedStart(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-950 dark:text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Завершение</label>
                    <input
                      type="date"
                      value={plannedEnd}
                      onChange={(e) => setPlannedEnd(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-950 dark:text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Бюджет (₽)</label>
                    <input
                      type="number"
                      value={budget}
                      onChange={(e) => setBudget(Number(e.target.value))}
                      placeholder="0"
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-950 dark:text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>
                </div>

                <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-5 py-2.5 border border-slate-200 dark:border-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-sm font-semibold transition-colors"
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

      {/* --- SHARE LINK POPUP MODAL --- */}
      <AnimatePresence>
        {shareLink && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
            <motion.div
              variants={scaleIn}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden p-6"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg text-slate-950 dark:text-white">Ссылка гостевого просмотра (Client Portal)</h3>
                <button onClick={() => setShareLink(null)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Отправьте эту ссылку клиенту. Он сможет просматривать смету, фотоотчёты и статус платежей в реальном времени, а также комментировать этапы работ без регистрации.
              </p>

              <div className="flex gap-2 mb-6">
                <input
                  type="text"
                  readOnly
                  value={shareLink}
                  className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
                />
                <button
                  onClick={copyToClipboard}
                  className="p-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl text-slate-700 dark:text-slate-300 transition-colors"
                  title="Копировать"
                >
                  <Copy className="w-5 h-5" />
                </button>
              </div>

              <div className="flex justify-end gap-3">
                <a
                  href={shareLink}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors"
                >
                  Открыть в браузере
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
