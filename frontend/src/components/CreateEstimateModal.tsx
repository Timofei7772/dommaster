import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { estimatesApi, CreateEstimateDto } from '@/lib/api'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

interface Props {
  onClose: () => void
}

export default function CreateEstimateModal({ onClose }: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [formData, setFormData] = useState<CreateEstimateDto>({
    name: '',
    number: '',
    estimate_type: 'local',
    description: '',
    overhead_percent: 15,
    profit_percent: 10,
    vat_percent: 20,
  })

  const createMutation = useMutation({
    mutationFn: estimatesApi.create,
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] })
      toast.success('Смета создана')
      onClose()
      navigate(`/estimates/${response.data.id}`)
    },
    onError: () => {
      toast.error('Ошибка при создании сметы')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate(formData)
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      
      <div className="relative min-h-full flex items-center justify-center p-4">
        <div className="relative bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-lg">
          {/* Заголовок */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold">Новая смета</h2>
            <button onClick={onClose} className="btn-ghost p-2">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Форма */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Номер сметы *
              </label>
              <input
                type="text"
                required
                placeholder="Например: ЛС-0001"
                value={formData.number}
                onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Наименование *
              </label>
              <input
                type="text"
                required
                placeholder="Название объекта или работ"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Тип сметы
              </label>
              <select
                value={formData.estimate_type}
                onChange={(e) => setFormData({ ...formData, estimate_type: e.target.value as 'local' | 'object' | 'summary' | 'resource' | 'defect' })}
                className="input"
              >
                <option value="local">Локальная смета</option>
                <option value="object">Объектная смета</option>
                <option value="summary">Сводная смета</option>
                <option value="resource">Ресурсная смета</option>
                <option value="defect">Дефектовка</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Описание
              </label>
              <textarea
                rows={3}
                placeholder="Дополнительная информация"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="input"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Накладные, %
                </label>
                <input
                  type="number"
                  value={formData.overhead_percent}
                  onChange={(e) => setFormData({ ...formData, overhead_percent: Number(e.target.value) })}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Прибыль, %
                </label>
                <input
                  type="number"
                  value={formData.profit_percent}
                  onChange={(e) => setFormData({ ...formData, profit_percent: Number(e.target.value) })}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  НДС, %
                </label>
                <input
                  type="number"
                  value={formData.vat_percent}
                  onChange={(e) => setFormData({ ...formData, vat_percent: Number(e.target.value) })}
                  className="input"
                />
              </div>
            </div>

            {/* Кнопки */}
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={onClose} className="btn-secondary">
                Отмена
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="btn-primary"
              >
                {createMutation.isPending ? 'Создание...' : 'Создать смету'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
