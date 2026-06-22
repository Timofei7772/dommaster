import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Calculator,
  FileText,
  Search,
  Package,
  Hammer,
  Building2,
  User,
  TrendingUp,
  Copy
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import { estimatesApi } from '@/lib/api'
import { getWorks, getMaterials } from '@/lib/catalog'

interface EstimateItem {
  id: number
  type: 'work' | 'material'
  name: string
  unit: string
  quantity: number
  masterPrice: number
  markup: number
  clientPrice: number
  total: number
}

// Используем каталог с 70+ работами и 60+ материалами
const worksCatalog = getWorks().map(w => ({
  code: w.code,
  name: w.name,
  unit: w.unit,
  masterPrice: w.labor_price,
  markup: 50
}))

const materialsCatalog = getMaterials().map(m => ({
  code: m.code,
  name: m.name,
  unit: m.unit,
  masterPrice: m.price,
  markup: 20
}))

export default function CreateEstimate() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const dealIdStr = searchParams.get('deal_id')
  const dealId = dealIdStr ? parseInt(dealIdStr, 10) : null
  
  const [estimateName, setEstimateName] = useState('')
  const [clientName, setClientName] = useState('')
  const [address, setAddress] = useState('')
  const [items, setItems] = useState<EstimateItem[]>([])
  const [showCatalog, setShowCatalog] = useState<'work' | 'material' | null>(null)
  const [step, setStep] = useState<'select' | 'create'>('select')
  const [catalogSearch, setCatalogSearch] = useState('')

  // Моки шаблонов (в реальном приложении можно грузить с сервера)
  const templates = [
    {
      id: 'bathroom',
      name: 'Ремонт ванной "Под ключ"',
      description: 'Типовая смета для совмещенного санузла 4м2',
      icon: '🛁',
      items: [
        { type: 'work', name: 'Демонтаж плитки', unit: 'м2', quantity: 25, masterPrice: 350, markup: 50 },
        { type: 'work', name: 'Укладка плитки', unit: 'м2', quantity: 25, masterPrice: 1200, markup: 50 },
        { type: 'material', name: 'Плитка настенная', unit: 'м2', quantity: 27, masterPrice: 1500, markup: 20 },
        { type: 'material', name: 'Клей плиточный', unit: 'мешок', quantity: 5, masterPrice: 450, markup: 20 },
      ]
    },
    {
      id: 'room',
      name: 'Косметический ремонт комнаты',
      description: 'Стены под покраску, ламинат, 18м2',
      icon: '🏠',
      items: [
        { type: 'work', name: 'Грунтовка стен', unit: 'м2', quantity: 54, masterPrice: 80, markup: 50 },
        { type: 'work', name: 'Покраска стен (2 слоя)', unit: 'м2', quantity: 54, masterPrice: 350, markup: 50 },
        { type: 'work', name: 'Укладка ламината', unit: 'м2', quantity: 18, masterPrice: 450, markup: 50 },
        { type: 'material', name: 'Краска интерьерная', unit: 'л', quantity: 15, masterPrice: 800, markup: 20 },
      ]
    }
  ]

  const applyTemplate = (tmpl: any) => {
    const newItems = tmpl.items.map((i: any) => {
      const clientPrice = Math.round(i.masterPrice * (1 + i.markup / 100))
      return {
        id: Date.now() + Math.random(),
        type: i.type,
        name: i.name,
        unit: i.unit,
        quantity: i.quantity,
        masterPrice: i.masterPrice,
        markup: i.markup,
        clientPrice,
        total: clientPrice * i.quantity
      } as EstimateItem
    })
    setItems(newItems)
    setEstimateName(tmpl.name)
    setStep('create')
    toast.success('Шаблон применен')
  }

  const addItem = (type: 'work' | 'material', item: any) => {
    const clientPrice = Math.round(item.masterPrice * (1 + item.markup / 100))
    const newItem: EstimateItem = {
      id: Date.now(),
      type,
      name: item.name,
      unit: item.unit,
      quantity: 1,
      masterPrice: item.masterPrice,
      markup: item.markup,
      clientPrice,
      total: clientPrice
    }
    setItems([...items, newItem])
    setShowCatalog(null)
    toast.success('Позиция добавлена')
  }

  const updateItem = (id: number, field: keyof EstimateItem, value: number | string) => {
    setItems(items.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value }
        if (field === 'quantity' || field === 'masterPrice' || field === 'markup') {
          updated.clientPrice = Math.round(updated.masterPrice * (1 + updated.markup / 100))
          updated.total = updated.clientPrice * updated.quantity
        }
        return updated
      }
      return item
    }))
  }

  const removeItem = (id: number) => {
    setItems(items.filter(item => item.id !== id))
  }

  const addEmptyItem = (type: 'work' | 'material') => {
    const newItem: EstimateItem = {
      id: Date.now(),
      type,
      name: '',
      unit: type === 'work' ? 'м2' : 'шт',
      quantity: 1,
      masterPrice: 0,
      markup: type === 'work' ? 50 : 20,
      clientPrice: 0,
      total: 0
    }
    setItems([...items, newItem])
  }

  // Расчёты
  const worksItems = items.filter(i => i.type === 'work')
  const materialsItems = items.filter(i => i.type === 'material')

  const worksCost = worksItems.reduce((sum, i) => sum + (i.masterPrice * i.quantity), 0)
  const worksPrice = worksItems.reduce((sum, i) => sum + i.total, 0)

  const materialsCost = materialsItems.reduce((sum, i) => sum + (i.masterPrice * i.quantity), 0)
  const materialsPrice = materialsItems.reduce((sum, i) => sum + i.total, 0)

  const totalCost = worksCost + materialsCost
  const totalPrice = worksPrice + materialsPrice
  const totalMargin = totalPrice - totalCost
  const marginPercent = totalCost > 0 ? Math.round((totalMargin / totalCost) * 100) : 0

  const saveEstimate = async () => {
    if (!estimateName) {
      toast.error('Введите название сметы')
      return
    }
    if (items.length === 0) {
      toast.error('Добавьте хотя бы одну позицию')
      return
    }

    try {
      // 1. Создаем смету в БД
      const estimateData = {
        name: estimateName,
        number: 'СМ-' + Date.now().toString().slice(-6),
        project_id: null,
        client_name: clientName,
        address: address,
        total_cost: totalCost,
        status: 'draft',
        deal_id: dealId
      }

      const result = await estimatesApi.create(estimateData)
      const estimateId = result?.data?.id

      if (estimateId) {
        // 2. Сохраняем позиции
        // Используем Promise.all для параллельного сохранения
        await Promise.all(items.map(item => {
          return estimatesApi.addItem(estimateId, {
            name: item.name,
            unit: item.unit,
            quantity: item.quantity,
            // Новые поля для ZaruAI Смета
            row_type: item.type === 'work' ? 'rascenka' : 'material',
            price_fact: item.masterPrice,
            price_smeta: item.clientPrice,
            sum_fact: item.masterPrice * item.quantity,
            sum_smeta: item.clientPrice * item.quantity,
            // Legacy for safety
            materials_cost: item.type === 'material' ? item.clientPrice : 0,
            labor_cost: item.type === 'work' ? item.clientPrice : 0,
            code: item.type
          })
        }))

        toast.success('Смета успешно сохранена в базу!')
        navigate(`/estimates/${estimateId}`) // Переходим к деталям конкретной сметы
      } else {
        throw new Error('Не удалось получить ID сметы')
      }

    } catch (error) {
      console.error('Error saving estimate:', error)
      toast.error('Ошибка сохранения на сервере. Сохраняем локально.')

      // Fallback: LocalStorage
      const estimate = {
        id: Date.now(),
        name: estimateName,
        client: clientName,
        address,
        items,
        totalCost,
        totalPrice,
        totalMargin,
        createdAt: new Date().toISOString()
      }
      const estimates = JSON.parse(localStorage.getItem('zaru_estimates') || '[]')
      estimates.push(estimate)
      try {
        localStorage.setItem('zaru_estimates', JSON.stringify(estimates))
      } catch {
        toast.error('Недостаточно места в хранилище. Очистите старые сметы.')
        return
      }
      navigate('/estimates')
    }
  }

  // Сохранить как шаблон
  const saveAsTemplate = () => {
    if (!estimateName) {
      toast.error('Введите название шаблона')
      return
    }
    if (items.length === 0) {
      toast.error('Добавьте хотя бы одну позицию')
      return
    }

    const template = {
      id: Date.now(),
      name: estimateName,
      description: `Шаблон: ${estimateName}`,
      items: items.map(item => ({
        ...item,
        quantity: item.quantity // Сохраняем количество как есть
      })),
      createdAt: new Date().toISOString()
    }

    const templates = JSON.parse(localStorage.getItem('zaru_estimate_templates') || '[]')
    templates.push(template)
    localStorage.setItem('zaru_estimate_templates', JSON.stringify(templates))
    toast.success('Шаблон сохранён!')
  }

  const filteredCatalog = (showCatalog === 'work' ? worksCatalog : materialsCatalog)
    .filter(item => !catalogSearch || item.name.toLowerCase().includes(catalogSearch.toLowerCase()))

  if (step === 'select') {
    return (
      <div className="animate-fade-in max-w-5xl mx-auto space-y-8">
        <div>
          <button onClick={() => navigate('/estimates')} className="text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center gap-2 mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Назад к списку
          </button>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Создание новой сметы</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2 text-lg">Выберите способ создания, который подходит вам лучше всего</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Пустой бланк */}
          <div
            onClick={() => setStep('create')}
            className="group cursor-pointer p-6 rounded-2xl bg-white dark:bg-slate-800 border-2 border-transparent hover:border-primary-500 dark:hover:border-primary-500 shadow-sm hover:shadow-xl transition-all relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary-100 dark:bg-primary-900/30 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
            <div className="relative">
              <div className="w-14 h-14 rounded-xl bg-primary-100 dark:bg-primary-900/50 text-primary-600 flex items-center justify-center mb-4">
                <FileText className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-2">С чистого листа</h3>
              <p className="text-slate-500 dark:text-slate-400">
                Классический редактор сметы. Добавляйте работы и материалы из справочника или вручную.
              </p>
            </div>
          </div>

          {/* AI Сканер */}
          <div
            onClick={() => navigate('/scanner')}
            className="group cursor-pointer p-6 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg hover:shadow-2xl hover:scale-[1.02] transition-all relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10 animate-pulse"></div>
            <div className="relative">
              <div className="w-14 h-14 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center mb-4">
                <Calculator className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                AI Сканер
                <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs border border-white/30">New</span>
              </h3>
              <p className="text-violet-100">
                Загрузите фото сметы или черновик, и наш ИИ автоматически распознает все позиции и цены.
              </p>
            </div>
          </div>

          {/* Шаблоны (Быстрый старт) */}
          <div className="md:col-span-2 card p-6 border-2 border-transparent hover:border-slate-300 dark:hover:border-slate-600 transition-all">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Copy className="w-5 h-5 text-amber-500" />
              Использовать шаблон
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map(tmpl => (
                <div
                  key={tmpl.id}
                  onClick={() => applyTemplate(tmpl)}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-all flex items-start gap-3"
                >
                  <div className="text-3xl">{tmpl.icon}</div>
                  <div>
                    <h4 className="font-semibold text-sm">{tmpl.name}</h4>
                    <p className="text-xs text-slate-500 mt-1">{tmpl.description}</p>
                  </div>
                </div>
              ))}
              <div
                className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center text-slate-500 text-sm gap-2"
              >
                <Plus className="w-4 h-4" />
                Больше шаблонов...
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => setStep('select')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="w-7 h-7 text-primary-600" />
              Новая смета
            </h1>
            <p className="text-slate-600 dark:text-slate-400">Ручное создание сметы</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={saveAsTemplate} className="btn-secondary flex items-center gap-2">
            <Copy className="w-5 h-5" />
            Как шаблон
          </button>
          <button onClick={saveEstimate} className="btn-primary flex items-center gap-2">
            <Save className="w-5 h-5" />
            Сохранить
          </button>
        </div>
      </div>

      {/* Основная информация */}
      <div className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm text-slate-500">Название сметы *</label>
            <input
              type="text"
              value={estimateName}
              onChange={(e) => setEstimateName(e.target.value)}
              className="input"
              placeholder="Ремонт квартиры на ул. Ленина"
            />
          </div>
          <div>
            <label className="text-sm text-slate-500">Заказчик</label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="input"
              placeholder="Иванов И.И."
            />
          </div>
          <div>
            <label className="text-sm text-slate-500">Адрес объекта</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="input"
              placeholder="г. Москва, ул. Ленина, д. 10"
            />
          </div>
        </div>
      </div>

      {/* Работы */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <Hammer className="w-5 h-5 text-blue-600" />
            Работы ({worksItems.length})
          </h2>
          <div className="flex gap-2">
            <button onClick={() => setShowCatalog('work')} className="btn-secondary text-sm flex items-center gap-1">
              <Search className="w-4 h-4" /> Из каталога
            </button>
            <button onClick={() => addEmptyItem('work')} className="btn-primary text-sm flex items-center gap-1">
              <Plus className="w-4 h-4" /> Добавить
            </button>
          </div>
        </div>

        {worksItems.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Наименование</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 w-20">Ед.</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 w-20">Кол-во</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 w-24">Мастер</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 w-20">%</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 w-24">Клиенту</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 w-28">Сумма</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {worksItems.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2">
                      <input type="text" value={item.name} onChange={(e) => updateItem(item.id, 'name', e.target.value)} className="w-full bg-transparent border-none focus:ring-1 focus:ring-primary-500 rounded px-1" placeholder="Название работы" />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <select value={item.unit} onChange={(e) => updateItem(item.id, 'unit', e.target.value)} className="bg-transparent border-none text-center text-sm">
                        <option value="м2">м2</option>
                        <option value="м.п.">м.п.</option>
                        <option value="шт">шт</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" value={item.quantity} onChange={(e) => updateItem(item.id, 'quantity', Number(e.target.value))} className="w-16 text-center bg-transparent border rounded px-1" min="0" step="0.1" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" value={item.masterPrice} onChange={(e) => updateItem(item.id, 'masterPrice', Number(e.target.value))} className="w-20 text-right bg-transparent border rounded px-1" min="0" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" value={item.markup} onChange={(e) => updateItem(item.id, 'markup', Number(e.target.value))} className="w-14 text-center bg-transparent border rounded px-1" min="0" max="200" />
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{formatCurrency(item.clientPrice)}</td>
                    <td className="px-3 py-2 text-right font-bold">{formatCurrency(item.total)}</td>
                    <td className="px-1 py-2">
                      <button onClick={() => removeItem(item.id)} className="p-1 text-red-500 hover:bg-red-50 rounded">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {worksItems.length === 0 && (
          <div className="p-8 text-center text-slate-400">
            <Hammer className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p>Добавьте работы из каталога или вручную</p>
          </div>
        )}
      </div>

      {/* Материалы */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <Package className="w-5 h-5 text-amber-600" />
            Материалы ({materialsItems.length})
          </h2>
          <div className="flex gap-2">
            <button onClick={() => setShowCatalog('material')} className="btn-secondary text-sm flex items-center gap-1">
              <Search className="w-4 h-4" /> Из каталога
            </button>
            <button onClick={() => addEmptyItem('material')} className="btn-primary text-sm flex items-center gap-1">
              <Plus className="w-4 h-4" /> Добавить
            </button>
          </div>
        </div>

        {materialsItems.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Наименование</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 w-20">Ед.</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 w-20">Кол-во</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 w-24">Закуп</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 w-20">%</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 w-24">Клиенту</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 w-28">Сумма</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {materialsItems.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2">
                      <input type="text" value={item.name} onChange={(e) => updateItem(item.id, 'name', e.target.value)} className="w-full bg-transparent border-none focus:ring-1 focus:ring-primary-500 rounded px-1" placeholder="Название материала" />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <select value={item.unit} onChange={(e) => updateItem(item.id, 'unit', e.target.value)} className="bg-transparent border-none text-center text-sm">
                        <option value="шт">шт</option>
                        <option value="м2">м2</option>
                        <option value="м">м</option>
                        <option value="л">л</option>
                        <option value="кг">кг</option>
                        <option value="мешок">мешок</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" value={item.quantity} onChange={(e) => updateItem(item.id, 'quantity', Number(e.target.value))} className="w-16 text-center bg-transparent border rounded px-1" min="0" step="0.1" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" value={item.masterPrice} onChange={(e) => updateItem(item.id, 'masterPrice', Number(e.target.value))} className="w-20 text-right bg-transparent border rounded px-1" min="0" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" value={item.markup} onChange={(e) => updateItem(item.id, 'markup', Number(e.target.value))} className="w-14 text-center bg-transparent border rounded px-1" min="0" max="200" />
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{formatCurrency(item.clientPrice)}</td>
                    <td className="px-3 py-2 text-right font-bold">{formatCurrency(item.total)}</td>
                    <td className="px-1 py-2">
                      <button onClick={() => removeItem(item.id)} className="p-1 text-red-500 hover:bg-red-50 rounded">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {materialsItems.length === 0 && (
          <div className="p-8 text-center text-slate-400">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p>Добавьте материалы из каталога или вручную</p>
          </div>
        )}
      </div>

      {/* Итоги */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <User className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Себестоимость</p>
              <p className="text-xl font-bold text-blue-600">{formatCurrency(totalCost)}</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Клиенту</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(totalPrice)}</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Маржа</p>
              <p className="text-xl font-bold text-green-600">+{formatCurrency(totalMargin)}</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Calculator className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Рентабельность</p>
              <p className="text-xl font-bold text-purple-600">{marginPercent}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Модальное окно каталога */}
      {showCatalog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card p-6 w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                {showCatalog === 'work' ? 'Каталог работ' : 'Каталог материалов'}
              </h3>
              <button onClick={() => setShowCatalog(null)} className="p-1 hover:bg-slate-100 rounded">X</button>
            </div>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Поиск..."
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                className="input pl-9"
              />
            </div>
            <div className="overflow-y-auto flex-1">
              {filteredCatalog.map((item) => (
                <div
                  key={item.code}
                  onClick={() => addItem(showCatalog, item)}
                  className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer border-b last:border-0"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-sm text-slate-500">{item.code} | {item.unit}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatCurrency(Math.round(item.masterPrice * (1 + item.markup / 100)))}</p>
                      <p className="text-xs text-slate-400">себест. {formatCurrency(item.masterPrice)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
