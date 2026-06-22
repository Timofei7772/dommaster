import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Check, Loader2, Search, AlertCircle } from 'lucide-react'
import { estimatesApi, ks2Api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'

interface Props {
    estimateId: number
    onClose: () => void
    onSuccess: () => void
}

export default function CreateKS2Modal({ estimateId, onClose, onSuccess }: Props) {
    const queryClient = useQueryClient()
    const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set())
    const [quantities, setQuantities] = useState<Record<number, number>>({})
    const [search, setSearch] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isPercentMode, setIsPercentMode] = useState(false)
    const [percentValue, setPercentValue] = useState(100)

    // Получение позиций сметы
    const { data: itemsData, isLoading } = useQuery({
        queryKey: ['estimate-items', estimateId],
        queryFn: () => estimatesApi.getItems(estimateId)
    })

    // Получение информации о смете
    const { data: estimateData } = useQuery({
        queryKey: ['estimate', estimateId],
        queryFn: () => estimatesApi.get(estimateId)
    })

    // Выбрать все по умолчанию и устновить начальные количества
    useEffect(() => {
        if (itemsData?.data) {
            const ids = itemsData.data.map((i: any) => i.id)
            setSelectedItems(new Set(ids))

            const initialQuantities: Record<number, number> = {}
            itemsData.data.forEach((i: any) => {
                initialQuantities[i.id] = i.quantity
            })
            setQuantities(initialQuantities)
        }
    }, [itemsData])

    // Обновление количеств при изменении процента
    useEffect(() => {
        if (itemsData?.data) {
            const newQuantities: Record<number, number> = {}
            itemsData.data.forEach((i: any) => {
                newQuantities[i.id] = (i.quantity * percentValue) / 100
            })
            setQuantities(newQuantities)
        }
    }, [percentValue, itemsData, isPercentMode])

    const toggleItem = (id: number) => {
        const newSet = new Set(selectedItems)
        if (newSet.has(id)) {
            newSet.delete(id)
        } else {
            newSet.add(id)
        }
        setSelectedItems(newSet)
    }

    const toggleAll = () => {
        if (!itemsData?.data) return
        if (selectedItems.size === itemsData.data.length) {
            setSelectedItems(new Set())
        } else {
            const ids = itemsData.data.map((i: any) => i.id)
            setSelectedItems(new Set(ids))
        }
    }

    const handleQuantityChange = (id: number, value: number) => {
        setQuantities(prev => ({ ...prev, [id]: value }))
    }

    const handleCreate = async () => {
        if (!estimateData?.data) return
        setIsSubmitting(true)

        try {
            const estimate = estimateData.data

            // 1. Создаем Акт КС-2
            const date = new Date()
            const ks2Response = await ks2Api.create({
                project_id: estimate.project_id,
                estimate_id: estimate.id,
                project_name: estimate.project_name,
                estimate_number: estimate.number,
                number: `КС-2 от ${date.toLocaleDateString()}`,
                date: date.toISOString().split('T')[0],
                period_from: date.toISOString().split('T')[0],
                period_to: date.toISOString().split('T')[0],
                status: 'draft',
                amount: 0 // Will be recalculated
            })

            const ks2Id = ks2Response.data.id

            // 2. Добавляем выбранные позиции
            if (itemsData?.data) {
                const itemsToCreate = itemsData.data
                    .filter((i: any) => selectedItems.has(i.id))
                    .map((i: any) => ({
                        ks2_act_id: ks2Id,
                        estimate_item_id: i.id,
                        code: i.code,
                        name: i.name,
                        unit: i.unit,
                        unit_price: i.price,
                        quantity_estimate: i.quantity,
                        quantity_act: quantities[i.id] || 0, // Use edited quantity
                    }))

                // Последовательно создаем позиции (можно параллельно, но IPC надежнее последовательно)
                for (const item of itemsToCreate) {
                    await ks2Api.createItem(item)
                }
            }

            toast.success('КС-2 успешно создан')
            queryClient.invalidateQueries({ queryKey: ['ks2-acts'] })
            onSuccess()
            onClose()

        } catch (err) {
            console.error(err)
            toast.error('Ошибка при создании КС-2')
        } finally {
            setIsSubmitting(false)
        }
    }

    const items = itemsData?.data || []
    const filteredItems = items.filter((i: any) =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        (i.code && i.code.toLowerCase().includes(search.toLowerCase()))
    )

    const totalSelected = items
        .filter((i: any) => selectedItems.has(i.id))
        .reduce((sum: number, i: any) => sum + (i.price * (quantities[i.id] || 0)), 0)

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="fixed inset-0 bg-black/50" onClick={onClose} />

            <div className="relative min-h-full flex items-center justify-center p-4">
                <div className="relative bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-5xl flex flex-col max-h-[90vh]">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                        <div>
                            <h2 className="text-lg font-semibold">Создание КС-2 из сметы</h2>
                            <p className="text-sm text-slate-500">Выберите объем выполнения работ</p>
                        </div>
                        <button onClick={onClose} className="btn-ghost p-2">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex flex-col md:flex-row gap-4 items-center justify-between">
                        <div className="relative flex-1 w-full md:max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Поиск позиций..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 text-sm"
                            />
                        </div>

                        <div className="flex items-center gap-4 bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={isPercentMode}
                                    onChange={(e) => setIsPercentMode(e.target.checked)}
                                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                                />
                                <span>Процент выполнения</span>
                            </label>
                            {isPercentMode && (
                                <div className="flex items-center gap-2 border-l pl-4 ml-2 border-slate-200 dark:border-slate-700">
                                    <input
                                        type="number"
                                        min="0" max="100"
                                        value={percentValue}
                                        onChange={(e) => setPercentValue(Number(e.target.value))}
                                        className="w-16 p-1 border rounded text-right dark:bg-slate-800 dark:border-slate-700"
                                    />
                                    <span className="text-sm font-bold">%</span>
                                </div>
                            )}
                        </div>

                        <div className="text-right min-w-[150px]">
                            <p className="text-xs text-slate-500">Сумма акта:</p>
                            <p className="font-bold text-lg text-green-600">{formatCurrency(totalSelected)}</p>
                        </div>
                    </div>

                    {/* List */}
                    <div className="flex-1 overflow-auto p-0">
                        {isLoading ? (
                            <div className="flex justify-center py-20">
                                <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                            </div>
                        ) : (
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800 sticky top-0 z-10">
                                    <tr>
                                        <th className="p-4 w-10">
                                            <input
                                                type="checkbox"
                                                checked={items.length > 0 && selectedItems.size === items.length}
                                                onChange={toggleAll}
                                                className="rounded border-slate-300"
                                            />
                                        </th>
                                        <th className="p-4">Наименование</th>
                                        <th className="p-4 w-20">Ед.</th>
                                        <th className="p-4 text-right">Цена</th>
                                        <th className="p-4 text-right">Кол-во (Смета)</th>
                                        <th className="p-4 text-right w-32 bg-yellow-50/50 dark:bg-yellow-900/10">В акте</th>
                                        <th className="p-4 text-right">Сумма</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                    {filteredItems.map((item: any) => (
                                        <tr
                                            key={item.id}
                                            className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${selectedItems.has(item.id) ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''}`}
                                        >
                                            <td className="p-4">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedItems.has(item.id)}
                                                    onChange={() => toggleItem(item.id)}
                                                    className="rounded border-slate-300"
                                                />
                                            </td>
                                            <td className="p-4 cursor-pointer" onClick={() => toggleItem(item.id)}>
                                                <div className="font-medium text-slate-900 dark:text-slate-100">{item.name}</div>
                                                {item.code && <div className="text-xs text-slate-500">{item.code}</div>}
                                            </td>
                                            <td className="p-4 text-slate-500">{item.unit}</td>
                                            <td className="p-4 text-right font-mono">{formatCurrency(item.price)}</td>
                                            <td className="p-4 text-right font-mono text-slate-500">{item.quantity}</td>
                                            <td className="p-4 text-right bg-yellow-50/30 dark:bg-yellow-900/10">
                                                <input
                                                    type="number"
                                                    value={quantities[item.id] !== undefined ? quantities[item.id] : item.quantity}
                                                    onChange={(e) => handleQuantityChange(item.id, Number(e.target.value))}
                                                    disabled={!selectedItems.has(item.id) || isPercentMode}
                                                    className="w-24 p-1 border rounded text-right dark:bg-slate-800 dark:border-slate-700 disabled:opacity-50"
                                                />
                                            </td>
                                            <td className="p-4 text-right font-mono font-medium">
                                                {formatCurrency(item.price * (quantities[item.id] || 0))}
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredItems.length === 0 && (
                                        <tr>
                                            <td colSpan={7} className="p-8 text-center text-slate-500">
                                                Позиции не найдены
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3 bg-white dark:bg-slate-900 rounded-b-xl">
                        <div className="mr-auto text-sm text-slate-500 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" />
                            <span>Можно изменить количество для каждой позиции</span>
                        </div>
                        <button
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="px-4 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            Отмена
                        </button>
                        <button
                            onClick={handleCreate}
                            disabled={isSubmitting || selectedItems.size === 0}
                            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                        >
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            Создать КС-2
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
