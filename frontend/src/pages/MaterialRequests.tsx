import { useState } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { 
  Package, 
  Search, 
  Plus, 
  FileText,
  Send,
  Clock,
  CheckCircle,
  XCircle,
  Truck,
  Building2,
  MoreVertical,
  Edit,
  Trash2,
  Copy,
  Download,
  Eye,
  AlertCircle,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'

type RequestStatus = 'draft' | 'sent' | 'confirmed' | 'delivered' | 'cancelled'

interface MaterialItem {
  id: number
  name: string
  unit: string
  quantity: number
  price: number
  supplier?: string
}

interface MaterialRequest {
  id: number
  number: string
  date: string
  projectName: string
  supplier: string
  supplierPhone: string
  status: RequestStatus
  items: MaterialItem[]
  deliveryDate?: string
  notes: string
  totalAmount: number
}

// Демо данные
const demoRequests: MaterialRequest[] = [
  {
    id: 1,
    number: 'ЗМ-2026-001',
    date: '2026-01-10',
    projectName: 'ЖК "Солнечный", кв. 45',
    supplier: 'ООО "СтройМатериалы"',
    supplierPhone: '+7 (495) 123-45-67',
    status: 'confirmed',
    deliveryDate: '2026-01-15',
    notes: 'Доставка до подъезда',
    totalAmount: 285000,
    items: [
      { id: 1, name: 'Штукатурка гипсовая Knauf Rotband 30 кг', unit: 'мешок', quantity: 50, price: 450 },
      { id: 2, name: 'Шпаклёвка финишная Vetonit LR+ 25 кг', unit: 'мешок', quantity: 30, price: 650 },
      { id: 3, name: 'Грунтовка Ceresit CT17 10 л', unit: 'канистра', quantity: 20, price: 850 },
      { id: 4, name: 'Профиль направляющий ПН 27х28 3м', unit: 'шт', quantity: 100, price: 120 },
      { id: 5, name: 'Гипсокартон Knauf 12.5 мм', unit: 'лист', quantity: 80, price: 450 },
    ]
  },
  {
    id: 2,
    number: 'ЗМ-2026-002',
    date: '2026-01-08',
    projectName: 'Офис на Тверской',
    supplier: 'База "Петрович"',
    supplierPhone: '+7 (812) 567-89-01',
    status: 'delivered',
    deliveryDate: '2026-01-09',
    notes: 'Доставлено в срок',
    totalAmount: 156000,
    items: [
      { id: 1, name: 'Ламинат Quick-Step Classic 8 мм', unit: 'м²', quantity: 120, price: 950 },
      { id: 2, name: 'Подложка под ламинат 3 мм', unit: 'м²', quantity: 130, price: 150 },
      { id: 3, name: 'Плинтус МДФ 80 мм белый', unit: 'шт', quantity: 45, price: 280 },
    ]
  },
  {
    id: 3,
    number: 'ЗМ-2026-003',
    date: '2026-01-11',
    projectName: 'Частный дом, Рублёвка',
    supplier: 'ООО "МегаСтрой"',
    supplierPhone: '+7 (495) 345-67-89',
    status: 'sent',
    notes: 'Ожидаем подтверждение наличия плитки',
    totalAmount: 520000,
    items: [
      { id: 1, name: 'Керамогранит 60x60 Kerama Marazzi', unit: 'м²', quantity: 85, price: 2500 },
      { id: 2, name: 'Плиточный клей Mapei Keraflex 25 кг', unit: 'мешок', quantity: 40, price: 800 },
      { id: 3, name: 'Затирка Mapei Ultracolor Plus 5 кг', unit: 'упак', quantity: 15, price: 1200 },
      { id: 4, name: 'Крестики для плитки 3 мм', unit: 'упак', quantity: 10, price: 150 },
      { id: 5, name: 'СВП система выравнивания', unit: 'комплект', quantity: 5, price: 2500 },
    ]
  },
  {
    id: 4,
    number: 'ЗМ-2026-004',
    date: '2026-01-11',
    projectName: 'ЖК "Солнечный", кв. 45',
    supplier: '',
    supplierPhone: '',
    status: 'draft',
    notes: 'Черновик, выбрать поставщика',
    totalAmount: 89000,
    items: [
      { id: 1, name: 'Унитаз Roca Gap с инсталляцией', unit: 'комплект', quantity: 2, price: 25000 },
      { id: 2, name: 'Раковина Roca Gap 60 см', unit: 'шт', quantity: 2, price: 8500 },
      { id: 3, name: 'Смеситель Grohe Eurosmart', unit: 'шт', quantity: 3, price: 7000 },
    ]
  },
  {
    id: 5,
    number: 'ЗМ-2026-005',
    date: '2026-01-05',
    projectName: 'Квартира на Арбате',
    supplier: 'ИП "ЭлектроТовары"',
    supplierPhone: '+7 (926) 111-22-33',
    status: 'cancelled',
    notes: 'Отменено - нашли дешевле',
    totalAmount: 45000,
    items: [
      { id: 1, name: 'Кабель ВВГнг 3x2.5', unit: 'м', quantity: 200, price: 85 },
      { id: 2, name: 'Автомат ABB 16А', unit: 'шт', quantity: 15, price: 650 },
      { id: 3, name: 'Розетка Schneider Unica', unit: 'шт', quantity: 30, price: 450 },
    ]
  },
]

const statusConfig: Record<RequestStatus, { label: string; color: string; icon: typeof Clock; bg: string }> = {
  draft: { label: 'Черновик', color: 'text-slate-600', icon: FileText, bg: 'bg-slate-100 dark:bg-slate-700' },
  sent: { label: 'Отправлено', color: 'text-blue-600', icon: Send, bg: 'bg-blue-100 dark:bg-blue-900/30' },
  confirmed: { label: 'Подтверждено', color: 'text-amber-600', icon: CheckCircle, bg: 'bg-amber-100 dark:bg-amber-900/30' },
  delivered: { label: 'Доставлено', color: 'text-green-600', icon: Truck, bg: 'bg-green-100 dark:bg-green-900/30' },
  cancelled: { label: 'Отменено', color: 'text-red-600', icon: XCircle, bg: 'bg-red-100 dark:bg-red-900/30' },
}

export default function MaterialRequests() {
  const [requests, setRequests] = useLocalStorage<MaterialRequest[]>('zaru_material_requests_v1', demoRequests)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<RequestStatus | 'all'>('all')
  const [showModal, setShowModal] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<MaterialRequest | null>(null)
  const [showMenu, setShowMenu] = useState<number | null>(null)
  const [expandedRequest, setExpandedRequest] = useState<number | null>(null)

  // Фильтрация
  const filteredRequests = requests.filter(r => {
    const matchesSearch = !search || 
      r.number.toLowerCase().includes(search.toLowerCase()) ||
      r.projectName.toLowerCase().includes(search.toLowerCase()) ||
      r.supplier.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = filterStatus === 'all' || r.status === filterStatus
    return matchesSearch && matchesStatus
  })

  // Статистика
  const stats = {
    total: requests.length,
    draft: requests.filter(r => r.status === 'draft').length,
    inProgress: requests.filter(r => ['sent', 'confirmed'].includes(r.status)).length,
    totalAmount: requests.filter(r => r.status !== 'cancelled').reduce((sum, r) => sum + r.totalAmount, 0)
  }

  const handleDelete = (id: number) => {
    if (confirm('Удалить заявку?')) {
      setRequests(prev => prev.filter(r => r.id !== id))
      toast.success('Заявка удалена')
    }
    setShowMenu(null)
  }

  const handleDuplicate = (request: MaterialRequest) => {
    const newRequest: MaterialRequest = {
      ...request,
      id: Date.now(),
      number: `ЗМ-2026-${String(requests.length + 1).padStart(3, '0')}`,
      date: new Date().toISOString().split('T')[0],
      status: 'draft',
      deliveryDate: undefined,
      notes: `Копия заявки ${request.number}`
    }
    setRequests(prev => [newRequest, ...prev])
    toast.success('Заявка скопирована')
    setShowMenu(null)
  }

  const handleSendToSupplier = (request: MaterialRequest) => {
    if (!request.supplier) {
      toast.error('Сначала выберите поставщика')
      return
    }
    setRequests(prev => prev.map(r => 
      r.id === request.id ? { ...r, status: 'sent' as RequestStatus } : r
    ))
    toast.success(`Заявка отправлена: ${request.supplier}`)
    setShowMenu(null)
  }

  const handleExport = (request: MaterialRequest) => {
    const content = `
ЗАЯВКА НА МАТЕРИАЛЫ №${request.number}
Дата: ${new Date(request.date).toLocaleDateString('ru')}
Объект: ${request.projectName}
Поставщик: ${request.supplier || 'Не выбран'}

МАТЕРИАЛЫ:
${request.items.map((item, i) => `${i+1}. ${item.name} - ${item.quantity} ${item.unit} x ${item.price}₽ = ${formatCurrency(item.quantity * item.price)}`).join('\n')}

ИТОГО: ${formatCurrency(request.totalAmount)}

Примечание: ${request.notes || '-'}
    `
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Заявка_${request.number}.txt`
    a.click()
    toast.success('Заявка экспортирована')
    setShowMenu(null)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Заголовок */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Package className="w-7 h-7 text-primary-600" />
            Заявки на материалы
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Формирование и отслеживание заявок поставщикам
          </p>
        </div>
        <button
          onClick={() => {
            setSelectedRequest(null)
            setShowModal(true)
          }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Новая заявка
        </button>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-sm text-slate-500">Всего заявок</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
              <Edit className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.draft}</p>
              <p className="text-sm text-slate-500">Черновики</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.inProgress}</p>
              <p className="text-sm text-slate-500">В работе</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Package className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatCurrency(stats.totalAmount)}</p>
              <p className="text-sm text-slate-500">Сумма активных</p>
            </div>
          </div>
        </div>
      </div>

      {/* Фильтры */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Поиск по номеру, объекту, поставщику..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as RequestStatus | 'all')}
          className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
        >
          <option value="all">Все статусы</option>
          <option value="draft">📝 Черновики</option>
          <option value="sent">📤 Отправлено</option>
          <option value="confirmed">✅ Подтверждено</option>
          <option value="delivered">🚚 Доставлено</option>
          <option value="cancelled">❌ Отменено</option>
        </select>
      </div>

      {/* Список заявок */}
      <div className="space-y-4">
        {filteredRequests.map(request => {
          const statusCfg = statusConfig[request.status]
          const StatusIcon = statusCfg.icon
          const isExpanded = expandedRequest === request.id
          
          return (
            <div 
              key={request.id}
              className={`card overflow-hidden ${
                request.status === 'cancelled' ? 'opacity-60' : ''
              }`}
            >
              {/* Заголовок заявки */}
              <div 
                className="p-5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                onClick={() => setExpandedRequest(isExpanded ? null : request.id)}
              >
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-mono font-semibold text-lg">{request.number}</span>
                      <span className={`px-2 py-1 text-xs rounded-full ${statusCfg.bg} ${statusCfg.color} flex items-center gap-1`}>
                        <StatusIcon className="w-3 h-3" />
                        {statusCfg.label}
                      </span>
                      <span className="text-sm text-slate-500">
                        {new Date(request.date).toLocaleDateString('ru')}
                      </span>
                    </div>
                    
                    <p className="mt-1 font-medium">{request.projectName}</p>
                    
                    <div className="flex items-center gap-4 mt-2 text-sm">
                      {request.supplier ? (
                        <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                          <Building2 className="w-4 h-4" />
                          {request.supplier}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-amber-600">
                          <AlertCircle className="w-4 h-4" />
                          Поставщик не выбран
                        </span>
                      )}
                      {request.deliveryDate && (
                        <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                          <Truck className="w-4 h-4" />
                          Доставка: {new Date(request.deliveryDate).toLocaleDateString('ru')}
                        </span>
                      )}
                    </div>

                    {request.notes && (
                      <p className="mt-2 text-sm text-slate-500 italic">💬 {request.notes}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm text-slate-500">{request.items.length} позиций</p>
                      <p className="text-xl font-bold text-green-600">{formatCurrency(request.totalAmount)}</p>
                    </div>

                    {/* Меню действий */}
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowMenu(showMenu === request.id ? null : request.id)
                        }}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                      >
                        <MoreVertical className="w-5 h-5" />
                      </button>
                      
                      {showMenu === request.id && (
                        <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-10">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setExpandedRequest(request.id)
                              setShowMenu(null)
                            }}
                            className="w-full px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                          >
                            <Eye className="w-4 h-4" />
                            Просмотреть
                          </button>
                          {request.status === 'draft' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleSendToSupplier(request)
                              }}
                              className="w-full px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-blue-600"
                            >
                              <Send className="w-4 h-4" />
                              Отправить поставщику
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDuplicate(request)
                            }}
                            className="w-full px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                          >
                            <Copy className="w-4 h-4" />
                            Копировать
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleExport(request)
                            }}
                            className="w-full px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                          >
                            <Download className="w-4 h-4" />
                            Экспорт
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(request.id)
                            }}
                            className="w-full px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                            Удалить
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Детали заявки (развёрнутые) */}
              {isExpanded && (
                <div className="border-t border-slate-200 dark:border-slate-700">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50 dark:bg-slate-800/50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">№</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Наименование</th>
                          <th className="px-4 py-2 text-center text-xs font-medium text-slate-500 uppercase">Ед.</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Кол-во</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Цена</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Сумма</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {request.items.map((item, index) => (
                          <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                            <td className="px-4 py-3 text-sm text-slate-500">{index + 1}</td>
                            <td className="px-4 py-3 font-medium">{item.name}</td>
                            <td className="px-4 py-3 text-center text-sm text-slate-500">{item.unit}</td>
                            <td className="px-4 py-3 text-right">{item.quantity}</td>
                            <td className="px-4 py-3 text-right">{formatCurrency(item.price)}</td>
                            <td className="px-4 py-3 text-right font-semibold">{formatCurrency(item.quantity * item.price)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 dark:bg-slate-800/50">
                        <tr>
                          <td colSpan={5} className="px-4 py-3 text-right font-semibold">ИТОГО:</td>
                          <td className="px-4 py-3 text-right font-bold text-lg text-green-600">{formatCurrency(request.totalAmount)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {filteredRequests.length === 0 && (
        <div className="card p-12 text-center">
          <Package className="w-12 h-12 mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500">Заявки не найдены</p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 text-primary-600 hover:underline"
          >
            Создать первую заявку
          </button>
        </div>
      )}

      {/* Подсказка */}
      <div className="card p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-100 dark:border-blue-800">
        <div className="flex items-center gap-3">
          <Truck className="w-5 h-5 text-blue-600" />
          <div>
            <p className="font-medium text-blue-900 dark:text-blue-100">
              Заявки можно создавать из сметы
            </p>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Откройте смету → выберите материалы → создайте заявку поставщику
            </p>
          </div>
        </div>
      </div>

      {/* Модалка */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">
              {selectedRequest ? 'Редактировать заявку' : 'Новая заявка'}
            </h2>
            <p className="text-slate-500"></p>
            <p className="text-sm text-slate-400 mt-2">
              Введите данные для создания заявки
            </p>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowModal(false)} className="btn-secondary">
                Отмена
              </button>
              <button onClick={() => {
                toast.success('Заявка создана')
                setShowModal(false)
              }} className="btn-primary">
                Создать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

