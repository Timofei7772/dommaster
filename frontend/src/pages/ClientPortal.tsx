import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '@/hooks/useToast'
import { apiGet, apiPost } from '@/lib/api-client'
import { 
  Calendar, DollarSign, Camera, FileText, MessageSquare, Send, Loader2, AlertCircle
} from 'lucide-react'
import { staggerContainer, fadeInUp, scaleIn } from '@/lib/motion'


interface Project {
  id: number
  name: string
  code?: string
  status: string
  planned_start?: string
  planned_end?: string
  budget: number
  spent: number
  description?: string
}

interface Stage {
  id: number
  name: string
  start_date: string
  end_date: string
  status: string
  comments: string[]
}

interface Payment {
  id: number
  description: string
  planned_date: string
  planned_amount: number
  actual_amount: number
  status: string
}

interface Photo {
  id: number
  url: string
  stage_name?: string
  created_at: string
}

interface EstimateItem {
  id: number
  name: string
  unit?: string
  quantity: number
  total: number
  row_type: string
  is_work: boolean
}

interface Estimate {
  id: number
  name: string
  total_with_vat: number
  items: EstimateItem[]
}

export default function ClientPortal() {
  const { token } = useParams<{ token: string }>()
  
  const [project, setProject] = useState<Project | null>(null)
  const [stages, setStages] = useState<Stage[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [paymentsStats, setPaymentsStats] = useState({ total_planned: 0, total_paid: 0, total_remaining: 0 })
  const [photos, setPhotos] = useState<Photo[]>([])
  const [estimates, setEstimates] = useState<Estimate[]>([])
  const [loading, setLoading] = useState(true)
  
  // Комментарии
  const [activeStageId, setActiveStageId] = useState<number | null>(null)
  const [newComment, setNewComment] = useState('')
  const [sendingComment, setSendingComment] = useState(false)

  const toast = useToast()

  useEffect(() => {
    if (token) {
      fetchPortalData()
    }
  }, [token])

  const fetchPortalData = async () => {
    setLoading(true)
    try {
      const projData = await apiGet<Project>(`/client-portal/${token}`)
      setProject(projData)

      const stagesData = await apiGet<Stage[]>(`/client-portal/${token}/stages`)
      setStages(stagesData)

      const payData = await apiGet<any>(`/client-portal/${token}/payments`)
      setPayments(payData.payments)
      setPaymentsStats({
        total_planned: payData.total_planned,
        total_paid: payData.total_paid,
        total_remaining: payData.total_remaining
      })

      const photosData = await apiGet<Photo[]>(`/client-portal/${token}/photos`)
      setPhotos(photosData)

      const estData = await apiGet<Estimate[]>(`/client-portal/${token}/estimates`)
      setEstimates(estData)
    } catch (err: any) {
      toast.error('Не удалось загрузить данные портала: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSendComment = async (stageId: number) => {
    if (!newComment.trim()) return
    setSendingComment(true)
    try {
      const res = await apiPost<any>(`/client-portal/${token}/stages/${stageId}/comment`, {
        comment: newComment
      })
      toast.success('Комментарий отправлен прорабу!')
      setNewComment('')
      setActiveStageId(null)
      
      // Локально обновляем комментарии этапа
      setStages(stages.map(s => s.id === stageId ? { ...s, comments: res.comments } : s))
    } catch (err: any) {
      toast.error('Ошибка отправки: ' + err.message)
    } finally {
      setSendingComment(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center text-slate-400 gap-2">
        <Loader2 className="w-10 h-10 animate-spin text-violet-500" />
        Загрузка персонального портала заказчика...
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center text-center p-6">
        <AlertCircle className="w-16 h-16 text-rose-500 mb-4 animate-bounce" />
        <h2 className="text-xl font-bold text-white mb-2">Доступ ограничен</h2>
        <p className="text-sm text-slate-400 max-w-sm">Ссылка гостевого просмотра недействительна или срок действия токена истек.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 relative overflow-hidden">
      {/* Gradients */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-6xl mx-auto space-y-8 relative z-10">
        {/* Header client info */}
        <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 text-[10px] font-bold bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded-full">КЛИЕНТСКИЙ ПОРТАЛ</span>
              {project.code && <span className="text-xs text-slate-500 font-mono">#{project.code}</span>}
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">{project.name}</h1>
            <p className="text-sm text-slate-400 max-w-lg">
              Личный кабинет мониторинга хода строительных работ и финансовых расчетов по договору подряда.
            </p>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 flex gap-6 text-center shadow-inner min-w-[250px] justify-around">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Всего бюджет</p>
              <p className="text-lg font-bold text-white mt-1">{project.budget.toLocaleString()} ₽</p>
            </div>
            <div className="w-px bg-slate-800" />
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Оплачено</p>
              <p className="text-lg font-bold text-emerald-400 mt-1">{paymentsStats.total_paid.toLocaleString()} ₽</p>
            </div>
          </div>
        </div>

        {/* Physical Progress indicator */}
        <div className="bg-slate-900/40 backdrop-blur-md border border-slate-850 rounded-2xl p-6">
          <div className="flex justify-between items-center mb-2 text-sm text-slate-400">
            <span>Общий строительный прогресс</span>
            <span className="font-bold text-white">В соответствии с графиком</span>
          </div>
          <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
            <div className="bg-gradient-to-r from-violet-500 to-fuchsia-500 h-full rounded-full w-2/3" />
          </div>
        </div>

        {/* Modules Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Module 1: Work Schedule Gantt */}
          <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-6 space-y-4">
            <h3 className="font-bold text-lg text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-violet-500" />
              График выполнения этапов работ
            </h3>
            
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {stages.length === 0 ? (
                <p className="text-sm text-slate-500 italic">Данные графика работ пока не внесены.</p>
              ) : (
                stages.map(s => {
                  const isDone = s.status === 'done'
                  return (
                    <div key={s.id} className="bg-slate-950/60 border border-slate-850 rounded-xl p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold text-sm text-white">{s.name}</h4>
                          <span className="text-[10px] text-slate-500 block mt-0.5">{s.start_date} – {s.end_date}</span>
                        </div>
                        <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full border ${
                          isDone 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                            : s.status === 'in_progress'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                            : s.status === 'delayed'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                        }`}>
                          {isDone ? 'Завершен' : s.status === 'in_progress' ? 'В процессе' : s.status === 'delayed' ? 'Просрочен' : 'Ожидает'}
                        </span>
                      </div>

                      {/* Comments section */}
                      <div className="space-y-1.5 pt-2 border-t border-slate-900">
                        {s.comments.map((c, i) => (
                          <div key={i} className="text-[11px] text-slate-400 leading-normal pl-2 border-l border-violet-500/30">
                            {c}
                          </div>
                        ))}

                        {activeStageId === s.id ? (
                          <div className="flex gap-2 pt-2">
                            <input
                              type="text"
                              placeholder="Напишите комментарий прорабу..."
                              value={newComment}
                              onChange={(e) => setNewComment(e.target.value)}
                              className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs focus:outline-none"
                            />
                            <button
                              onClick={() => handleSendComment(s.id)}
                              disabled={sendingComment}
                              className="p-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors disabled:opacity-50"
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setActiveStageId(s.id); setNewComment('') }}
                            className="text-[10px] text-violet-400 hover:text-violet-300 font-semibold flex items-center gap-1 mt-1.5"
                          >
                            <MessageSquare className="w-3 h-3" />
                            Написать комментарий по этапу
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Module 2: Payments Schedule */}
          <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-6 space-y-4">
            <h3 className="font-bold text-lg text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-violet-500" />
              График и статус платежей
            </h3>

            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {payments.length === 0 ? (
                <p className="text-sm text-slate-500 italic">Данные о планируемых платежах пока отсутствуют.</p>
              ) : (
                payments.map(p => {
                  const isPaid = p.status === 'paid'
                  return (
                    <div key={p.id} className="bg-slate-950/60 border border-slate-850 rounded-xl p-4 flex justify-between items-center">
                      <div>
                        <h4 className="font-semibold text-sm text-white">{p.description}</h4>
                        <span className="text-[10px] text-slate-500 block mt-0.5">Срок: {p.planned_date}</span>
                      </div>
                      <div className="text-right space-y-1">
                        <p className="text-sm font-bold text-white">{isPaid ? p.actual_amount.toLocaleString() : p.planned_amount.toLocaleString()} ₽</p>
                        <span className={`inline-block px-2 py-0.5 text-[9px] font-medium rounded-full border ${
                          isPaid 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                            : p.status === 'delayed'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                        }`}>
                          {isPaid ? 'Получен' : p.status === 'delayed' ? 'Просрочен' : 'Ожидается'}
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Module 3: Photo Reports */}
          <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-6 space-y-4 lg:col-span-2">
            <h3 className="font-bold text-lg text-white flex items-center gap-2">
              <Camera className="w-5 h-5 text-violet-500" />
              Фотогалерея выполненных работ
            </h3>

            {photos.length === 0 ? (
              <p className="text-sm text-slate-500 italic">Фотоотчётов пока нет.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {photos.map(p => (
                  <a
                    key={p.id}
                    href={`http://localhost:8000${p.url}`}
                    target="_blank"
                    rel="noreferrer"
                    className="group relative aspect-square bg-slate-950 border border-slate-850 rounded-xl overflow-hidden shadow-sm"
                  >
                    <span className="absolute top-1.5 left-1.5 z-10 px-1.5 py-0.5 text-[8px] font-semibold bg-slate-950/80 rounded-full">
                      {p.stage_name || 'Общий'}
                    </span>
                    <img 
                      src={`http://localhost:8000${p.url}`} 
                      alt="Progress" 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Module 4: Current Estimate */}
          <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-6 space-y-4 lg:col-span-2">
            <h3 className="font-bold text-lg text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-violet-500" />
              Текущая смета по проекту
            </h3>

            {estimates.length === 0 ? (
              <p className="text-sm text-slate-500 italic">Сметная спецификация отсутствует.</p>
            ) : (
              <div className="space-y-4">
                {estimates.map(est => (
                  <div key={est.id} className="bg-slate-950/60 border border-slate-850 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 bg-slate-900/50 flex justify-between items-center border-b border-slate-900">
                      <span className="font-semibold text-xs text-slate-400">{est.name}</span>
                      <span className="font-bold text-sm text-violet-400">{est.total_with_vat.toLocaleString()} ₽</span>
                    </div>

                    <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-950 text-slate-500 border-b border-slate-900">
                            <th className="px-4 py-2.5">Работа / Материал</th>
                            <th className="px-4 py-2.5">Ед. изм.</th>
                            <th className="px-4 py-2.5 text-right">Кол-во</th>
                            <th className="px-4 py-2.5 text-right">Стоимость (₽)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900">
                          {est.items.map(item => (
                            <tr key={item.id} className="hover:bg-slate-900/30">
                              <td className="px-4 py-2.5 font-medium text-slate-300">{item.name}</td>
                              <td className="px-4 py-2.5 text-slate-500">{item.unit || 'шт'}</td>
                              <td className="px-4 py-2.5 text-right text-slate-400">{item.quantity}</td>
                              <td className="px-4 py-2.5 text-right font-semibold text-white">{item.total.toLocaleString()} ₽</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-slate-600 py-6 border-t border-slate-900 leading-relaxed">
          <p>© 2026 ZARU Software. Личный кабинет предоставлен подрядчиком в рамках договора строительного подряда SmetaAI.</p>
        </div>
      </div>
    </div>
  )
}
