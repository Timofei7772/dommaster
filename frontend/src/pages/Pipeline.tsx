/**
 * CRM Pipeline — Kanban-доска конвейера сделок
 * Лид → Контакт → Звонок → Встреча → Аванс → В работе → Контроль → Закрыто
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Search, X, Phone, MapPin,
  ArrowRight, AlertTriangle, MessageSquare,
  Trash2, DollarSign,
  Copy, Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils'
import { DEAL_STAGES, DEAL_SOURCES, getStageInfo, getSourceInfo, getScriptForStage } from '@/data/sales_scripts'
import { Link } from 'react-router-dom'
import { toast } from '@/lib/toast'
import {
  apiDelete as requestDelete,
  apiGet as requestGet,
  apiPatch as requestPatch,
  apiPost as requestPost,
} from '@/lib/api-client'

// ==================== TYPES ====================

interface Deal {
  id: number
  client_id: number | null
  title: string
  description: string | null
  address: string | null
  stage: string
  estimate_id: number | null
  sale_amount: number
  estimate_total: number
  cost_amount: number
  advance_amount: number
  profit: number
  source: string | null
  contact_name: string | null
  contact_phone: string | null
  meeting_date: string | null
  meeting_notes: string | null
  master_id: number | null
  master_name: string | null
  is_lost: boolean
  lost_reason: string | null
  notes: string | null
  next_action: string | null
  next_action_date: string | null
  last_contact_at: string | null
  created_at: string | null
  updated_at: string | null
  closed_at: string | null
}

interface DealActivity {
  id: number
  deal_id: number
  activity_type: string
  description: string | null
  old_stage: string | null
  new_stage: string | null
  created_at: string | null
}

interface PipelineStats {
  stage: string
  count: number
  total_sale_amount: number
  total_profit: number
}

// ==================== API HELPERS ====================

async function apiGet<T>(path: string): Promise<T> {
  return requestGet<T>(`/deals${path}`)
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return requestPost<T>(`/deals${path}`, body)
}

async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return requestPatch<T>(`/deals${path}`, body)
}

async function apiDelete(path: string): Promise<void> {
  return requestDelete(`/deals${path}`)
}

// ==================== SUB-COMPONENTS ====================

/** Модальное окно создания сделки */
function CreateDealModal({ onClose, onCreate, initialStage }: {
  onClose: () => void
  onCreate: (deal: Deal) => void
  initialStage: string
}) {
  const [form, setForm] = useState({
    title: '',
    contact_name: '',
    contact_phone: '',
    address: '',
    source: 'avito',
    notes: '',
    stage: initialStage,
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) return
    setLoading(true)
    try {
      const deal = await apiPost<Deal>('/', {
        ...form,
      })
      onCreate(deal)
      toast.success('Сделка успешно создана')
    } catch (err) {
      console.error('Ошибка создания сделки:', err)
      toast.error('Ошибка при создании сделки')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Новая сделка</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Название / Вид работ *</label>
            <input
              className="input"
              placeholder="Ремонт ванной, штукатурка стен..."
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              autoFocus
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Имя клиента</label>
              <input
                className="input"
                placeholder="Иванов Иван"
                value={form.contact_name}
                onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Телефон</label>
              <input
                className="input"
                placeholder="+7 (___) ___-__-__"
                value={form.contact_phone}
                onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Источник</label>
              <select
                className="input"
                value={form.source}
                onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
              >
                {DEAL_SOURCES.map(s => (
                  <option key={s.key} value={s.key}>{s.icon} {s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Заметки</label>
              <input
                className="input"
                placeholder="Короткий комментарий"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Отмена
            </button>
            <button type="submit" disabled={loading || !form.title.trim()} className="btn-primary flex-1">
              {loading ? 'Создание...' : 'Создать сделку'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


/** Модальное окно деталей сделки */
function DealDetailModal({ deal, onClose, onUpdate, onMove, onLost, onDelete }: {
  deal: Deal
  onClose: () => void
  onUpdate: (deal: Deal) => void
  onMove: (dealId: number, newStage: string) => void
  onLost: (dealId: number, reason: string) => void
  onDelete: (dealId: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [showScript, setShowScript] = useState(false)
  const [showLostForm, setShowLostForm] = useState(false)
  const [lostReason, setLostReason] = useState('')
  const [activities, setActivities] = useState<DealActivity[]>([])
  const [dealTemplates, setDealTemplates] = useState<{ id: number, stage: string, title: string, content: string, template_type: string }[]>([])
  const [activeTemplateId, setActiveTemplateId] = useState<number | null>(null)
  
  const [aiObjection, setAiObjection] = useState('')
  const [aiAnswers, setAiAnswers] = useState<string[]>([])
  const [aiLoading, setAiLoading] = useState(false)

  const [form, setForm] = useState({
    title: deal.title,
    contact_name: deal.contact_name || '',
    contact_phone: deal.contact_phone || '',
    address: deal.address || '',
    sale_amount: String(deal.sale_amount || ''),
    cost_amount: String(deal.cost_amount || ''),
    advance_amount: String(deal.advance_amount || ''),
    master_name: deal.master_name || '',
    notes: deal.notes || '',
    source: deal.source || 'other',
    next_action: deal.next_action || '',
    next_action_date: deal.next_action_date ? deal.next_action_date.split('T')[0] : '',
  })

  const stageInfo = getStageInfo(deal.stage)
  const script = getScriptForStage(deal.stage)
  const stageIndex = DEAL_STAGES.findIndex(s => s.key === deal.stage)
  const nextStage = stageIndex < DEAL_STAGES.length - 1 ? DEAL_STAGES[stageIndex + 1] : null

  useEffect(() => {
    apiGet<DealActivity[]>(`/${deal.id}/activities`).then(setActivities).catch(() => {})
    apiGet<any[]>('/templates/').then(setDealTemplates).catch(() => {})
  }, [deal.id])

  const logActivity = async (type: string, description: string) => {
    try {
      const newAct = await apiPost<DealActivity>(`/${deal.id}/activities`, { activity_type: type, description })
      setActivities(prev => [newAct, ...prev])
    } catch(e) {}
  }

  const askAi = async () => {
    if (!aiObjection.trim()) return
    setAiLoading(true)
    setAiAnswers([])
    try {
      const resp = await apiPost<{suggestions: string[]}>(`/${deal.id}/ai/suggest`, { client_message: aiObjection })
      setAiAnswers(resp.suggestions)
      toast.success('Сценарии сгенерированы')
    } catch(e: any) {
      toast.error(e.message || "Ошибка генерации AI")
    } finally {
      setAiLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      const updated = await apiPatch<Deal>(`/${deal.id}`, {
        ...form,
        sale_amount: parseFloat(form.sale_amount) || 0,
        cost_amount: parseFloat(form.cost_amount) || 0,
        advance_amount: parseFloat(form.advance_amount) || 0,
        next_action_date: form.next_action_date ? new Date(form.next_action_date).toISOString() : null,
      })
      onUpdate(updated)
      setEditing(false)
      toast.success('Изменения сохранены')
    } catch (err) {
      console.error(err)
      toast.error('Не удалось сохранить изменения')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm pt-8 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 mb-8 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{stageInfo?.icon}</span>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{deal.title}</h2>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r ${stageInfo?.gradient} text-white`}>
                    {stageInfo?.label}
                  </span>
                  {deal.source && (
                    <span className="text-xs">{getSourceInfo(deal.source)?.icon} {getSourceInfo(deal.source)?.label}</span>
                  )}
                  {deal.created_at && (
                    <span className="text-xs flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(deal.created_at).toLocaleDateString('ru-RU')}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Прогресс-бар этапов */}
          <div className="mt-4 flex items-center gap-1">
            {DEAL_STAGES.map((s, i) => (
              <div
                key={s.key}
                className={cn(
                  "h-2 flex-1 rounded-full transition-all duration-300",
                  i <= stageIndex
                    ? `bg-gradient-to-r ${s.gradient}`
                    : "bg-slate-200 dark:bg-slate-700"
                )}
              />
            ))}
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Follow-up / Действие */}
          <div className="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/50 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-400 flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4" /> Запланированное действие
            </h4>
            
            {editing ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Что сделать?</label>
                  <input className="input text-sm" placeholder="Напр. Перезвонить, отправить смету..." value={form.next_action} onChange={e => setForm(f => ({ ...f, next_action: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Когда?</label>
                  <input type="date" className="input text-sm" value={form.next_action_date} onChange={e => setForm(f => ({ ...f, next_action_date: e.target.value }))} />
                </div>
                <div className="flex gap-2 pt-1">
                   <button type="button" onClick={() => { const tmr = new Date(); tmr.setDate(tmr.getDate() + 1); setForm(f => ({...f, next_action_date: tmr.toISOString().split('T')[0]})) }} className="text-xs bg-white dark:bg-slate-700 px-2 py-1 rounded border border-slate-200 dark:border-slate-600 hover:bg-slate-50 transition-colors">Завтра</button>
                   <button type="button" onClick={() => { setForm(f => ({...f, next_action_date: new Date().toISOString().split('T')[0]})) }} className="text-xs bg-white dark:bg-slate-700 px-2 py-1 rounded border border-slate-200 dark:border-slate-600 hover:bg-slate-50 transition-colors">Сегодня</button>
                   <button type="button" onClick={() => { const nextWeek = new Date(); nextWeek.setDate(nextWeek.getDate() + 7); setForm(f => ({...f, next_action_date: nextWeek.toISOString().split('T')[0]})) }} className="text-xs bg-white dark:bg-slate-700 px-2 py-1 rounded border border-slate-200 dark:border-slate-600 hover:bg-slate-50 transition-colors">Через неделю</button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-4">
                {deal.next_action ? (
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{deal.next_action}</p>
                    {deal.next_action_date && (
                      <p className={cn(
                        "text-xs mt-1.5 font-bold px-2 py-0.5 inline-flex rounded-md", 
                        new Date(deal.next_action_date).setHours(0,0,0,0) < new Date().setHours(0,0,0,0) 
                          ? "bg-red-100 text-red-700" 
                          : "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                      )}>
                        Дедлайн: {new Date(deal.next_action_date).toLocaleDateString('ru-RU')}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 italic">Действие не запланировано. Нажмите редактировать.</p>
                )}
                {deal.next_action && (
                  <button 
                     onClick={async () => {
                        try {
                          const updated = await fetch(`/api/deals/${deal.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ next_action: null, next_action_date: null })
                          });
                          if(updated.ok) {
                            onUpdate(await updated.json());
                          }
                        } catch (e) {
                          console.error('Action done error', e);
                        }
                     }}
                     className="btn-sm btn-ghost text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 font-semibold"
                  >
                    ✓ Выполнено
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Действия */}
          <div className="flex flex-wrap gap-2">
            {nextStage && !deal.is_lost && (
              <button
                onClick={() => onMove(deal.id, nextStage.key)}
                className="btn-primary btn-sm flex items-center gap-2"
              >
                <ArrowRight className="w-4 h-4" />
                → {nextStage.icon} {nextStage.label}
              </button>
            )}
            {script && (
              <button
                onClick={() => setShowScript(!showScript)}
                className={cn("btn-sm flex items-center gap-2", showScript ? "btn-primary" : "btn-secondary")}
              >
                <MessageSquare className="w-4 h-4" />
                Что сказать клиенту
              </button>
            )}
            <button onClick={() => setEditing(!editing)} className="btn-secondary btn-sm flex items-center gap-2">
              ✏️ {editing ? 'Отмена' : 'Редактировать'}
            </button>
            {!deal.is_lost && (
              <button onClick={() => setShowLostForm(!showLostForm)} className="btn-ghost btn-sm flex items-center gap-2 text-red-500">
                <AlertTriangle className="w-4 h-4" />
                Потеряна
              </button>
            )}
            <Link 
              to={deal.estimate_id ? `/estimates/${deal.estimate_id}` : `/estimates/new?deal_id=${deal.id}`}
              className="btn-secondary btn-sm flex items-center gap-2 border-indigo-200 text-indigo-700 dark:text-indigo-400"
            >
              Комплектация/Смета
            </Link>
          </div>

          {/* Быстрые Шаблоны и AI-ассистент */}
          {showScript && (
            <div className="rounded-xl border-2 border-dashed border-indigo-300 dark:border-indigo-700 bg-indigo-50/30 dark:bg-indigo-950/20 p-5 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Быстрые ответы
                </h3>
                <Link to="/templates" className="p-1 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded-lg text-indigo-500 transition-colors" title="Настройки шаблонов">
                  <span className="text-xl">⚙️</span>
                </Link>
              </div>

              {/* 1. Чипсы Быстрых шаблонов */}
              <div className="flex flex-wrap gap-2">
                {dealTemplates.filter(t => t.stage === deal.stage || t.stage === 'common').map(tmpl => {
                    const isActive = activeTemplateId === tmpl.id;
                    return (
                       <button
                         key={tmpl.id}
                         onClick={() => setActiveTemplateId(isActive ? null : tmpl.id)}
                         className={cn(
                           "text-sm px-3 py-1.5 rounded-full border transition-all flex items-center gap-1.5 font-medium",
                           isActive 
                             ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200 dark:shadow-none" 
                             : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/40"
                         )}
                       >
                         {tmpl.template_type === 'SCRIPT' ? '📜' : '💬'} {tmpl.title}
                       </button>
                    )
                })}
              </div>

              {/* Активный шаблон */}
              {activeTemplateId && (
                <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-indigo-200 dark:border-indigo-800 shadow-sm relative animate-in fade-in zoom-in-95 duration-200">
                  {(() => {
                     const tmpl = dealTemplates.find(t => t.id === activeTemplateId);
                     if (!tmpl) return null;
                     const compiledText = tmpl.content
                        .replace(/{name}/g, deal.contact_name || 'Клиент')
                        .replace(/{address}/g, deal.address || 'Ваш адрес')
                        .replace(/{sale_amount}/g, deal.sale_amount ? String(deal.sale_amount) + ' руб.' : '0 руб.')

                     return (
                       <>
                         <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-line leading-relaxed pr-24">
                            {compiledText}
                         </p>
                         <div className="absolute top-2 right-2 flex items-center gap-1">
                            {tmpl.template_type === 'TEMPLATE' && (
                              <>
                                <a onClick={() => logActivity('message', `Отправлено WA: ${tmpl.title}`)} href={`https://wa.me/?text=${encodeURIComponent(compiledText)}`} target="_blank" rel="noreferrer" className="p-1.5 bg-green-50 hover:bg-green-100 dark:bg-green-900/30 dark:hover:bg-green-900/60 text-green-600 rounded-md transition-colors font-medium text-xs">
                                  WA
                                </a>
                                <a onClick={() => logActivity('message', `Отправлено TG: ${tmpl.title}`)} href={`https://t.me/share/url?url=${encodeURIComponent(compiledText)}`} target="_blank" rel="noreferrer" className="p-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/60 text-blue-500 rounded-md transition-colors font-medium text-xs">
                                  TG
                                </a>
                              </>
                            )}
                            <button onClick={() => { navigator.clipboard.writeText(compiledText); logActivity('message', `Скопировано: ${tmpl.title}`); toast.success('Сообщение скопировано в буфер') }} className="p-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-700 text-slate-500 rounded-md transition-colors">
                              <Copy className="w-4 h-4" />
                            </button>
                         </div>
                       </>
                     )
                  })()}
                </div>
              )}

              <hr className="border-indigo-100 dark:border-indigo-800/50" />

              {/* 2. AI Помощник */}
              <div className="space-y-3">
                 <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                   🤖 Нестандартное возражение?
                 </p>
                 <div className="flex gap-2">
                   <input
                     type="text"
                     placeholder="Например: Клиент говорит, что у частников дешевле"
                     className="input flex-1 text-sm bg-white dark:bg-slate-800"
                     value={aiObjection}
                     onChange={e => setAiObjection(e.target.value)}
                     onKeyDown={e => e.key === 'Enter' && askAi()}
                   />
                   <button onClick={askAi} disabled={aiLoading || !aiObjection.trim()} className="btn-primary text-sm px-4 shrink-0">
                     {aiLoading ? 'Думаю...' : 'Спросить AI'}
                   </button>
                 </div>

                 {/* AI Карточки ответов */}
                 {aiAnswers.length > 0 && (
                   <div className="space-y-3 mt-3 animate-in fade-in duration-300">
                     <p className="text-xs font-bold text-slate-500 uppercase">Сценарии ответа (AI)</p>
                     <div className="grid grid-cols-1 gap-3">
                       {aiAnswers.map((ans, idx) => (
                         <div key={idx} className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-indigo-100 dark:border-indigo-800 shadow-sm relative group pr-24">
                           <p className="text-sm text-slate-800 dark:text-slate-200">
                             <span className="font-semibold text-indigo-500 mr-1">{idx+1}.</span>
                             {ans}
                           </p>
                           <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                             <a onClick={() => logActivity('message', `Отправлено WA (AI Ответ ${idx+1})`)} href={`https://wa.me/?text=${encodeURIComponent(ans)}`} target="_blank" rel="noreferrer" className="p-1 px-2 bg-green-50 hover:bg-green-100 text-green-600 rounded text-xs">WA</a>
                             <a onClick={() => logActivity('message', `Отправлено TG (AI Ответ ${idx+1})`)} href={`https://t.me/share/url?url=${encodeURIComponent(ans)}`} target="_blank" rel="noreferrer" className="p-1 px-2 bg-blue-50 hover:bg-blue-100 text-blue-500 rounded text-xs">TG</a>
                           </div>
                         </div>
                       ))}
                     </div>
                   </div>
                 )}
              </div>
            </div>
          )}

          {/* Форма потери */}
          {showLostForm && (
            <div className="rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4 space-y-3">
              <p className="text-sm font-medium text-red-700 dark:text-red-400">Причина потери:</p>
              <input
                className="input"
                placeholder="Дорого / нашёл другого / передумал..."
                value={lostReason}
                onChange={e => setLostReason(e.target.value)}
              />
              <button
                onClick={() => { onLost(deal.id, lostReason); setShowLostForm(false) }}
                className="btn-danger btn-sm"
              >
                Отметить как потерянную
              </button>
            </div>
          )}

          {/* Финансы */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">Продажа</p>
              {editing ? (
                <input className="input input-sm text-center font-bold" type="number" value={form.sale_amount}
                  onChange={e => setForm(f => ({ ...f, sale_amount: e.target.value }))} />
              ) : (
                <p className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(deal.sale_amount)}</p>
              )}
            </div>
            
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">Смета</p>
              <p className="text-lg font-bold text-slate-700 dark:text-slate-300">
                {deal.estimate_id ? formatCurrency(deal.estimate_total) : '—'}
              </p>
            </div>
            
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">Мастеру</p>
              {editing ? (
                <input className="input input-sm text-center font-bold" type="number" value={form.cost_amount}
                  onChange={e => setForm(f => ({ ...f, cost_amount: e.target.value }))} />
              ) : (
                <p className="text-lg font-bold text-red-600">{formatCurrency(deal.cost_amount)}</p>
              )}
            </div>
            
            <div className={cn(
              "rounded-xl p-3 text-center",
              deal.profit >= 0
                ? "bg-emerald-50 dark:bg-emerald-950/30"
                : "bg-red-50 dark:bg-red-950/30"
            )}>
              <p className="text-xs text-slate-500 mb-1">Прибыль</p>
              <p className={cn(
                "text-lg font-bold",
                deal.profit >= 0 ? "text-emerald-600" : "text-red-600"
              )}>
                {formatCurrency(deal.profit)}
              </p>
            </div>
          </div>

          {/* Подробности (режим редактирования) */}
          {editing && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Название</label>
                <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Контакт</label>
                  <input className="input" value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Телефон</label>
                  <input className="input" value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Адрес</label>
                <input className="input" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Мастер</label>
                <input className="input" value={form.master_name} placeholder="Имя мастера" onChange={e => setForm(f => ({ ...f, master_name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Заметки</label>
                <textarea className="input min-h-[60px]" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setEditing(false)} className="btn-secondary flex-1">Отмена</button>
                <button onClick={handleSave} className="btn-primary flex-1">Сохранить</button>
              </div>
            </div>
          )}

          {/* Контакт (вид) */}
          {!editing && (deal.contact_name || deal.contact_phone || deal.address) && (
            <div className="space-y-2">
              {deal.contact_name && (
                <p className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2">
                  👤 {deal.contact_name}
                </p>
              )}
              {deal.contact_phone && (
                <a href={`tel:${deal.contact_phone}`} className="text-sm text-blue-600 dark:text-blue-400 flex items-center gap-2 hover:underline">
                  <Phone className="w-4 h-4" /> {deal.contact_phone}
                </a>
              )}
              {deal.address && (
                <p className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> {deal.address}
                </p>
              )}
              {deal.master_name && (
                <p className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2">
                  🔧 Мастер: {deal.master_name}
                </p>
              )}
              {deal.notes && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 italic">
                  {deal.notes}
                </p>
              )}
            </div>
          )}

          {/* История действий */}
          {activities.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">📋 История</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {activities.map(a => (
                  <div key={a.id} className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-400">
                    <div className="w-2 h-2 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                    <div className="flex-1">
                      <p>{a.description}</p>
                      {a.created_at && <p className="text-xs text-slate-400">{new Date(a.created_at).toLocaleString('ru-RU')}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Кнопка удаления */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={() => { if (confirm('Удалить сделку?')) onDelete(deal.id) }}
              className="btn-ghost btn-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Удалить сделку
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


/** Карточка сделки в колонке Kanban */
function DealCard({ deal, onClick, onDragStart }: {
  deal: Deal
  onClick: () => void
  onDragStart: (e: React.DragEvent, deal: Deal) => void
}) {
  const sourceInfo = deal.source ? getSourceInfo(deal.source) : null
  const daysAgo = deal.created_at ? Math.floor((Date.now() - new Date(deal.created_at).getTime()) / (1000 * 60 * 60 * 24)) : 0

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, deal)}
      onClick={onClick}
      className={cn(
        "group cursor-pointer rounded-xl p-3.5 border transition-all duration-200",
        "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700",
        "hover:shadow-lg hover:border-primary-300 dark:hover:border-primary-600",
        "hover:-translate-y-0.5",
        "active:scale-[0.98]",
        deal.is_lost && "opacity-50"
      )}
    >
      {/* Заголовок */}
      <p className="font-medium text-sm text-slate-900 dark:text-white truncate">{deal.title}</p>

      {/* Контакт */}
      {deal.contact_name && (
        <p className="text-xs text-slate-500 mt-1 truncate">👤 {deal.contact_name}</p>
      )}

      {/* Сумма и метки */}
      <div className="flex items-center justify-between mt-2.5">
        <div className="flex items-center gap-1.5">
          {deal.sale_amount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
              {deal.sale_amount >= 1000 ? `${Math.round(deal.sale_amount / 1000)}K` : deal.sale_amount} ₽
            </span>
          )}
          {sourceInfo && (
            <span className="text-xs" title={sourceInfo.label}>{sourceInfo.icon}</span>
          )}
        </div>
        <span className="text-[10px] text-slate-400">{daysAgo}д</span>
      </div>

      {/* Следующий шаг (Индикатор) */}
      {deal.next_action && deal.next_action_date && (
        <div className="mt-2">
           {(() => {
             const tDate = new Date(deal.next_action_date)
             tDate.setHours(0,0,0,0)
             const today = new Date()
             today.setHours(0,0,0,0)
             
             if (tDate < today) {
               return (
                 <div className="flex items-start gap-1 py-0.5 px-1.5 bg-red-50 dark:bg-red-900/20 rounded border border-red-100 dark:border-red-900/50">
                    <Clock className="w-3 h-3 text-red-500 mt-0.5 shrink-0" />
                    <span className="text-[10px] text-red-700 dark:text-red-400 leading-tight line-clamp-1">{deal.next_action}</span>
                 </div>
               )
             } else if (tDate.getTime() === today.getTime()) {
               return (
                 <div className="flex items-start gap-1 py-0.5 px-1.5 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-100 dark:border-blue-900/50">
                    <Clock className="w-3 h-3 text-blue-500 mt-0.5 shrink-0" />
                    <span className="text-[10px] text-blue-700 dark:text-blue-400 leading-tight line-clamp-1">{deal.next_action}</span>
                 </div>
               )
             }
             return null;
           })()}
        </div>
      )}

      {/* Аванс */}
      {deal.advance_amount > 0 && (
        <div className="mt-2 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
          <DollarSign className="w-3 h-3" />
          Аванс: {formatCurrency(deal.advance_amount)}
        </div>
      )}
    </div>
  )
}

// ==================== MAIN COMPONENT ====================

export default function Pipeline() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [stats, setStats] = useState<PipelineStats[]>([])
  const [, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createStage, setCreateStage] = useState('lead')
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)

  // Загрузка
  const fetchDeals = useCallback(async () => {
    try {
      const [dealsData, statsData] = await Promise.all([
        apiGet<Deal[]>('/'),
        apiGet<PipelineStats[]>('/stats'),
      ])
      setDeals(dealsData)
      setStats(statsData)
    } catch (err) {
      console.error('Ошибка загрузки:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDeals()
  }, [fetchDeals])

  useEffect(() => {
    const handleNewDeal = () => {
      setCreateStage('lead')
      setShowCreateModal(true)
    }
    const handleEsc = () => {
      setShowCreateModal(false)
      setSelectedDeal(null)
    }
    window.addEventListener('cmd-new', handleNewDeal)
    window.addEventListener('cmd-esc', handleEsc)
    return () => {
      window.removeEventListener('cmd-new', handleNewDeal)
      window.removeEventListener('cmd-esc', handleEsc)
    }
  }, [])

  // Группировка по этапам
  const dealsByStage = DEAL_STAGES.reduce((acc, stage) => {
    acc[stage.key] = deals.filter(d => {
      const matchesStage = d.stage === stage.key
      const matchesSearch = !searchQuery ||
        d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (d.contact_name && d.contact_name.toLowerCase().includes(searchQuery.toLowerCase()))
      return matchesStage && matchesSearch
    })
    return acc
  }, {} as Record<string, Deal[]>)

  // Drag & Drop
  const handleDragStart = (e: React.DragEvent, deal: Deal) => {
    e.dataTransfer.setData('deal_id', String(deal.id))
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, stageKey: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverStage(stageKey)
  }

  const handleDragLeave = () => {
    setDragOverStage(null)
  }

  const handleDrop = async (e: React.DragEvent, newStage: string) => {
    e.preventDefault()
    setDragOverStage(null)
    const dealId = parseInt(e.dataTransfer.getData('deal_id'))
    if (!dealId) return
    await moveDeal(dealId, newStage)
  }

  // Действия
  const moveDeal = async (dealId: number, newStage: string) => {
    try {
      await apiPost(`/${dealId}/move`, { new_stage: newStage })
      fetchDeals()
      if (selectedDeal?.id === dealId) {
        const updated = await apiGet<Deal>(`/${dealId}`)
        setSelectedDeal(updated)
      }
    } catch (err) {
      console.error(err)
    }
  }

  const markLost = async (dealId: number, reason: string) => {
    try {
      await apiPost(`/${dealId}/lost`, { reason })
      fetchDeals()
      setSelectedDeal(null)
    } catch (err) {
      console.error(err)
    }
  }

  const deleteDeal = async (dealId: number) => {
    try {
      await apiDelete(`/${dealId}`)
      fetchDeals()
      setSelectedDeal(null)
    } catch (err) {
      console.error(err)
    }
  }

  const handleCreate = () => {
    setShowCreateModal(false)
    fetchDeals()
  }

  const handleUpdate = (updated: Deal) => {
    setSelectedDeal(updated)
    fetchDeals()
  }

  // Итоговая статистика
  const totalDeals = deals.length
  const activeDeals = deals.filter(d => !d.is_lost && d.stage !== 'profit').length
  const totalProfit = deals.filter(d => !d.is_lost).reduce((s, d) => s + d.profit, 0)
  const advanceCount = deals.filter(d => !d.is_lost && d.advance_amount > 0).length

  // Вычисление задач на сегодня и просроченных
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const tasks = deals
    .filter(d => !d.is_lost && d.stage !== 'profit' && d.next_action && d.next_action_date)
    .map(d => {
      const taskDate = new Date(d.next_action_date!)
      taskDate.setHours(0, 0, 0, 0)
      const isOverdue = taskDate < today
      const isToday = taskDate.getTime() === today.getTime()
      return { ...d, isOverdue, isToday, taskDate: new Date(d.next_action_date!) }
    })
    .filter(d => d.isOverdue || d.isToday)
    .sort((a, b) => a.taskDate.getTime() - b.taskDate.getTime())

  const overdueCount = tasks.filter(t => t.isOverdue).length

  return (
    <div className="space-y-5">
      {/* Шапка */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
          🔄 Конвейер сделок
        </h1>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              className="input input-sm pl-9 w-48"
              placeholder="Поиск..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <button onClick={() => { setCreateStage('lead'); setShowCreateModal(true) }} className="btn-primary flex items-center gap-2 text-sm px-4 py-2">
            <Plus className="w-5 h-5" />
            <span className="font-semibold">+ Сделка</span>
          </button>
        </div>
      </div>

      {/* Основные KPI и Задачи */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        
        {/* Левая часть: KPI */}
        <div className="xl:col-span-8 flex flex-col justify-center">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 h-full">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-center">
              <p className="text-sm text-slate-500 mb-1">Сделок</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalDeals}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-center">
              <p className="text-sm text-slate-500 mb-1">В работе</p>
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{activeDeals}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-center">
              <p className="text-sm text-slate-500 mb-1">Прибыль</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(totalProfit)}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-center">
              <p className="text-sm text-slate-500 mb-1">Авансы</p>
              <p className="text-2xl font-bold text-amber-500 dark:text-amber-400">{advanceCount}</p>
            </div>
          </div>
        </div>

        {/* Правая часть: Что сделать сегодня */}
        <div className="xl:col-span-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col max-h-36">
          <div className="bg-slate-50 dark:bg-slate-800/50 px-3 py-2 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-blue-500" />
              Сегодня нужно сделать
            </h3>
            {overdueCount > 0 && (
              <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                Просрочено: {overdueCount}
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1 content-start">
            {tasks.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Нет задач на сегодня</p>
            ) : (
              tasks.slice(0, 5).map(task => (
                <div 
                  key={task.id} 
                  onClick={() => setSelectedDeal(task)}
                  className="flex items-center justify-between p-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-700 rounded-lg cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-2 truncate">
                    <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", task.isOverdue ? "bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]" : "bg-blue-400")} />
                    <p className="text-xs truncate">
                      <span className="font-medium text-slate-700 dark:text-slate-300 mr-1">{task.contact_name || task.title.split(' ')[0]}</span>
                      <span className="text-slate-500 dark:text-slate-400">— {task.next_action}</span>
                    </p>
                  </div>
                  {task.isOverdue && <span className="text-[10px] text-red-500 font-medium whitespace-nowrap ml-2">Вчера</span>}
                </div>
              ))
            )}
            {tasks.length > 5 && (
              <div className="text-center pt-1 pb-0.5">
                <button className="text-[10px] text-blue-500 hover:text-blue-600 font-medium">
                  Показать все ({tasks.length})
                </button>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Мини-статистика по этапам */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
        {DEAL_STAGES.map(stage => {
          const st = stats.find(s => s.stage === stage.key)
          return (
            <div key={stage.key} className="bg-white dark:bg-slate-800 rounded-xl p-2.5 text-center border border-slate-200 dark:border-slate-700">
              <p className="text-lg">{stage.icon}</p>
              <p className="text-xs text-slate-500 truncate">{stage.label}</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white">{st?.count || 0}</p>
              {(st?.total_sale_amount || 0) > 0 && (
                <p className="text-[10px] text-emerald-600">{Math.round((st?.total_sale_amount || 0) / 1000)}K</p>
              )}
            </div>
          )
        })}
      </div>

      {/* Kanban-доска */}
      <div className="overflow-x-auto pb-4 -mx-4 px-4 lg:-mx-8 lg:px-8 relative min-h-[500px]">
        {deals.length === 0 && !searchQuery && (
          <div className="absolute inset-0 z-10 flex flex-col items-center pt-24 bg-transparent pointer-events-none">
             <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 text-center max-w-sm pointer-events-auto animate-in zoom-in-95">
               <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                 <MessageSquare className="w-8 h-8" />
               </div>
               <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Начните работу</h3>
               <p className="text-slate-500 text-sm mb-6">Ваш конвейер готов. Создайте первую сделку за 10 секунд и закройте больше чеков.</p>
               <button onClick={() => { setCreateStage('lead'); setShowCreateModal(true) }} className="btn-primary w-full shadow-lg shadow-indigo-200 dark:shadow-none">
                 Создать первую сделку
               </button>
             </div>
          </div>
        )}
        <div className="flex gap-3 min-w-max">
          {DEAL_STAGES.map(stage => {
            const stageDeals = dealsByStage[stage.key] || []
            const isDragOver = dragOverStage === stage.key

            return (
              <div
                key={stage.key}
                className={cn(
                  "w-56 flex-shrink-0 rounded-xl transition-all duration-200",
                  isDragOver
                    ? "bg-primary-50 dark:bg-primary-950/30 ring-2 ring-primary-400"
                    : "bg-slate-100/50 dark:bg-slate-800/30"
                )}
                onDragOver={e => handleDragOver(e, stage.key)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, stage.key)}
              >
                {/* Заголовок колонки */}
                <div className="px-3 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{stage.icon}</span>
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{stage.label}</span>
                    <span className="px-1.5 py-0.5 text-xs font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-md">
                      {stageDeals.length}
                    </span>
                  </div>
                  <button
                    onClick={() => { setCreateStage(stage.key); setShowCreateModal(true) }}
                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Добавить сделку"
                  >
                    <Plus className="w-4 h-4 text-slate-500" />
                  </button>
                </div>

                {/* Карточки */}
                <div className="px-2 pb-3 space-y-2 min-h-[120px]">
                  {stageDeals.map(deal => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      onClick={() => setSelectedDeal(deal)}
                      onDragStart={handleDragStart}
                    />
                  ))}

                  {stageDeals.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                      <p className="text-2xl mb-1">{stage.icon}</p>
                      <p className="text-xs">Пусто</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Модальные окна */}
      {showCreateModal && (
        <CreateDealModal
          initialStage={createStage}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreate}
        />
      )}

      {selectedDeal && (
        <DealDetailModal
          deal={selectedDeal}
          onClose={() => setSelectedDeal(null)}
          onUpdate={handleUpdate}
          onMove={moveDeal}
          onLost={markLost}
          onDelete={deleteDeal}
        />
      )}
    </div>
  )
}
