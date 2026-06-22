import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useToast } from '@/hooks/useToast'
import { apiGet, apiPost } from '@/lib/api-client'
import { 
  FileText, Download, User, CheckSquare, Square, CheckCircle, ArrowLeft, Loader2, FileSpreadsheet
} from 'lucide-react'
import { staggerContainer, fadeInUp } from '@/lib/motion'
import { format } from 'date-fns'

interface Worker {
  id: number
  full_name: string
}

interface EstimateItem {
  id: number
  estimate_id: number
  item_number?: string
  name: string
  unit?: string
  quantity: number
  materials_price: number
  labor_price: number
  total: number
  row_type: string
  is_work: boolean
  executor_id?: number
  executor_name?: string
  done_at?: string
}

interface Estimate {
  id: number
  number?: string
  name: string
  total_with_vat: number
  project_id?: number
}

export default function EstimateCRM() {
  const { id } = useParams<{ id: string }>()
  
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [items, setItems] = useState<EstimateItem[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)
  const [exportingExcel, setExportingExcel] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)

  const toast = useToast()

  useEffect(() => {
    if (id) {
      fetchData()
    }
  }, [id])

  const fetchData = async () => {
    setLoading(true)
    try {
      // Загружаем смету
      const estData = await apiGet<Estimate>(`/estimates/${id}`)
      setEstimate(estData)

      // Загружаем строки с CRM исполнителями
      const itemsData = await apiGet<EstimateItem[]>(`/crm-estimates/${id}/items`)
      setItems(itemsData)

      // Загружаем мастеров из проекта
      if (estData.project_id) {
        const workersData = await apiGet<Worker[]>(`/crm-projects/${estData.project_id}/workers`)
        setWorkers(workersData)
      }
    } catch (err: any) {
      toast.error('Ошибка загрузки сметы: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAssignExecutor = async (itemId: number, executorId: number | null) => {
    try {
      await apiPost(`/crm-estimates/items/${itemId}/assign`, {
        executor_id: executorId
      })
      toast.success('Исполнитель назначен')
      
      // Локально обновляем список
      setItems(items.map(item => {
        if (item.id === itemId) {
          const w = workers.find(x => x.id === executorId)
          return { ...item, executor_id: executorId || undefined, executor_name: w ? w.full_name : undefined }
        }
        return item
      }))
    } catch (err: any) {
      toast.error('Не удалось назначить исполнителя: ' + err.message)
    }
  }

  const handleToggleCompleted = async (itemId: number, currentlyCompleted: boolean) => {
    try {
      const targetState = !currentlyCompleted
      const updatedItem = await apiPost<any>(`/crm-estimates/items/${itemId}/complete`, {
        is_completed: targetState
      })
      toast.success(targetState ? 'Работа отмечена как выполненная' : 'Отметка о выполнении снята')
      
      setItems(items.map(item => {
        if (item.id === itemId) {
          return { ...item, done_at: updatedItem.done_at }
        }
        return item
      }))
    } catch (err: any) {
      toast.error('Не удалось изменить статус выполнения: ' + err.message)
    }
  }

  const handleExportExcel = async () => {
    setExportingExcel(true)
    try {
      window.open(`http://localhost:8000/api/crm-estimates/${id}/export/excel`, '_blank')
      toast.success('Экспорт в Excel запущен')
    } catch (err: any) {
      toast.error('Ошибка экспорта: ' + err.message)
    } finally {
      setExportingExcel(false)
    }
  }

  const handleExportPdf = async () => {
    setExportingPdf(true)
    try {
      window.open(`http://localhost:8000/api/crm-estimates/${id}/export/pdf`, '_blank')
      toast.success('Печатная форма PDF сгенерирована')
    } catch (err: any) {
      toast.error('Ошибка генерации PDF: ' + err.message)
    } finally {
      setExportingPdf(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center py-20 text-slate-500 gap-2">
        <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
        Загрузка сметной спецификации...
      </div>
    )
  }

  if (!estimate) {
    return (
      <div className="p-8 text-center text-slate-500">
        Смета не найдена.
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
      {/* Header with actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link 
            to="/estimates"
            className="p-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-500" />
          </Link>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Смета с отметкой исполнителя</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Смета №{estimate.number || estimate.id} • {estimate.name}</p>
          </div>
        </div>

        {/* Branded exports */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={handleExportExcel}
            disabled={exportingExcel}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold rounded-xl transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            Экспорт в Excel
          </button>
          <button
            onClick={handleExportPdf}
            disabled={exportingPdf}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
          >
            <FileText className="w-4 h-4" />
            Печать (PDF)
          </button>
        </div>
      </div>

      {/* Itemised estimate table */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-100 dark:border-slate-700">
                <th className="px-6 py-4 w-12 text-center">Вып.</th>
                <th className="px-6 py-4 w-16">№</th>
                <th className="px-6 py-4">Описание работы / материала</th>
                <th className="px-6 py-4">Ед. изм.</th>
                <th className="px-6 py-4 text-right">Кол-во</th>
                <th className="px-6 py-4 text-right">Цена (₽)</th>
                <th className="px-6 py-4 text-right">Итого (₽)</th>
                <th className="px-6 py-4 w-52">Ответственный исполнитель</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {items.map((item, idx) => {
                const isComment = item.row_type === 'comment' || item.row_type === 'spr'
                const isCompleted = !!item.done_at
                const unitPrice = item.labor_price + item.materials_price

                if (isComment) {
                  return (
                    <tr key={item.id} className="bg-slate-50/20 dark:bg-slate-800/20">
                      <td colSpan={2} />
                      <td colSpan={6} className="px-6 py-3 text-slate-400 italic font-medium">{item.name}</td>
                    </tr>
                  )
                }

                return (
                  <tr key={item.id} className={`hover:bg-slate-50/30 dark:hover:bg-slate-800/20 transition-colors ${isCompleted ? 'bg-emerald-50/10 dark:bg-emerald-950/5' : ''}`}>
                    {/* 1. Completeness box */}
                    <td className="px-6 py-4 text-center">
                      {item.is_work ? (
                        <button 
                          onClick={() => handleToggleCompleted(item.id, isCompleted)}
                          className={`p-1.5 rounded-lg transition-colors ${isCompleted ? 'text-emerald-500 hover:bg-emerald-100' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                          title={isCompleted ? `Выполнено ${format(new Date(item.done_at!), 'dd.MM.yyyy')}` : 'Отметить выполнение'}
                        >
                          {isCompleted ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                        </button>
                      ) : (
                        <span className="text-slate-300 text-xs italic">—</span>
                      )}
                    </td>

                    {/* 2. Number */}
                    <td className="px-6 py-4 text-xs font-semibold text-slate-400">{item.item_number || idx + 1}</td>

                    {/* 3. Description */}
                    <td className="px-6 py-4 font-medium">
                      {item.name}
                      {isCompleted && item.done_at && (
                        <span className="block text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                          ✓ Выполнено: {format(new Date(item.done_at), 'dd.MM.yyyy')}
                        </span>
                      )}
                    </td>

                    {/* 4. Unit */}
                    <td className="px-6 py-4 text-slate-500 text-xs">{item.unit || 'шт'}</td>

                    {/* 5. Qty */}
                    <td className="px-6 py-4 text-right font-medium">{item.quantity.toFixed(2)}</td>

                    {/* 6. Price */}
                    <td className="px-6 py-4 text-right">{unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>

                    {/* 7. Total */}
                    <td className="px-6 py-4 text-right font-bold text-slate-900 dark:text-white">{item.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>

                    {/* 8. Executor Selector */}
                    <td className="px-6 py-4">
                      {item.is_work ? (
                        <select
                          value={item.executor_id || ''}
                          onChange={(e) => handleAssignExecutor(item.id, e.target.value ? Number(e.target.value) : null)}
                          className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:border-violet-500"
                        >
                          <option value="">Назначить мастера</option>
                          {workers.map(w => (
                            <option key={w.id} value={w.id}>{w.full_name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-400 text-xs italic">Материал</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Sum totals */}
        <div className="bg-slate-50 dark:bg-slate-800/80 px-6 py-5 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center text-sm">
          <span className="font-semibold text-slate-500">ИТОГО СТОИМОСТЬ СМЕТЫ (С НДС):</span>
          <span className="text-xl font-black text-violet-600 dark:text-violet-400">{estimate.total_with_vat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽</span>
        </div>
      </div>
    </motion.div>
  )
}
