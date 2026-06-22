import { useState } from 'react'
import {
  BookOpen,
  Search,
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  Ruler,
  Tag,
  Percent,
  Building2,
  DollarSign,
  ChevronDown,
  ChevronRight,
  Settings,
  CheckCircle
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

// Типы справочников
type ReferenceType = 'units' | 'categories' | 'vat' | 'regions' | 'coefficients'

interface Unit {
  id: number
  code: string
  name: string
  fullName: string
}

interface Category {
  id: number
  code: string
  name: string
  parentId?: number
  color: string
}

interface VatRate {
  id: number
  name: string
  rate: number
  isDefault: boolean
}

interface Region {
  id: number
  name: string
  coefficient: number
}

interface Coefficient {
  id: number
  name: string
  code: string
  value: number
  description: string
}

// Демо-данные удалены — справочники загружаются из БД через Electron IPC

const referenceTypes: { id: ReferenceType; name: string; icon: typeof BookOpen }[] = [
  { id: 'units', name: 'Единицы измерения', icon: Ruler },
  { id: 'categories', name: 'Категории работ', icon: Tag },
  { id: 'vat', name: 'Ставки НДС', icon: Percent },
  { id: 'regions', name: 'Регионы', icon: Building2 },
  { id: 'coefficients', name: 'Коэффициенты', icon: DollarSign },
]

// Загрузка глобальной API
// const { catalog } = window.electronAPI || {}

export default function References() {
  const [activeType, setActiveType] = useState<ReferenceType | 'works'>('works') // Default to works
  const [search, setSearch] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  // Запрос к API
  const { data: works = [], isLoading } = useQuery({
    queryKey: ['catalog', search],
    queryFn: () => window.electronAPI.catalog.getWorks(search),
    enabled: activeType === 'works'
  })

  const queryClient = useQueryClient()

  // Регионы (persistent)
  const { data: regions = [] } = useQuery<Region[]>({
    queryKey: ['regions'],
    queryFn: async () => {
      const res = await window.electronAPI.catalog.getRegions();
      // Ensure coefficient is number for UI
      return res.map(r => ({ ...r, coefficient: r.coefficient ?? 1.0 }));
    },
    enabled: activeType === 'regions',
    initialData: []
  })

  // Мутации для регионов
  const createRegionMutation = useMutation({
    mutationFn: (data: any) => window.electronAPI.catalog.createRegion(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regions'] })
      setIsAdding(false)
      toast.success('Регион сохранен')
    },
    onError: () => toast.error('Ошибка сохранения')
  })

  const deleteRegionMutation = useMutation({
    mutationFn: (id: number) => window.electronAPI.catalog.deleteRegion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regions'] })
      toast.success('Регион удален')
    },
    onError: () => toast.error('Ошибка удаления')
  })

  // Загрузка из БД через Electron IPC
  const { data: units = [] } = useQuery<Unit[]>({
    queryKey: ['reference-units'],
    queryFn: () => window.electronAPI?.catalog?.getUnits?.() || [],
    enabled: activeType === 'units',
  })

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['reference-categories'],
    queryFn: () => window.electronAPI?.catalog?.getCategories?.() || [],
    enabled: activeType === 'categories',
  })

  const { data: vatRates = [] } = useQuery<VatRate[]>({
    queryKey: ['reference-vat-rates'],
    queryFn: () => window.electronAPI?.catalog?.getVatRates?.() || [],
    enabled: activeType === 'vat',
  })

  const { data: coefficients = [] } = useQuery<Coefficient[]>({
    queryKey: ['reference-coefficients'],
    queryFn: () => window.electronAPI?.catalog?.getRefCoefficients?.() || [],
    enabled: activeType === 'coefficients',
  })

  const [expandedCategories, setExpandedCategories] = useState<number[]>([1, 5, 9])

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    try {
      if (activeType === 'units') {
        const newData = {
          code: formData.get('code') as string,
          name: formData.get('name') as string,
          fullName: formData.get('fullName') as string
        }
        let updated: Unit[]
        if (isAdding) {
          updated = [...units, { id: Date.now(), ...newData }]
        } else {
          updated = units.map(u => u.id === editingId ? { ...u, ...newData } : u)
        }
        await window.electronAPI?.catalog?.setUnits?.(updated)
        queryClient.invalidateQueries({ queryKey: ['reference-units'] })
      } else if (activeType === 'regions') {
        const newData = {
          name: formData.get('name') as string,
          coefficient: Number(formData.get('coefficient'))
        }
        if (isAdding) {
          createRegionMutation.mutate(newData)
        } else if (editingId) {
          toast.error('Редактирование регионов пока не реализовано в БД')
          setEditingId(null)
        }
      } else if (activeType === 'vat') {
        const newData = {
          name: formData.get('name') as string,
          rate: Number(formData.get('rate')),
          isDefault: false
        }
        let updated: VatRate[]
        if (isAdding) {
          updated = [...vatRates, { id: Date.now(), ...newData }]
        } else {
          updated = vatRates.map(v => v.id === editingId ? { ...v, ...newData } : v)
        }
        await window.electronAPI?.catalog?.setVatRates?.(updated)
        queryClient.invalidateQueries({ queryKey: ['reference-vat-rates'] })
      } else if (activeType === 'coefficients') {
        const newData = {
          code: formData.get('code') as string,
          name: formData.get('name') as string,
          value: Number(formData.get('value')),
          description: formData.get('description') as string
        }
        let updated: Coefficient[]
        if (isAdding) {
          updated = [...coefficients, { id: Date.now(), ...newData }]
        } else {
          updated = coefficients.map(c => c.id === editingId ? { ...c, ...newData } : c)
        }
        await window.electronAPI?.catalog?.setRefCoefficients?.(updated)
        queryClient.invalidateQueries({ queryKey: ['reference-coefficients'] })
      }

      setEditingId(null)
      setIsAdding(false)
      toast.success('Сохранено')
    } catch {
      toast.error('Ошибка сохранения')
    }
  }

  const handleDelete = async (type: string, id: number) => {
    if (!confirm('Удалить запись?')) return

    try {
      switch (type) {
        case 'units': {
          const updated = units.filter(u => u.id !== id)
          await window.electronAPI?.catalog?.setUnits?.(updated)
          queryClient.invalidateQueries({ queryKey: ['reference-units'] })
          break
        }
        case 'vat': {
          const updated = vatRates.filter(v => v.id !== id)
          await window.electronAPI?.catalog?.setVatRates?.(updated)
          queryClient.invalidateQueries({ queryKey: ['reference-vat-rates'] })
          break
        }
        case 'regions':
          deleteRegionMutation.mutate(id)
          break
        case 'coefficients': {
          const updated = coefficients.filter(c => c.id !== id)
          await window.electronAPI?.catalog?.setRefCoefficients?.(updated)
          queryClient.invalidateQueries({ queryKey: ['reference-coefficients'] })
          break
        }
      }
      toast.success('Удалено')
    } catch {
      toast.error('Ошибка удаления')
    }
  }

  const toggleCategory = (id: number) => {
    setExpandedCategories(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
  }

  const renderWorks = () => (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-slate-50 dark:bg-slate-800/50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Шифр</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Наименование</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">Ед.изм.</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Работа</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Материал</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">Категория</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {isLoading ? (
            <tr><td colSpan={6} className="text-center py-8 text-slate-500">Загрузка...</td></tr>
          ) : works.length === 0 ? (
            <tr><td colSpan={6} className="text-center py-8 text-slate-500">Ничего не найдено</td></tr>
          ) : (
            works.map((work: any) => (
              <tr key={work.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{work.code}</td>
                <td className="px-4 py-3 font-medium">{work.name}</td>
                <td className="px-4 py-3 text-center text-sm">{work.unit}</td>
                <td className="px-4 py-3 text-right font-mono">{work.labor_price?.toLocaleString('ru')} ₽</td>
                <td className="px-4 py-3 text-right font-mono text-slate-500">{work.material_price?.toLocaleString('ru')} ₽</td>
                <td className="px-4 py-3 text-center">
                  <span className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600">
                    {work.category}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )

  const renderUnits = () => {
    const filtered = units.filter(u =>
      !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.code.toLowerCase().includes(search.toLowerCase())
    )

    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 dark:bg-slate-800/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Код</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Название</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Полное название</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase w-24">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {filtered.map(unit => (
              <tr key={unit.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                <td className="px-4 py-3 font-mono font-semibold">{unit.code}</td>
                <td className="px-4 py-3">{unit.name}</td>
                <td className="px-4 py-3 text-slate-500">{unit.fullName}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-center gap-1">
                    <button onClick={() => setEditingId(unit.id)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded">
                      <Edit className="w-4 h-4 text-slate-500" />
                    </button>
                    <button onClick={() => handleDelete('units', unit.id)} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded">
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const renderCategories = () => {
    const parentCategories = categories.filter(c => !c.parentId)

    return (
      <div className="space-y-2">
        {parentCategories.map(parent => {
          const children = categories.filter(c => c.parentId === parent.id)
          const isExpanded = expandedCategories.includes(parent.id)

          return (
            <div key={parent.id} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
              <div
                className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => toggleCategory(parent.id)}
              >
                {children.length > 0 && (
                  isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />
                )}
                <div className="w-4 h-4 rounded" style={{ backgroundColor: parent.color }} />
                <span className="font-mono text-sm text-slate-500">{parent.code}</span>
                <span className="font-medium flex-1">{parent.name}</span>
                <div className="flex gap-1">
                  <button onClick={(e) => { e.stopPropagation(); setEditingId(parent.id) }} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded">
                    <Edit className="w-4 h-4 text-slate-500" />
                  </button>
                </div>
              </div>

              {isExpanded && children.length > 0 && (
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                  {children.map(child => (
                    <div key={child.id} className="flex items-center gap-3 px-4 py-2 pl-12 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: child.color }} />
                      <span className="font-mono text-sm text-slate-500">{child.code}</span>
                      <span className="flex-1">{child.name}</span>
                      <div className="flex gap-1">
                        <button onClick={() => setEditingId(child.id)} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded">
                          <Edit className="w-3.5 h-3.5 text-slate-500" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  const renderVatRates = () => (
    <div className="space-y-3">
      {vatRates.map(vat => (
        <div key={vat.id} className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
          <div className="w-16 h-16 rounded-xl bg-white dark:bg-slate-700 flex items-center justify-center">
            <span className="text-2xl font-bold">{vat.rate}%</span>
          </div>
          <div className="flex-1">
            <p className="font-semibold">{vat.name}</p>
            {vat.isDefault && (
              <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                По умолчанию
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                const updated = vatRates.map(v => ({ ...v, isDefault: v.id === vat.id }))
                await window.electronAPI?.catalog?.setVatRates?.(updated)
                queryClient.invalidateQueries({ queryKey: ['reference-vat-rates'] })
                toast.success('Установлено по умолчанию')
              }}
              className={`p-2 rounded-lg ${vat.isDefault ? 'bg-green-100 text-green-600' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}
            >
              <CheckCircle className="w-5 h-5" />
            </button>
            <button onClick={() => setEditingId(vat.id)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
              <Edit className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )

  const renderRegions = () => (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-slate-50 dark:bg-slate-800/50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Регион</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">Коэффициент</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">Пример (1000₽)</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase w-24">Действия</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {regions.map(region => (
            <tr key={region.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-slate-400" />
                  {region.name}
                </div>
              </td>
              <td className="px-4 py-3 text-center">
                <span className={`font-semibold ${region.coefficient >= 1 ? 'text-green-600' : 'text-blue-600'}`}>
                  ×{region.coefficient.toFixed(2)}
                </span>
              </td>
              <td className="px-4 py-3 text-center font-mono">
                {Math.round(1000 * region.coefficient).toLocaleString('ru')} ₽
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-center gap-1">
                  <button onClick={() => setEditingId(region.id)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded">
                    <Edit className="w-4 h-4 text-slate-500" />
                  </button>
                  <button onClick={() => handleDelete('regions', region.id)} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded">
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const renderCoefficients = () => (
    <div className="space-y-3">
      {coefficients.map(coef => (
        <div key={coef.id} className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
          <div className="w-20 h-16 rounded-xl bg-white dark:bg-slate-700 flex flex-col items-center justify-center">
            <span className="text-xs text-slate-400">{coef.code}</span>
            <span className="text-xl font-bold text-primary-600">{coef.value}</span>
          </div>
          <div className="flex-1">
            <p className="font-semibold">{coef.name}</p>
            <p className="text-sm text-slate-500">{coef.description}</p>
          </div>
          <div className="flex gap-1">
            <button onClick={() => setEditingId(coef.id)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
              <Edit className="w-5 h-5 text-slate-500" />
            </button>
            <button onClick={() => handleDelete('coefficients', coef.id)} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg">
              <Trash2 className="w-5 h-5 text-red-500" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )

  const renderContent = () => {
    switch (activeType) {
      case 'works': return renderWorks()
      case 'units': return renderUnits()
      case 'categories': return renderCategories()
      case 'vat': return renderVatRates()
      case 'regions': return renderRegions()
      case 'coefficients': return renderCoefficients()
      default: return null
    }
  }

  // Обновленный список типов с "Базой расценок"
  const allTypes = [
    { id: 'works', name: 'База расценок', icon: BookOpen },
    ...referenceTypes
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-7 h-7 text-primary-600" />
            Справочники
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            База расценок и нормативная информация
          </p>
        </div>
        {activeType !== 'works' && (
          <button
            onClick={() => setIsAdding(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Добавить запись
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {allTypes.map((type: any) => (
          <button
            key={type.id}
            onClick={() => setActiveType(type.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl whitespace-nowrap transition-all ${activeType === type.id
              ? 'bg-primary-600 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
              }`}
          >
            <type.icon className="w-4 h-4" />
            {type.name}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          placeholder={activeType === 'works' ? "Поиск расценок..." : "Поиск..."}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
        />
      </div>

      <div className="card p-0 overflow-hidden">
        {renderContent()}
      </div>
      {/* Информационный блок */}
      <div className="card p-4 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-800/30 border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <Settings className="w-5 h-5 text-slate-600" />
          <div>
            <p className="font-medium text-slate-900 dark:text-slate-100">
              Справочники влияют на расчёты
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Изменения применяются к новым сметам. Существующие сметы сохраняют свои значения.
            </p>
          </div>
        </div>
      </div>

      {/* Модалка редактирования / добавления */}
      {(editingId !== null || isAdding) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setEditingId(null); setIsAdding(false) }}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">
              {isAdding ? 'Добавление записи' : 'Редактирование'}
            </h2>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Поля для Единиц измерения */}
              {activeType === 'units' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Код (сокращение)</label>
                    <input
                      name="code"
                      defaultValue={editingId ? units.find(u => u.id === editingId)?.code : ''}
                      className="input w-full"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Название</label>
                    <input
                      name="name"
                      defaultValue={editingId ? units.find(u => u.id === editingId)?.name : ''}
                      className="input w-full"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Полное название</label>
                    <input
                      name="fullName"
                      defaultValue={editingId ? units.find(u => u.id === editingId)?.fullName : ''}
                      className="input w-full"
                    />
                  </div>
                </>
              )}

              {/* Поля для Регионов */}
              {activeType === 'regions' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Название региона / города</label>
                    <input
                      name="name"
                      defaultValue={editingId ? regions.find(r => r.id === editingId)?.name : ''}
                      className="input w-full"
                      placeholder="Например: Казань"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Коэффициент</label>
                    <input
                      name="coefficient"
                      type="number"
                      step="0.01"
                      defaultValue={editingId ? regions.find(r => r.id === editingId)?.coefficient : '1.0'}
                      className="input w-full"
                      required
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      1.0 = базовые цены. 1.2 = +20% к стоимости работ.
                    </p>
                  </div>
                </>
              )}

              {/* Поля для Коэффициентов */}
              {activeType === 'coefficients' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Код</label>
                    <input
                      name="code"
                      defaultValue={editingId ? coefficients.find(c => c.id === editingId)?.code : ''}
                      className="input w-full"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Название</label>
                    <input
                      name="name"
                      defaultValue={editingId ? coefficients.find(c => c.id === editingId)?.name : ''}
                      className="input w-full"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Значение</label>
                    <input
                      name="value"
                      type="number"
                      step="0.01"
                      defaultValue={editingId ? coefficients.find(c => c.id === editingId)?.value : ''}
                      className="input w-full"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Описание</label>
                    <textarea
                      name="description"
                      defaultValue={editingId ? coefficients.find(c => c.id === editingId)?.description : ''}
                      className="input w-full min-h-[80px]"
                    />
                  </div>
                </>
              )}
              {/* Поля для НДС */}
              {activeType === 'vat' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Название</label>
                    <input
                      name="name"
                      defaultValue={editingId ? vatRates.find(v => v.id === editingId)?.name : ''}
                      className="input w-full"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Ставка (%)</label>
                    <input
                      name="rate"
                      type="number"
                      defaultValue={editingId ? vatRates.find(v => v.id === editingId)?.rate : ''}
                      className="input w-full"
                      required
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => { setEditingId(null); setIsAdding(false) }}
                  className="btn-secondary flex items-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Отмена
                </button>
                <button type="submit" className="btn-primary flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
