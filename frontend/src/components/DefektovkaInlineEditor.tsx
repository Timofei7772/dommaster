import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, ArrowRight } from 'lucide-react'
import { estimatesApi, api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import AddItemModal from '@/components/AddItemModal'

interface Props {
  estimateId: number
}

interface DefectConversionResult {
  success?: boolean
  error?: string
  data?: {
    id?: number
  }
}

interface ElectronEstimatesBridge {
  convertFromDefect?: (estimateId: number) => Promise<DefectConversionResult>
}

export default function DefektovkaInlineEditor({ estimateId }: Props) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [showAddItem, setShowAddItem] = useState(false)
  const estimatesBridge = window.electronAPI?.estimates as ElectronEstimatesBridge | undefined

  const { data: items } = useQuery({
    queryKey: ['estimate-items', estimateId],
    queryFn: () => estimatesApi.getItems(estimateId),
    enabled: !!estimateId,
  })

  const { data: sections = [] } = useQuery({
    queryKey: ['estimate-sections', estimateId],
    queryFn: async () => {
      if (window.electronAPI?.estimateSections) {
        return await window.electronAPI.estimateSections.getAll(estimateId)
      }
      return []
    },
    enabled: !!estimateId,
  })

  const itemsList = items?.data || []
  const sectionMap = new Map((sections || []).map((s: any) => [Number(s.id), s.name]))

  const handleDeleteItem = async (item: any) => {
    if (window.confirm(`Удалить позицию "${item.name}"?`)) {
      await api.estimateItems.delete(item.id)
      queryClient.invalidateQueries({ queryKey: ['estimate-items', estimateId] })
      queryClient.invalidateQueries({ queryKey: ['estimate', estimateId] })
      toast.success('Позиция удалена')
    }
  }

  const handleConvert = async () => {
    if (!estimatesBridge?.convertFromDefect) {
      toast.error('Функция доступна только в десктопной версии')
      return
    }
    if (!window.confirm('Превратить дефектовку в смету?')) return

    try {
      const result = await estimatesBridge.convertFromDefect(estimateId)
      if (!result?.success) {
        toast.error(result?.error || 'Ошибка конвертации')
        return
      }
      queryClient.invalidateQueries({ queryKey: ['estimates'] })
      toast.success('Смета создана')
      if (result?.data?.id) {
        navigate(`/estimates/${result.data.id}`)
      }
    } catch (error) {
      console.error(error)
      toast.error('Ошибка конвертации')
    }
  }

  return (
    <div className="p-4 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-200 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">Дефектовка</p>
          <p className="text-xs text-slate-500">Редактирование списка работ до сметы</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddItem(true)}
            className="btn-secondary text-sm flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Добавить работу
          </button>
          <button
            onClick={handleConvert}
            className="btn-primary text-sm flex items-center gap-2"
          >
            <ArrowRight className="w-4 h-4" />
            Превратить в смету
          </button>
        </div>
      </div>

      {itemsList.length === 0 ? (
        <div className="p-6 text-center text-slate-500 text-sm bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          В дефектовке пока нет работ. Добавьте первую позицию.
        </div>
      ) : (
        <div className="overflow-x-auto bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 dark:bg-slate-800/80">
              <tr>
                <th className="px-3 py-2 text-left w-10">№</th>
                <th className="px-3 py-2 text-left">Наименование</th>
                <th className="px-3 py-2 text-left w-24">Раздел</th>
                <th className="px-3 py-2 text-left w-16">Ед.</th>
                <th className="px-3 py-2 text-right w-20">Кол-во</th>
                <th className="px-3 py-2 text-right w-24">Мат.</th>
                <th className="px-3 py-2 text-right w-24">Раб.</th>
                <th className="px-3 py-2 text-right w-28">Всего</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {itemsList.map((item: any, index: number) => {
                const qty = item.quantity || 0
                const matPrice = item.materials_cost ?? item.material_price ?? 0
                const laborPrice = item.labor_cost ?? item.labor_price ?? 0
                const itemMaterials = item.materials_total ?? matPrice * qty
                const itemLabor = item.labor_total ?? laborPrice * qty
                const itemTotal = item.total ?? itemMaterials + itemLabor
                const sectionName = item.section_id ? sectionMap.get(Number(item.section_id)) : ''
                return (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-3 py-2 text-slate-400">{index + 1}</td>
                    <td className="px-3 py-2">
                      <p className="font-medium">{item.name}</p>
                      {item.code && <p className="text-xs text-slate-400">{item.code}</p>}
                    </td>
                    <td className="px-3 py-2 text-slate-500 text-xs">
                      {sectionName || '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{item.unit || 'шт.'}</td>
                    <td className="px-3 py-2 text-right">{qty}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{formatCurrency(itemMaterials)}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{formatCurrency(itemLabor)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatCurrency(itemTotal)}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => handleDeleteItem(item)}
                        className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                        title="Удалить"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAddItem && (
        <AddItemModal
          estimateId={estimateId}
          onClose={() => setShowAddItem(false)}
        />
      )}
    </div>
  )
}
