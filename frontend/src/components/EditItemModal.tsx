import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Save, FolderOpen } from 'lucide-react'
import { updateEstimateItem, removeEstimateItem, type EstimateItem } from '@/lib/estimateItems'
import { estimateItemsQueryKey, estimateQueryKey, estimateSectionsQueryKey } from '@/lib/estimateQueryKeys'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'

interface Props {
    estimateId: number
    item: EstimateItem
    onClose: () => void
}

export default function EditItemModal({ estimateId, item, onClose }: Props) {
    const queryClient = useQueryClient()

    const [formData, setFormData] = useState({
        name: item.name,
        unit: item.unit,
        quantity: item.quantity,
        material_price: item.material_price,
        labor_price: item.labor_price,
        justification: item.justification || '',
        section_id: item.section_id || null as number | null,
    })

    // Загрузка разделов
    const { data: sections = [] } = useQuery({
        queryKey: estimateSectionsQueryKey(estimateId),
        queryFn: async () => {
            if (window.electronAPI?.estimateSections) {
                return await window.electronAPI.estimateSections.getAll(estimateId)
            }
            return []
        },
        enabled: !!estimateId,
    })

    // Рассчитываем итоги
    const materialsTotal = formData.material_price * formData.quantity
    const laborTotal = formData.labor_price * formData.quantity
    const total = materialsTotal + laborTotal

    // Обновление позиции
    const updateMutation = useMutation({
        mutationFn: async () => {
            return await updateEstimateItem(estimateId, item.id, formData)
        },
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: estimateItemsQueryKey(estimateId) }),
                queryClient.invalidateQueries({ queryKey: estimateQueryKey(estimateId) }),
            ])
            toast.success('Позиция обновлена')
            onClose()
        },
        onError: () => {
            toast.error('Ошибка при обновлении')
        },
    })

    // Удаление позиции
    const deleteMutation = useMutation({
        mutationFn: async () => {
            return await removeEstimateItem(estimateId, item.id)
        },
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: estimateItemsQueryKey(estimateId) }),
                queryClient.invalidateQueries({ queryKey: estimateQueryKey(estimateId) }),
            ])
            toast.success('Позиция удалена')
            onClose()
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : 'Ошибка при удалении')
        },
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        updateMutation.mutate()
    }

    const handleDelete = () => {
        if (window.confirm('Удалить эту позицию?')) {
            deleteMutation.mutate()
        }
    }

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="fixed inset-0 bg-black/50" onClick={onClose} />

            <div className="relative min-h-full flex items-center justify-center p-4">
                <div className="relative bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-lg">
                    {/* Заголовок */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                        <h2 className="text-lg font-semibold">Редактирование позиции</h2>
                        <button onClick={onClose} className="btn-ghost p-2">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Форма */}
                    <form onSubmit={handleSubmit} className="p-6 space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Наименование *</label>
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="input"
                            />
                        </div>

                        {/* Выбор раздела */}
                        {sections.length > 0 && (
                            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                <div className="flex items-center gap-2">
                                    <FolderOpen className="w-4 h-4 text-indigo-500" />
                                    <label className="text-sm font-medium">Раздел:</label>
                                    <select
                                        value={formData.section_id || ''}
                                        onChange={(e) => setFormData({ ...formData, section_id: e.target.value ? Number(e.target.value) : null })}
                                        className="input text-sm flex-1"
                                    >
                                        <option value="">— Без раздела —</option>
                                        {sections.map((section: any) => (
                                            <option key={section.id} value={section.id}>
                                                {section.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Ед. измерения</label>
                                <select
                                    value={formData.unit}
                                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                                    className="input"
                                >
                                    <option value="шт.">шт.</option>
                                    <option value="м">м</option>
                                    <option value="м2">м²</option>
                                    <option value="м3">м³</option>
                                    <option value="кг">кг</option>
                                    <option value="т">т</option>
                                    <option value="компл.">компл.</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Количество</label>
                                <input
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    value={formData.quantity}
                                    onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })}
                                    className="input"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Цена материалов, ₽</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={formData.material_price}
                                    onChange={(e) => setFormData({ ...formData, material_price: Number(e.target.value) })}
                                    className="input"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Цена работы, ₽</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={formData.labor_price}
                                    onChange={(e) => setFormData({ ...formData, labor_price: Number(e.target.value) })}
                                    className="input"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Обоснование (шифр)</label>
                            <input
                                type="text"
                                placeholder="Например: ФЕР-11-01-001"
                                value={formData.justification}
                                onChange={(e) => setFormData({ ...formData, justification: e.target.value })}
                                className="input"
                            />
                        </div>

                        {/* Итоги */}
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Материалы:</span>
                                <span className="font-medium">{formatCurrency(materialsTotal)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500">Работа:</span>
                                <span className="font-medium">{formatCurrency(laborTotal)}</span>
                            </div>
                            <div className="flex justify-between text-base font-semibold border-t border-slate-200 dark:border-slate-700 pt-2 mt-2">
                                <span>Итого:</span>
                                <span className="text-primary-600">{formatCurrency(total)}</span>
                            </div>
                        </div>

                        {/* Кнопки */}
                        <div className="flex justify-between gap-3 pt-4">
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={deleteMutation.isPending}
                                className="btn-secondary text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            >
                                Удалить
                            </button>
                            <div className="flex gap-3">
                                <button type="button" onClick={onClose} className="btn-secondary">
                                    Отмена
                                </button>
                                <button
                                    type="submit"
                                    disabled={updateMutation.isPending}
                                    className="btn-primary flex items-center gap-2"
                                >
                                    <Save className="w-4 h-4" />
                                    {updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}


