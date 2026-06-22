import { useState, useEffect } from 'react'
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api-client'
import { Plus, Trash2, Save, MessageSquare, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'

interface Template {
  id: number
  stage: string
  title: string
  content: string
  template_type: string
  is_active: boolean
}

const STAGES = [
  { key: 'lead', label: 'Лиды' },
  { key: 'contact', label: 'Установление контакта' },
  { key: 'meeting', label: 'Встречи и Замеры' },
  { key: 'advance', label: 'Авансы' },
  { key: 'master', label: 'Мастера' },
  { key: 'common', label: 'Общие / Возражения' }
]

export default function Templates() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  
  const [form, setForm] = useState<Partial<Template>>({
    title: '',
    content: '',
    stage: 'common',
    template_type: 'TEMPLATE'
  })

  useEffect(() => {
    fetchTemplates()
  }, [])

  const fetchTemplates = async () => {
    try {
       setLoading(true)
       const res = await apiGet<Template[]>('/templates/')
       setTemplates(res)
       if (res.length > 0 && !selectedId) {
         setSelectedId(res[0].id)
         setForm(res[0])
       }
    } catch (e) {
       console.error("Error fetching templates", e)
    } finally {
       setLoading(false)
    }
  }

  const handleSelect = (tmpl: Template) => {
    setSelectedId(tmpl.id)
    setForm(tmpl)
  }

  const handleNew = () => {
    setSelectedId(null)
    setForm({
      title: 'Новый шаблон',
      content: 'Здравствуйте, {name}...',
      stage: 'common',
      template_type: 'TEMPLATE'
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (selectedId) {
        const updated = await apiPut<Template>(`/templates/${selectedId}`, form)
        setTemplates(ts => ts.map(t => t.id === selectedId ? updated : t))
        toast.success('Изменения сохранены')
      } else {
        const created = await apiPost<Template>('/templates/', form)
        setTemplates([...templates, created])
        setSelectedId(created.id)
        toast.success('Новый шаблон создан')
      }
    } catch (e) {
      console.error("Save error", e)
      toast.error('Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if(!confirm("Удалить шаблон?")) return
    try {
      await apiDelete(`/templates/${id}`)
      setTemplates(ts => ts.filter(t => t.id !== id))
      if (selectedId === id) handleNew()
      toast.info('Шаблон удален')
    } catch(e) {
      console.error(e)
      toast.error('Ошибка удаления')
    }
  }

  const insertVar = (v: string) => {
    setForm(f => ({ ...f, content: (f.content || '') + `{${v}}` }))
  }

  return (
    <div className="space-y-4 h-[calc(100vh-8rem)] flex flex-col">
       <div className="flex items-center justify-between">
         <h1 className="text-2xl font-bold flex items-center gap-2">
           <MessageSquare className="w-6 h-6 text-indigo-500" /> WhatsApp и Скрипты
         </h1>
         <button onClick={handleNew} className="btn-primary flex items-center gap-2 text-sm px-4 py-2">
            <Plus className="w-5 h-5" />
            Добавить шаблон
         </button>
       </div>

       <div className="flex gap-6 flex-1 min-h-0 overflow-hidden">
         {/* Слева: Список сгруппированный */}
         <div className="w-1/3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-y-auto flex flex-col">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 sticky top-0 z-10">
              <h3 className="font-semibold text-slate-700 dark:text-slate-300">Каталог автоответов</h3>
            </div>
            
            <div className="p-3 space-y-4">
              {STAGES.map(stage => {
                const stageTemplates = templates.filter(t => t.stage === stage.key)
                if (stageTemplates.length === 0) return null
                return (
                  <div key={stage.key}>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-2 mb-2">{stage.label}</p>
                    <div className="space-y-1">
                      {stageTemplates.map(tmpl => (
                         <div 
                           key={tmpl.id}
                           onClick={() => handleSelect(tmpl)}
                           className={cn(
                             "cursor-pointer p-2 rounded-lg transition-colors border",
                             selectedId === tmpl.id 
                               ? "bg-indigo-50 border-indigo-200 dark:bg-indigo-900/30 dark:border-indigo-700" 
                               : "bg-transparent border-transparent hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:border-slate-200 dark:hover:border-slate-600"
                           )}
                         >
                           <p className={cn("text-sm font-medium line-clamp-1", selectedId === tmpl.id ? "text-indigo-700 dark:text-indigo-300" : "text-slate-700 dark:text-slate-200")}>
                             {tmpl.template_type === 'SCRIPT' ? '📜 ' : '💬 '} {tmpl.title}
                           </p>
                         </div>
                      ))}
                    </div>
                  </div>
                )
              })}
              {templates.length === 0 && !loading && (
                 <p className="text-sm text-slate-500 text-center py-10">Нет сохраненных шаблонов</p>
              )}
            </div>
         </div>

         {/* Справа: Редактор */}
         <div className="w-2/3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
               <h3 className="font-semibold text-slate-700 dark:text-slate-300">Редактор сообщения</h3>
               {selectedId && (
                 <button onClick={() => handleDelete(selectedId)} className="text-red-500 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-md transition-colors text-sm flex items-center gap-1">
                   <Trash2 className="w-4 h-4" /> Удалить
                 </button>
               )}
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Название шаблона</label>
                <input className="input font-semibold" value={form.title || ''} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Этап воронки</label>
                  <select className="input" value={form.stage || 'common'} onChange={e => setForm(f => ({ ...f, stage: e.target.value }))}>
                    {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Тип заготовки</label>
                  <select className="input" value={form.template_type || 'TEMPLATE'} onChange={e => setForm(f => ({ ...f, template_type: e.target.value }))}>
                    <option value="TEMPLATE">Сообщение (WhatsApp / TG / SMS)</option>
                    <option value="SCRIPT">Скрипт переговорный (Для менеджера)</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-end mb-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Текст с переменными</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => insertVar('name')} className="text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-1 rounded flex items-center gap-1"><Tag className="w-3 h-3"/>Имя клиента</button>
                    <button type="button" onClick={() => insertVar('sale_amount')} className="text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-1 rounded flex items-center gap-1"><Tag className="w-3 h-3"/>Сумма</button>
                    <button type="button" onClick={() => insertVar('address')} className="text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-1 rounded flex items-center gap-1"><Tag className="w-3 h-3"/>Адрес</button>
                  </div>
                </div>
                <textarea 
                  className="input min-h-[300px] font-mono text-sm leading-relaxed whitespace-pre-wrap"
                  value={form.content || ''}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                />
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-700">
                <button 
                  onClick={handleSave} 
                  disabled={!form.title?.trim() || !form.content?.trim() || saving}
                  className="btn-primary flex items-center gap-2 px-6"
                >
                  <Save className="w-4 h-4" /> {saving ? 'Сохранение...' : 'Сохранить изменения'}
                </button>
              </div>
            </div>
         </div>
       </div>
    </div>
  )
}
