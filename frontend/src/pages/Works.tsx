import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { 
  Search, 
  Hammer, 
  Plus,
  MapPin,
  Building2,
  User,
  Calculator,
  Tag,
  TrendingUp,
  Percent,
  Edit3,
  Save,
  X,
  Database,
  RefreshCw
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'

// Категории работ
const categories = [
  { id: 'all', name: 'Все работы', icon: Hammer },
  { id: 'Демонтаж', name: 'Демонтаж', icon: Tag },
  { id: 'Штукатурные', name: 'Штукатурные', icon: Tag },
  { id: 'Малярные', name: 'Малярные', icon: Tag },
  { id: 'Плиточные', name: 'Плиточные', icon: Tag },
  { id: 'Напольные', name: 'Напольные', icon: Tag },
  { id: 'Электрика', name: 'Электрика', icon: Tag },
  { id: 'Сантехника', name: 'Сантехника', icon: Tag },
  { id: 'Потолки', name: 'Потолки', icon: Tag },
  { id: 'Прочие', name: 'Прочие', icon: Tag },
]

// Коэффициенты по городам
const cityPrices: Record<string, number> = {
  'Москва': 1.0,
  'Санкт-Петербург': 0.85,
  'Казань': 0.7,
  'Екатеринбург': 0.75,
  'Регионы': 0.6,
}

interface Work {
  id: number
  code: string
  name: string
  unit: string
  price: number  // Цена из БД (базовая цена мастера)
  category: string
  markup?: number // Локальная наценка (не сохраняется в БД)
}

export default function Works() {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedCity, setSelectedCity] = useState('Москва')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [defaultMarkup, setDefaultMarkup] = useState(50)
  const [localMarkups, setLocalMarkupsState] = useState<Record<number, number>>({})

  // Загрузка наценок из settings при старте
  useEffect(() => {
    const load = async () => {
      try {
        if (window.electronAPI?.settings?.get) {
          const saved = await window.electronAPI.settings.get('works_markups')
          if (saved) setLocalMarkupsState(JSON.parse(String(saved)))
          const savedDefault = await window.electronAPI.settings.get('works_default_markup')
          if (savedDefault) setDefaultMarkup(Number(savedDefault))
        }
      } catch (error) {
        console.error('Не удалось загрузить локальные наценки', error)
      }
    }
    load()
  }, [])

  // Сохранение наценок в settings при изменении
  const setLocalMarkups = (markups: Record<number, number>) => {
    setLocalMarkupsState(markups)
    if (window.electronAPI?.settings?.set) {
      window.electronAPI.settings.set('works_markups', JSON.stringify(markups))
    }
  }
  
  const [newWork, setNewWork] = useState<Partial<Work>>({
    code: '',
    name: '',
    unit: 'м2',
    price: 0,
    category: 'Прочие'
  })

  // Загрузка работ из БД через IPC
  const { data: worksData = [], isLoading, refetch } = useQuery({
    queryKey: ['catalog-works', search],
    queryFn: async () => {
      if (window.electronAPI?.catalog?.getWorks) {
        const works = await window.electronAPI.catalog.getWorks(search || '')
        return works.map((w: any, index: number) => {
          // Генерируем понятный код на основе категории
          const category = w.category || 'Прочие'
          const categoryPrefix = getCategoryPrefix(category)
          const shortCode = `${categoryPrefix}-${String(index + 1).padStart(3, '0')}`
          
          return {
            id: w.id,
            code: shortCode,
            name: w.name,
            unit: w.unit || 'шт',
            price: w.price || w.labor_price || 0,
            category: category
          }
        })
      }
      return []
    },
    staleTime: 30000
  })

  // Префиксы для категорий работ
  function getCategoryPrefix(category: string): string {
    const prefixes: Record<string, string> = {
      'Демонтаж': 'ДМ',
      'Штукатурные': 'ШТ',
      'Малярные': 'МЛ',
      'Плиточные': 'ПЛ',
      'Напольные': 'НП',
      'Электрика': 'ЭЛ',
      'Сантехника': 'СТ',
      'Потолки': 'ПТ',
      'Гипсокартон': 'ГК',
      'Черновые': 'ЧР',
      'Прочие': 'РБ'
    }
    return prefixes[category] || 'РБ'
  }

  // Получить наценку для работы (из локального хранилища или дефолтную)
  const getMarkup = (workId: number) => localMarkups[workId] ?? defaultMarkup

  const filteredWorks = worksData.filter((work: Work) => {
    if (selectedCategory === 'all') return true
    
    // Маппинг UI категорий к категориям в БД
    const categoryMapping: Record<string, string[]> = {
      'Демонтаж': ['демонтаж'],
      'Штукатурные': ['устройство стен', 'штукатур', 'стен'],
      'Малярные': ['маляр', 'покраск', 'обои'],
      'Плиточные': ['плитк', 'плиточ'],
      'Напольные': ['напольн', 'пол', 'ламинат', 'паркет', 'стяжка'],
      'Электрика': ['электр'],
      'Сантехника': ['сантех'],
      'Потолки': ['потолк', 'натяжн'],
      'Прочие': ['мебель', 'вспомогат', 'баня', 'фасад', 'кровл', 'фундамент', 'земля', 'мусор']
    }
    
    const keywords = categoryMapping[selectedCategory] || []
    const categoryLower = (work.category || '').toLowerCase()
    
    return keywords.some(keyword => categoryLower.includes(keyword))
  })

  const getCityPrice = (basePrice: number) => {
    const multiplier = cityPrices[selectedCity] || 1
    return Math.round(basePrice * multiplier)
  }

  const getClientPrice = (masterPrice: number, markup: number) => {
    return Math.round(masterPrice * (1 + markup / 100))
  }

  const getMargin = (masterPrice: number, markup: number) => {
    return getClientPrice(masterPrice, markup) - masterPrice
  }

  const updateMarkup = (id: number, markup: number) => {
    setLocalMarkups({ ...localMarkups, [id]: markup })
  }

  const addWork = async () => {
    if (!newWork.name || !newWork.code) {
      toast.error('Заполните код и название работы')
      return
    }

    try {
      if (window.electronAPI?.catalog?.createWork) {
        await window.electronAPI.catalog.createWork({
          name: newWork.name,
          code: newWork.code,
          unit: newWork.unit || 'м2',
          price: newWork.price || 0,
          category: newWork.category || 'Прочие'
        })
        toast.success('Работа добавлена в каталог')
        refetch()
      } else {
        toast.error('API недоступен')
      }
    } catch (e: any) {
      toast.error('Ошибка: ' + (e.message || 'не удалось добавить'))
    }
    setShowAddModal(false)
    setNewWork({ code: '', name: '', unit: 'м2', price: 0, category: 'Прочие' })
  }

  const applyMarkupToAll = () => {
    const newMarkups: Record<number, number> = {}
    filteredWorks.forEach((w: Work) => { newMarkups[w.id] = defaultMarkup })
    setLocalMarkups({ ...localMarkups, ...newMarkups })
    toast.success('Наценка ' + defaultMarkup + '% применена ко всем работам')
  }

  const totalWorks = filteredWorks.length
  const avgMarkup = totalWorks > 0 
    ? Math.round(filteredWorks.reduce((sum: number, w: Work) => sum + getMarkup(w.id), 0) / totalWorks) 
    : defaultMarkup

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Hammer className="w-7 h-7 text-primary-600" />
            Справочник работ
            <span className="text-sm font-normal text-slate-500 flex items-center gap-1">
              <Database className="w-4 h-4" /> {worksData.length} позиций в БД
            </span>
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Себестоимость и расценки для клиентов
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="btn-secondary flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Обновить
          </button>
          <button onClick={() => setShowAddModal(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Добавить работу
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Hammer className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Всего работ</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{totalWorks}</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Средняя наценка</p>
              <p className="text-xl font-bold text-green-600">{avgMarkup}%</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Город</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{selectedCity}</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <Percent className="w-5 h-5 text-slate-400" />
            <input
              type="number"
              value={defaultMarkup}
              onChange={(e) => setDefaultMarkup(Number(e.target.value))}
              className="w-16 px-2 py-1 border rounded text-center"
              min="0"
              max="200"
            />
            <span className="text-sm text-slate-500">%</span>
            <button onClick={applyMarkupToAll} className="btn-secondary text-xs px-2 py-1">
              Ко всем
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Поиск по названию или коду..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          />
        </div>
        <select
          value={selectedCity}
          onChange={(e) => setSelectedCity(e.target.value)}
          className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
        >
          {Object.keys(cityPrices).map(city => (
            <option key={city} value={city}>{city}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={'flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap transition-all ' + (
              selectedCategory === cat.id
                ? 'bg-primary-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
            )}
          >
            <cat.icon className="w-4 h-4" />
            {cat.name}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Код</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Наименование</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">Ед.</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">
                  <span className="flex items-center justify-end gap-1"><User className="w-4 h-4" /> Мастер</span>
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">Наценка</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">
                  <span className="flex items-center justify-end gap-1"><Building2 className="w-4 h-4" /> Клиенту</span>
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">
                  <span className="flex items-center justify-end gap-1"><TrendingUp className="w-4 h-4" /> Маржа</span>
                </th>
                <th className="px-2 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <RefreshCw className="w-6 h-6 mx-auto animate-spin text-primary-600 mb-2" />
                    <span className="text-slate-500">Загрузка справочника...</span>
                  </td>
                </tr>
              ) : filteredWorks.map((work: Work) => {
                const markup = getMarkup(work.id)
                const masterPrice = getCityPrice(work.price)
                const clientPrice = getClientPrice(masterPrice, markup)
                const margin = getMargin(masterPrice, markup)
                const isEditing = editingId === work.id
                
                return (
                  <tr key={work.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 text-sm font-mono text-slate-500">{work.code}</td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{work.name}</td>
                    <td className="px-4 py-3 text-center text-sm text-slate-500">{work.unit}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-semibold text-blue-600">{formatCurrency(masterPrice)}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isEditing ? (
                        <input type="number" value={markup} onChange={(e) => updateMarkup(work.id, Number(e.target.value))} className="w-16 px-2 py-1 text-center border rounded" min="0" max="200" />
                      ) : (
                        <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-sm">{markup}%</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">{formatCurrency(clientPrice)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-600">+{formatCurrency(margin)}</td>
                    <td className="px-2 py-3">
                      <button onClick={() => setEditingId(isEditing ? null : work.id)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded">
                        {isEditing ? <Save className="w-4 h-4 text-green-600" /> : <Edit3 className="w-4 h-4 text-slate-400" />}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filteredWorks.length === 0 && (
          <div className="p-12 text-center">
            <Hammer className="w-12 h-12 mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500">Работы не найдены</p>
          </div>
        )}
      </div>

      <div className="card p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-100 dark:border-green-800">
        <div className="flex items-center gap-3">
          <Calculator className="w-5 h-5 text-green-600" />
          <div>
            <p className="font-medium text-green-900 dark:text-green-100">
              Мастер — себестоимость работ | Клиенту — цена с наценкой | Маржа — прибыль фирмы
            </p>
            <p className="text-sm text-green-700 dark:text-green-300">
              Город: {selectedCity} (коэф. {cityPrices[selectedCity] || 1})
            </p>
          </div>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Добавить работу</h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 hover:bg-slate-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-slate-500">Код работы</label>
                <input type="text" value={newWork.code} onChange={(e) => setNewWork({ ...newWork, code: e.target.value })} className="input" placeholder="ШТ-001" />
              </div>
              <div>
                <label className="text-sm text-slate-500">Наименование</label>
                <input type="text" value={newWork.name} onChange={(e) => setNewWork({ ...newWork, name: e.target.value })} className="input" placeholder="Штукатурка стен по маякам" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-slate-500">Ед. измерения</label>
                  <select value={newWork.unit} onChange={(e) => setNewWork({ ...newWork, unit: e.target.value })} className="input">
                    <option value="м2">м2</option>
                    <option value="м.п.">м.п.</option>
                    <option value="шт">шт</option>
                    <option value="компл">компл</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-slate-500">Категория</label>
                  <select value={newWork.category} onChange={(e) => setNewWork({ ...newWork, category: e.target.value })} className="input">
                    {categories.filter(c => c.id !== 'all').map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm text-slate-500">Цена</label>
                <input type="number" value={newWork.price || 0} onChange={(e) => setNewWork({ ...newWork, price: Number(e.target.value) })} className="input" min="0" />
              </div>
              <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                ⚠️ Для массового добавления работ используйте импорт каталога из Access
              </p>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setShowAddModal(false)} className="btn-secondary flex-1">Отмена</button>
              <button onClick={addWork} className="btn-primary flex-1">Добавить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
