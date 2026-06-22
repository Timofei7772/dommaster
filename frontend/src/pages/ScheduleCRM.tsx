import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '@/hooks/useToast'
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api-client'
import { 
  Calendar, User, Clock, CheckCircle2, AlertTriangle, Plus, Trash2, Edit2, Check, X, ArrowLeft, Loader2
} from 'lucide-react'
import { staggerContainer, fadeInUp } from '@/lib/motion'

interface Worker {
  id: number
  full_name: string
  role: string
}

interface Stage {
  id: number
  project_id: number
  name: string
  executor_id?: number
  start_date: string
  end_date: string
  status: 'not_started' | 'in_progress' | 'done' | 'delayed'
  executor?: Worker
}

export default function ScheduleCRM() {
  const [searchParams] = useSearchParams()
  const projectId = searchParams.get('projectId')
  
  const [stages, setStages] = useState<Stage[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)
  const [projectName, setProjectName] = useState('')
  
  // Состояния редактирования
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editExecutor, setEditExecutor] = useState<number | undefined>(undefined)
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editStatus, setEditStatus] = useState<'not_started' | 'in_progress' | 'done' | 'delayed'>('not_started')

  // Форма добавления нового этапа
  const [newStageName, setNewStageName] = useState('')
  const [newStageStart, setNewStageStart] = useState('')
  const [newStageEnd, setNewStageEnd] = useState('')
  const [newStageExecutor, setNewStageExecutor] = useState<number | undefined>(undefined)

  const toast = useToast()

  useEffect(() => {
    if (projectId) {
      fetchData()
    }
  }, [projectId])

  const fetchData = async () => {
    setLoading(true)
    try {
      const project = await apiGet<any>(`/crm-projects/${projectId}`)
      setProjectName(project.name)
      
      const stagesData = await apiGet<Stage[]>(`/crm-stages/project/${projectId}`)
      setStages(stagesData)
      
      const workersData = await apiGet<Worker[]>(`/crm-projects/${projectId}/workers`)
      setWorkers(workersData)
    } catch (err: any) {
      toast.error('Ошибка загрузки этапов: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAddStage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newStageName || !newStageStart || !newStageEnd) {
      toast.error('Заполните название и даты этапа')
      return
    }

    try {
      await apiPost(`/crm-stages/project/${projectId}`, {
        name: newStageName,
        start_date: newStageStart,
        end_date: newStageEnd,
        executor_id: newStageExecutor || null,
        status: 'not_started'
      })
      toast.success('Этап добавлен в график!')
      setNewStageName('')
      setNewStageStart('')
      setNewStageEnd('')
      setNewStageExecutor(undefined)
      fetchData()
    } catch (err: any) {
      toast.error('Ошибка добавления этапа: ' + err.message)
    }
  }

  const handleStartEdit = (stage: Stage) => {
    setEditingId(stage.id)
    setEditName(stage.name)
    setEditExecutor(stage.executor_id)
    setEditStart(stage.start_date)
    setEditEnd(stage.end_date)
    setEditStatus(stage.status)
  }

  const handleSaveEdit = async (stageId: number) => {
    try {
      await apiPut(`/crm-stages/${stageId}`, {
        name: editName,
        executor_id: editExecutor || null,
        start_date: editStart,
        end_date: editEnd,
        status: editStatus
      })
      toast.success('Этап сохранен')
      setEditingId(null)
      fetchData()
    } catch (err: any) {
      toast.error('Ошибка сохранения: ' + err.message)
    }
  }

  const handleDeleteStage = async (stageId: number) => {
    if (!confirm('Удалить этот этап из графика?')) return
    try {
      await apiDelete(`/crm-stages/${stageId}`)
      toast.success('Этап удален')
      fetchData()
    } catch (err: any) {
      toast.error('Ошибка удаления: ' + err.message)
    }
  }

  const statusOptions = [
    { value: 'not_started', label: 'Не начат', color: 'bg-slate-500/10 text-slate-500 border-slate-500/20' },
    { value: 'in_progress', label: 'В процессе', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
    { value: 'done', label: 'Завершен', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
    { value: 'delayed', label: 'Просрочен', color: 'bg-rose-500/10 text-rose-500 border-rose-500/20' }
  ]

  if (!projectId) {
    return (
      <div className="p-8 text-center text-slate-500">
        Укажите идентификатор проекта (?projectId=...) для просмотра его графика работ
      </div>
    )
  }

  return (
    <motion.div 
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-6 text-slate-800 dark:text-slate-100"
    >
      {/* Header with back navigation */}
      <div className="flex items-center gap-4">
        <Link 
          to="/crm"
          className="p-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </Link>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">График строительных работ (Gantt)</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Проект: {projectName || 'Загрузка...'}</p>
        </div>
      </div>

      {/* Inline Quick Add Stage Form */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Добавить этап в график</h3>
        <form onSubmit={handleAddStage} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Название этапа</label>
            <input
              type="text"
              required
              placeholder="Фундаментные плиты..."
              value={newStageName}
              onChange={(e) => setNewStageName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-violet-500 text-slate-950 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Ответственный</label>
            <select
              value={newStageExecutor || ''}
              onChange={(e) => setNewStageExecutor(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-violet-500 text-slate-950 dark:text-white"
            >
              <option value="">Назначить исполнителя</option>
              {workers.map(w => (
                <option key={w.id} value={w.id}>{w.full_name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Начало</label>
              <input
                type="date"
                required
                value={newStageStart}
                onChange={(e) => setNewStageStart(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-violet-500 text-slate-950 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Завершение</label>
              <input
                type="date"
                required
                value={newStageEnd}
                onChange={(e) => setNewStageEnd(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-violet-500 text-slate-950 dark:text-white"
              />
            </div>
          </div>
          <button
            type="submit"
            className="w-full py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold shadow-sm flex items-center justify-center gap-1.5 transition-colors h-9"
          >
            <Plus className="w-4 h-4" />
            Добавить
          </button>
        </form>
      </div>

      {/* Timeline stages table */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-slate-500 flex flex-col justify-center items-center gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
            Загрузка графика...
          </div>
        ) : stages.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            В графике пока нет этапов работ. Заполните форму выше, чтобы создать первый этап.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  <th className="px-6 py-4">Название этапа</th>
                  <th className="px-6 py-4">Ответственный</th>
                  <th className="px-6 py-4">Сроки проведения</th>
                  <th className="px-6 py-4">Статус</th>
                  <th className="px-6 py-4 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {stages.map((stage) => {
                  const isEditing = editingId === stage.id
                  const statusOpt = statusOptions.find(o => o.value === stage.status) || { label: stage.status, color: '' }

                  return (
                    <motion.tr 
                      key={stage.id} 
                      variants={fadeInUp}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      {/* 1. Name Column */}
                      <td className="px-6 py-4 font-medium">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="px-2.5 py-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-950 dark:text-white focus:outline-none w-full"
                          />
                        ) : (
                          stage.name
                        )}
                      </td>

                      {/* 2. Executor Column */}
                      <td className="px-6 py-4">
                        {isEditing ? (
                          <select
                            value={editExecutor || ''}
                            onChange={(e) => setEditExecutor(e.target.value ? Number(e.target.value) : undefined)}
                            className="px-2 py-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-950 dark:text-white focus:outline-none"
                          >
                            <option value="">Не назначен</option>
                            {workers.map(w => (
                              <option key={w.id} value={w.id}>{w.full_name}</option>
                            ))}
                          </select>
                        ) : (
                          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                            <User className="w-4 h-4 text-slate-400" />
                            {stage.executor ? stage.executor.full_name : <span className="text-slate-400 italic">Не назначен</span>}
                          </div>
                        )}
                      </td>

                      {/* 3. Dates Column */}
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="date"
                              value={editStart}
                              onChange={(e) => setEditStart(e.target.value)}
                              className="px-1.5 py-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs"
                            />
                            <span>–</span>
                            <input
                              type="date"
                              value={editEnd}
                              onChange={(e) => setEditEnd(e.target.value)}
                              className="px-1.5 py-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs"
                            />
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4 text-slate-400" />
                            {stage.start_date} – {stage.end_date}
                          </div>
                        )}
                      </td>

                      {/* 4. Status Column */}
                      <td className="px-6 py-4">
                        {isEditing ? (
                          <select
                            value={editStatus}
                            onChange={(e) => setEditStatus(e.target.value as any)}
                            className="px-2 py-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-950 dark:text-white focus:outline-none"
                          >
                            {statusOptions.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={`px-2.5 py-1 text-xs font-medium rounded-full border ${statusOpt.color}`}>
                            {statusOpt.label}
                          </span>
                        )}
                      </td>

                      {/* 5. Action Buttons */}
                      <td className="px-6 py-4 text-right">
                        {isEditing ? (
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => handleSaveEdit(stage.id)}
                              className="p-1.5 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg transition-colors"
                              title="Сохранить"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                              title="Отмена"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => handleStartEdit(stage)}
                              className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg transition-colors"
                              title="Редактировать"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteStage(stage.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg transition-colors"
                              title="Удалить"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  )
}
