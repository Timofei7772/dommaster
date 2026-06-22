import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Search, Bot, Plus, FolderOpen, AlertCircle } from 'lucide-react'
import { aiApi } from '@/lib/api'
import { searchWorksApi } from '@/lib/referencesApi'
import { addEstimateItem } from '@/lib/estimateItems'
import { estimateItemsQueryKey, estimateQueryKey } from '@/lib/estimateQueryKeys'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'

interface Props {
  estimateId: number
  onClose: () => void
  defaultSectionId?: number | null
}

/** 
 * ПРОФЕССИОНАЛЬНАЯ форма добавления позиции сметы
 * - Умная валидация  
 * - Автоматический расчет
 * - Правильное разделение материал/труд
 * - Предпросмотр стоимости
 */
export default function AddItemModal({ estimateId, onClose, defaultSectionId = null }: Props) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'search' | 'manual' | 'ai'>('search')
  const [search, setSearch] = useState('')
  const [aiQuery, setAiQuery] = useState('')
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(defaultSectionId)

  // ===== СОСТОЯНИЕ ФОРМЫ =====
  const [formData, setFormData] = useState({
    name: '',
    unit: 'м²',
    quantity: 1,
    material_price: 0,
    labor_price: 0,
    justification: '',
    material_id: undefined,
  })

  // ===== ПРЕДПРОСМОТР РАСЧЕТА =====
  const [preview, setPreview] = useState({
    material_total: 0,
    labor_total: 0,
    position_subtotal: 0,
  })

  // ===== ВАЛИДАЦИЯ =====
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [warnings, setWarnings] = useState<string[]>([])

  // Единицы измерения
  const units = ['м²', 'м', 'м³', 'шт.', 'т', 'кг', 'день', 'час', 'компл.', 'п.м']

  // ===== АВТОМАТИЧЕСКИЙ РАСЧЕТ =====
  useEffect(() => {
    const { quantity, material_price, labor_price } = formData
    const qty = Number(quantity) || 0
    const matPrice = Number(material_price) || 0
    const labPrice = Number(labor_price) || 0

    const material_total = qty * matPrice
    const labor_total = qty * labPrice
    const position_subtotal = material_total + labor_total

    setPreview({
      material_total: Math.round(material_total * 100) / 100,
      labor_total: Math.round(labor_total * 100) / 100,
      position_subtotal: Math.round(position_subtotal * 100) / 100,
    })
  }, [formData])

  // ===== ВАЛИДАЦИЯ ФОРМЫ =====
  useEffect(() => {
    const newErrors: Record<string, string> = {}
    const newWarnings: string[] = []

    // ОБЯЗАТЕЛЬНЫЕ ПОЛЯ
    if (!formData.name || formData.name.trim().length < 3) {
      newErrors.name = 'Название должно быть минимум 3 символа'
    }

    // КОЛИЧЕСТВО
    const qty = Number(formData.quantity)
    if (qty <= 0) {
      newErrors.quantity = 'Количество должно быть больше 0'
    }
    if (qty > 10000) {
      newWarnings.push('⚠️ Очень большое количество - проверьте значение')
    }

    // ЦЕНЫ
    const matPrice = Number(formData.material_price)
    const labPrice = Number(formData.labor_price)

    if (matPrice < 0 || labPrice < 0) {
      newErrors.price = 'Цены не могут быть отрицательными'
    }

    // ПРЕДУПРЕЖДЕНИЯ
    if (matPrice === 0 && labPrice === 0) {
      newWarnings.push('⚠️ Позиция имеет нулевую стоимость')
    }
    if (matPrice > 100000) {
      newWarnings.push('⚠️ Очень высокая цена материалов - проверьте значение')
    }
    if (labPrice > 50000) {
      newWarnings.push('⚠️ Очень высокая цена работы - проверьте значение')
    }

    setErrors(newErrors)
    setWarnings(newWarnings)
  }, [formData])

  // Для поиска материалов
  const [materialSearch, setMaterialSearch] = useState('')
  const [materialResults, setMaterialResults] = useState<any[]>([])
  const [materialLoading, setMaterialLoading] = useState(false)

  // Автокомплит материалов
  const handleMaterialSearch = async (q: string) => {
    setMaterialSearch(q)
    if (q.length < 2) {
      setMaterialResults([])
      return
    }
    setMaterialLoading(true)
    try {
      const res = window.electronAPI?.catalog?.getMaterials ? await window.electronAPI.catalog.getMaterials(q, 10) : []
      setMaterialResults(res)
    } finally {
      setMaterialLoading(false)
    }
  }

  const handleSelectMaterial = (mat: any) => {
    setFormData(item => ({
      ...item,
      material_id: mat.id,
      name: item.name || mat.name,
      unit: mat.unit || 'шт.',
      material_price: mat.price || 0
    }))
    setMaterialSearch(mat.name)
    setMaterialResults([])
  }

  // Загрузка разделов
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

  // Поиск работ в справочнике
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['works-search', search],
    queryFn: () => searchWorksApi(search),
    enabled: search.length > 2,
  })

  // ИИ-рекомендации
  const aiSuggestionMutation = useMutation({
    mutationFn: () => aiApi.suggestWorks(aiQuery),
  })

  // Добавление позиции
  const addItemMutation = useMutation({
    mutationFn: async (item: any) => {
      return await addEstimateItem(estimateId, { ...item, section_id: selectedSectionId })
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: estimateItemsQueryKey(estimateId) }),
        queryClient.invalidateQueries({ queryKey: estimateQueryKey(estimateId) }),
      ])
      toast.success('✅ Позиция добавлена')
      onClose()
    },
    onError: (error) => {
      console.error('Add item error:', error)
      toast.error(
        error instanceof Error && error.message
          ? `❌ ${error.message}`
          : '❌ Ошибка при добавлении позиции'
      )
    },
  })

  // ОБРАБОТЧИК: Добавление из справочника
  const handleAddFromSearch = (work: any) => {
    addItemMutation.mutate({
      work_id: work.id,
      name: work.name,
      unit: work.unit,
      quantity: 1,
      material_price: work.material_price || 0,
      labor_price: work.labor_price || 0,
      justification: work.code,
    })
  }

  // ОБРАБОТЧИК: Добавление вручную
  const handleAddManual = (e: React.FormEvent) => {
    e.preventDefault()

    // Проверка на ошибки
    if (Object.keys(errors).length > 0) {
      toast.error('❌ Проверьте ошибки в форме')
      return
    }

    // Подтверждение при предупреждениях
    if (warnings.length > 0) {
      const confirmed = window.confirm(
        `⚠️ Есть предупреждения:\n\n${warnings.join('\n')}\n\nВсё равно добавить?`
      )
      if (!confirmed) return
    }

    addItemMutation.mutate(formData)
  }

  // ОБРАБОТЧИК: ИИ-поиск
  const handleAiSuggest = () => {
    if (aiQuery.trim()) {
      aiSuggestionMutation.mutate()
    }
  }

  const works = searchResults?.data?.items || []
  const aiSuggestions = aiSuggestionMutation.data?.data?.items || []
  const isFormValid = Object.keys(errors).length === 0

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      <div className="relative min-h-full flex items-center justify-center p-4">
        <div className="relative bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
          {/* ЗАГОЛОВОК */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold">➕ Добавить позицию в смету</h2>
            <button onClick={onClose} className="btn-ghost p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ТАБЫ */}
          <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
            <button
              onClick={() => setActiveTab('search')}
              className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'search'
                  ? 'border-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Search className="w-4 h-4" />
              <span>Из справочника</span>
            </button>
            <button
              onClick={() => setActiveTab('ai')}
              className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'ai'
                  ? 'border-purple-600 text-purple-600 bg-purple-50 dark:bg-purple-900/20'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Bot className="w-4 h-4" />
              <span>ИИ-помощник</span>
            </button>
            <button
              onClick={() => setActiveTab('manual')}
              className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'manual'
                  ? 'border-green-600 text-green-600 bg-green-50 dark:bg-green-900/20'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>Вручную</span>
            </button>
          </div>

          {/* КОНТЕНТ */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* ВЫБОР РАЗДЕЛА */}
            {sections.length > 0 && (
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-blue-600" />
                  <label className="text-sm font-medium">Раздел сметы:</label>
                  <select
                    value={selectedSectionId || ''}
                    onChange={(e) => setSelectedSectionId(e.target.value ? Number(e.target.value) : null)}
                    className="input text-sm flex-1 bg-white dark:bg-slate-800"
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

            {/* ===== ТАБА 1: ПОИСК В СПРАВОЧНИКЕ ===== */}
            {activeTab === 'search' && (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Введите название работы, кода расценку (минимум 3 символа)..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="input pl-10 text-base"
                    autoFocus
                  />
                </div>

                {isSearching ? (
                  <div className="text-center py-8 text-slate-500">
                    <span className="inline-block animate-spin">⏳</span> Происк в справочнике...
                  </div>
                ) : works.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-600 font-medium">Найдено {works.length} вариантов:</p>
                    {works.map((work: any) => (
                      <div
                        key={work.id}
                        className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-md transition-all cursor-pointer"
                        onClick={() => handleAddFromSearch(work)}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-900 dark:text-white truncate">
                              {work.name}
                            </p>
                            <p className="text-sm text-slate-500 mt-1">
                              <code className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-xs">
                                {work.code}
                              </code>
                              {' '} · {work.unit}
                            </p>
                            <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
                              <div className="bg-green-50 dark:bg-green-900/20 p-2 rounded">
                                <span className="text-slate-600 dark:text-slate-400 text-xs">Материалы:</span>
                                <p className="font-semibold text-green-700 dark:text-green-400">
                                  {formatCurrency(work.material_price)}/ед
                                </p>
                              </div>
                              <div className="bg-orange-50 dark:bg-orange-900/20 p-2 rounded">
                                <span className="text-slate-600 dark:text-slate-400 text-xs">Работа:</span>
                                <p className="font-semibold text-orange-700 dark:text-orange-400">
                                  {formatCurrency(work.labor_price)}/ед
                                </p>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleAddFromSearch(work)}
                            disabled={addItemMutation.isPending}
                            className="btn-primary text-sm whitespace-nowrap flex-shrink-0"
                          >
                            {addItemMutation.isPending ? '⏳' : '✓'} Добавить
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : search.length >= 3 ? (
                  <div className="text-center py-12">
                    <p className="text-slate-500 text-lg">❌ Ничего не найдено</p>
                    <p className="text-sm text-slate-400 mt-2">Попробуйте другой поиск или добавьте позицию вручную</p>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-slate-500 text-lg">🔍 Введите минимум 3 символа для поиска</p>
                    <p className="text-sm text-slate-400 mt-2">Название работы, код расценки или МДС</p>
                  </div>
                )}
              </div>
            )}

            {/* ===== ТАБА 2: ИИ-РЕКОМЕНДАЦИИ ===== */}
            {activeTab === 'ai' && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Опишите нужную работу, пример: 'подготовка стен под покраску 50м²'"
                    value={aiQuery}
                    onChange={(e) => setAiQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAiSuggest()}
                    className="input flex-1"
                  />
                  <button
                    onClick={handleAiSuggest}
                    disabled={aiSuggestionMutation.isPending || !aiQuery.trim()}
                    className="btn-primary"
                  >
                    {aiSuggestionMutation.isPending ? '⏳' : '🔍'} Найти
                  </button>
                </div>

                {aiSuggestions.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-600 font-medium">💡 ИИ рекомендует:</p>
                    {aiSuggestions.map((suggestion: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-4 border border-purple-200 dark:border-purple-800 rounded-lg bg-purple-50 dark:bg-purple-900/20 hover:shadow-md transition-all"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <p className="font-medium text-slate-900 dark:text-white">
                              {suggestion.name}
                            </p>
                            <p className="text-sm text-slate-500 mt-1">
                              {suggestion.code} · {suggestion.unit}
                            </p>
                            {suggestion.reason && (
                              <p className="text-sm text-purple-700 dark:text-purple-300 mt-2 italic">
                                💭 {suggestion.reason}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => handleAddFromSearch(suggestion)}
                            disabled={addItemMutation.isPending}
                            className="btn-primary text-sm whitespace-nowrap flex-shrink-0"
                          >
                            Добавить
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            {/* ===== ТАБА 3: РУЧНОЕ ДОБАВЛЕНИЕ ===== */}
            {activeTab === 'manual' && (
              <form onSubmit={handleAddManual} className="space-y-4">
                {/* ПОИСК МАТЕРИАЛА */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    🔍 Материал (опционально)
                  </label>
                  <input
                    type="text"
                    value={materialSearch}
                    onChange={e => handleMaterialSearch(e.target.value)}
                    className="input"
                    placeholder="Поиск в справочнике материалов..."
                  />
                  {materialLoading && (
                    <div className="text-xs text-slate-400 mt-1">⏳ Поиск...</div>
                  )}
                  {materialResults.length > 0 && (
                    <div className="border rounded bg-white dark:bg-slate-800 shadow-lg max-h-40 overflow-y-auto mt-1 z-50">
                      {materialResults.map(mat => (
                        <div
                          key={mat.id}
                          className="px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-pointer text-sm border-b border-slate-200 dark:border-slate-700 last:border-0 transition-colors"
                          onClick={() => handleSelectMaterial(mat)}
                        >
                          <span className="font-medium">{mat.name}</span>{' '}
                          <span className="text-slate-400 text-xs">
                            ({mat.unit}, {formatCurrency(mat.price)})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* НАЗВАНИЕ РАБОТЫ - ОБЯЗАТЕЛЬНО */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    📝 Наименование работы <span className="text-red-500 font-bold">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={`input ${errors.name ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : ''}`}
                    placeholder="Например: Штукатурка стен по маякам"
                  />
                  {errors.name && (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {errors.name}
                    </p>
                  )}
                </div>

                {/* ЕДИНИЦА И КОЛИЧЕСТВО */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Единица</label>
                    <select
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      className="input"
                    >
                      {units.map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Кол-во <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })}
                      className={`input font-mono ${errors.quantity ? 'border-red-500' : ''}`}
                      placeholder="0.00"
                    />
                    {errors.quantity && (
                      <p className="text-xs text-red-500 mt-1">{errors.quantity}</p>
                    )}
                  </div>
                </div>

                {/* ЦЕНЫ - РАЗДЕЛЕНИЕ МАТЕРИАЛ/РАБОТА */}
                <div className="grid grid-cols-2 gap-4 p-4 bg-gradient-to-r from-green-50 to-orange-50 dark:from-green-900/20 dark:to-orange-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-green-700 dark:text-green-400">
                      💰 Цена материалов, ₽
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.material_price}
                      onChange={(e) => setFormData({ ...formData, material_price: Number(e.target.value) })}
                      className="input text-green-700 dark:text-green-400 font-semibold font-mono"
                      placeholder="0.00"
                    />
                    <p className="text-xs text-green-600 dark:text-green-500 mt-1 font-semibold">
                      Итого: {formatCurrency(preview.material_total)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-orange-700 dark:text-orange-400">
                      🔧 Цена работы, ₽
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.labor_price}
                      onChange={(e) => setFormData({ ...formData, labor_price: Number(e.target.value) })}
                      className="input text-orange-700 dark:text-orange-400 font-semibold font-mono"
                      placeholder="0.00"
                    />
                    <p className="text-xs text-orange-600 dark:text-orange-500 mt-1 font-semibold">
                      Итого: {formatCurrency(preview.labor_total)}
                    </p>
                  </div>
                </div>

                {/* ПРЕДПРОСМОТР ИТОГОВОЙ СТОИМОСТИ */}
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">✓ Стоимость позиции:</span>
                    <span className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                      {formatCurrency(preview.position_subtotal)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    ⓘ При сохранении будут применены коэффициенты сметы (1.04× к материалам, 1.8× к работам)
                  </p>
                </div>

                {/* ДОПОЛНИТЕЛЬНО: КОД/ШИФ */}
                <div>
                  <label className="block text-sm font-medium mb-1">📋 Обоснование (код работы)</label>
                  <input
                    type="text"
                    placeholder="ФЕР-11-01-001 или локальная расценка"
                    value={formData.justification}
                    onChange={(e) => setFormData({ ...formData, justification: e.target.value })}
                    className="input text-sm font-mono"
                  />
                </div>

                {/* ОШИБКИ */}
                {Object.keys(errors).length > 0 && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm font-medium text-red-700 dark:text-red-400 mb-2 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" /> Ошибки в форме:
                    </p>
                    {Object.entries(errors).map(([key, msg]) => (
                      <p key={key} className="text-xs text-red-600 dark:text-red-400 ml-6">
                        • {msg}
                      </p>
                    ))}
                  </div>
                )}

                {/* ПРЕДУПРЕЖДЕНИЯ */}
                {warnings.length > 0 && (
                  <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg space-y-1">
                    {warnings.map((warning, idx) => (
                      <p key={idx} className="text-xs text-yellow-700 dark:text-yellow-400">
                        {warning}
                      </p>
                    ))}
                  </div>
                )}

                {/* КНОПКИ ДЕЙСТВИЯ */}
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <button 
                    type="button" 
                    onClick={onClose} 
                    className="btn-secondary"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={!isFormValid || addItemMutation.isPending}
                    className={`btn-primary ${!isFormValid ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {addItemMutation.isPending ? (
                      <>⏳ Добавление...</>
                    ) : isFormValid ? (
                      <>✅ Добавить позицию</>
                    ) : (
                      <>❌ Исправьте ошибки</>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
