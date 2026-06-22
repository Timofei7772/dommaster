import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { 
  Building2, 
  Search, 
  Plus, 
  Phone, 
  Mail, 
  MapPin,
  Star,
  
  MoreVertical,
  Truck,
  Wrench,
  Edit,
  Trash2,
  FileText,
  TrendingUp,
  Calendar,
  CheckCircle,
  AlertCircle,
  User
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'

type ContractorType = 'supplier' | 'subcontractor' | 'both'

interface Contractor {
  id: number
  name: string
  type: ContractorType
  inn: string
  phone: string
  email: string
  address: string
  contactPerson: string
  rating: number
  totalOrders: number
  totalAmount: number
  lastOrderDate: string
  status: 'active' | 'inactive' | 'blacklist'
  categories: string[]
  notes: string
}

// Демо данные
const demoContractors: Contractor[] = [
  {
    id: 1,
    name: 'ООО "СтройМатериалы"',
    type: 'supplier',
    inn: '7701234567',
    phone: '+7 (495) 123-45-67',
    email: 'info@stroymaterials.ru',
    address: 'г. Москва, ул. Строителей, 15',
    contactPerson: 'Иванов Пётр Сергеевич',
    rating: 4.8,
    totalOrders: 47,
    totalAmount: 8500000,
    lastOrderDate: '2026-01-05',
    status: 'active',
    categories: ['Сухие смеси', 'Плитка', 'Сантехника'],
    notes: 'Быстрая доставка, хорошие скидки от объёма'
  },
  {
    id: 2,
    name: 'ИП Сидоров А.В.',
    type: 'subcontractor',
    inn: '771234567890',
    phone: '+7 (916) 234-56-78',
    email: 'sidorov@mail.ru',
    address: 'г. Москва',
    contactPerson: 'Сидоров Алексей Владимирович',
    rating: 4.5,
    totalOrders: 23,
    totalAmount: 3200000,
    lastOrderDate: '2026-01-08',
    status: 'active',
    categories: ['Электрика', 'Сантехника'],
    notes: 'Качественная работа, соблюдает сроки'
  },
  {
    id: 3,
    name: 'ООО "МегаСтрой"',
    type: 'both',
    inn: '7702345678',
    phone: '+7 (495) 345-67-89',
    email: 'megastroy@yandex.ru',
    address: 'г. Москва, Ленинский пр-т, 45',
    contactPerson: 'Козлова Мария Ивановна',
    rating: 4.2,
    totalOrders: 15,
    totalAmount: 5600000,
    lastOrderDate: '2025-12-20',
    status: 'active',
    categories: ['Отделка', 'Материалы', 'Демонтаж'],
    notes: 'Комплексные услуги, есть свой склад'
  },
  {
    id: 4,
    name: 'ООО "ЭлектроМонтаж"',
    type: 'subcontractor',
    inn: '7703456789',
    phone: '+7 (495) 456-78-90',
    email: 'electro@montazh.ru',
    address: 'г. Подольск, ул. Кирова, 10',
    contactPerson: 'Петров Николай Андреевич',
    rating: 4.9,
    totalOrders: 34,
    totalAmount: 4100000,
    lastOrderDate: '2026-01-10',
    status: 'active',
    categories: ['Электрика', 'Слаботочка', 'Умный дом'],
    notes: 'Лучшие электрики в городе!'
  },
  {
    id: 5,
    name: 'База "Петрович"',
    type: 'supplier',
    inn: '7804567890',
    phone: '+7 (812) 567-89-01',
    email: 'zakaz@petrovich.ru',
    address: 'г. Санкт-Петербург',
    contactPerson: 'Отдел продаж',
    rating: 4.6,
    totalOrders: 89,
    totalAmount: 12300000,
    lastOrderDate: '2026-01-09',
    status: 'active',
    categories: ['Всё для ремонта'],
    notes: 'Крупный поставщик, онлайн-заказ'
  },
  {
    id: 6,
    name: 'ИП Кузнецов',
    type: 'subcontractor',
    inn: '772345678901',
    phone: '+7 (903) 678-90-12',
    email: 'kuznecov.plitka@gmail.com',
    address: 'г. Москва',
    contactPerson: 'Кузнецов Дмитрий',
    rating: 3.2,
    totalOrders: 5,
    totalAmount: 450000,
    lastOrderDate: '2025-11-15',
    status: 'blacklist',
    categories: ['Плиточные работы'],
    notes: 'Не рекомендуется - срывает сроки, брак в работе'
  },
]

const typeLabels: Record<ContractorType, string> = {
  supplier: 'Поставщик',
  subcontractor: 'Субподрядчик',
  both: 'Поставщик + Субподрядчик'
}

const typeColors: Record<ContractorType, string> = {
  supplier: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  subcontractor: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  both: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
}





export default function Contractors() {
  const queryClient = useQueryClient()
  const { data: contractors = [] } = useQuery<Contractor[]>({
    queryKey: ['contractors'],
    queryFn: async () => {
      const data = await window.electronAPI?.contractors?.getAll?.()
      return data?.length ? data : demoContractors
    },
  })
  const saveContractors = useCallback(async (updated: Contractor[]) => {
    await window.electronAPI?.contractors?.save?.(updated)
    queryClient.setQueryData(['contractors'], updated)
  }, [queryClient])
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<ContractorType | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [selectedContractor, setSelectedContractor] = useState<Contractor | null>(null)
  const [showMenu, setShowMenu] = useState<number | null>(null)

  // Новая форма контрагента
  const [contractorName, setContractorName] = useState('')
  const [contractorType, setContractorType] = useState<ContractorType>('supplier') // Исправлен тип
  const [contractorPhone, setContractorPhone] = useState('')
  const [contractorRating, setContractorRating] = useState<number>(0)
  const [contractorCategories, setContractorCategories] = useState<string[]>([]) // Добавлено состояние для категорий
  // Фильтрация
  const filteredContractors = contractors.filter(c => {
    const matchesSearch = !search || 
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.contactPerson.toLowerCase().includes(search.toLowerCase()) ||
      c.inn.includes(search)
    const matchesType = filterType === 'all' || c.type === filterType || (filterType === 'both' && c.type === 'both')
    const matchesStatus = filterStatus === 'all' || c.status === filterStatus
    return matchesSearch && matchesType && matchesStatus
  })

  // Статистика
  const stats = {
    total: contractors.length,
    suppliers: contractors.filter(c => c.type === 'supplier' || c.type === 'both').length,
    subcontractors: contractors.filter(c => c.type === 'subcontractor' || c.type === 'both').length,
    totalAmount: contractors.reduce((sum, c) => sum + c.totalAmount, 0)
  }

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map(star => (
          <Star 
            key={star}
            className={`w-4 h-4 ${star <= rating ? 'text-yellow-500 fill-yellow-500' : 'text-slate-300'}`}
          />
        ))}
        <span className="ml-1 text-sm font-medium">{rating.toFixed(1)}</span>
      </div>
    )
  }

  const handleDelete = (id: number) => {
    if (confirm('Удалить контрагента?')) {
      saveContractors(contractors.filter(c => c.id !== id))
      toast.success('Контрагент удалён')
    }
    setShowMenu(null)
  }

  const toggleBlacklist = (id: number) => {
    const updated = contractors.map(c => {
      if (c.id === id) {
        const newStatus: Contractor['status'] = c.status === 'blacklist' ? 'active' : 'blacklist'
        toast.success(newStatus === 'blacklist' ? 'Добавлен в чёрный список' : 'Убран из чёрного списка')
        return { ...c, status: newStatus }
      }
      return c
    })
    saveContractors(updated)
    setShowMenu(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!contractorName || !contractorType || !contractorPhone) {
      toast.error('Пожалуйста, заполните все обязательные поля.');
      return;
    }

    const newContractor: Contractor = {
      id: selectedContractor?.id || Date.now(),
      name: contractorName,
      type: contractorType,
      inn: selectedContractor?.inn || '',
      phone: contractorPhone,
      email: selectedContractor?.email || '',
      address: selectedContractor?.address || '',
      contactPerson: selectedContractor?.contactPerson || '',
      rating: contractorRating || 0,
      totalOrders: selectedContractor?.totalOrders || 0,
      totalAmount: selectedContractor?.totalAmount || 0,
      lastOrderDate: selectedContractor?.lastOrderDate || new Date().toISOString().split('T')[0],
      status: selectedContractor?.status || 'active',
      categories: contractorCategories,
      notes: selectedContractor?.notes || '',
    };

    if (selectedContractor) {
      saveContractors(contractors.map(c => c.id === selectedContractor.id ? newContractor : c));
      toast.success('Контрагент успешно обновлён!')
    } else {
      saveContractors([...contractors, newContractor])
      toast.success('Контрагент успешно добавлен!')
    }

    setShowModal(false);
    resetForm();
  };

  const resetForm = () => {
    setContractorName('')
    setContractorType('supplier')
    setContractorPhone('')
    setContractorRating(0)
    setContractorCategories([])
    setSelectedContractor(null)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Заголовок */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Building2 className="w-7 h-7 text-primary-600" />
            Контрагенты
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Поставщики материалов и субподрядчики
          </p>
        </div>
        <button
          onClick={() => {
            setSelectedContractor(null)
            setShowModal(true)
          }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Добавить контрагента
        </button>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-sm text-slate-500">Всего</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Truck className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.suppliers}</p>
              <p className="text-sm text-slate-500">Поставщики</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Wrench className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.subcontractors}</p>
              <p className="text-sm text-slate-500">Субподрядчики</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatCurrency(stats.totalAmount)}</p>
              <p className="text-sm text-slate-500">Общий оборот</p>
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
            placeholder="Поиск по названию, ИНН, контактному лицу..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as ContractorType | 'all')}
          className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
        >
          <option value="all">Все типы</option>
          <option value="supplier">Поставщики</option>
          <option value="subcontractor">Субподрядчики</option>
          <option value="both">Комплексные</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
        >
          <option value="all">Все статусы</option>
          <option value="active">Активные</option>
          <option value="inactive">Неактивные</option>
          <option value="blacklist">Чёрный список</option>
        </select>
      </div>

      {/* Список контрагентов */}
      <div className="grid gap-4">
        {filteredContractors.map(contractor => (
          <div 
            key={contractor.id}
            className={`card p-5 hover:shadow-lg transition-all ${
              contractor.status === 'blacklist' ? 'border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-900/10' : ''
            }`}
          >
            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
              {/* Основная информация */}
              <div className="flex-1">
                <div className="flex items-start gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    contractor.type === 'supplier' ? 'bg-blue-100 dark:bg-blue-900/30' :
                    contractor.type === 'subcontractor' ? 'bg-purple-100 dark:bg-purple-900/30' :
                    'bg-green-100 dark:bg-green-900/30'
                  }`}>
                    {contractor.type === 'supplier' ? (
                      <Truck className="w-6 h-6 text-blue-600" />
                    ) : contractor.type === 'subcontractor' ? (
                      <Wrench className="w-6 h-6 text-purple-600" />
                    ) : (
                      <Building2 className="w-6 h-6 text-green-600" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-lg">{contractor.name}</h3>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${typeColors[contractor.type]}`}>
                        {typeLabels[contractor.type]}
                      </span>
                      {contractor.status === 'blacklist' && (
                        <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-full flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          Чёрный список
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 mt-1">ИНН: {contractor.inn}</p>
                    
                    <div className="flex flex-wrap gap-4 mt-3 text-sm">
                      <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                        <User className="w-4 h-4" />
                        {contractor.contactPerson}
                      </div>
                      <a href={`tel:${contractor.phone}`} className="flex items-center gap-1 text-primary-600 hover:underline">
                        <Phone className="w-4 h-4" />
                        {contractor.phone}
                      </a>
                      <a href={`mailto:${contractor.email}`} className="flex items-center gap-1 text-primary-600 hover:underline">
                        <Mail className="w-4 h-4" />
                        {contractor.email}
                      </a>
                    </div>

                    <div className="flex items-center gap-1 mt-2 text-sm text-slate-500">
                      <MapPin className="w-4 h-4" />
                      {contractor.address}
                    </div>

                    <div className="flex flex-wrap gap-1 mt-3">
                      {contractor.categories.map(cat => (
                        <span key={cat} className="px-2 py-0.5 text-xs bg-slate-100 dark:bg-slate-700 rounded">
                          {cat}
                        </span>
                      ))}
                    </div>

                    {contractor.notes && (
                      <p className="mt-2 text-sm text-slate-500 italic">
                        💬 {contractor.notes}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Статистика и рейтинг */}
              <div className="flex flex-col gap-3 lg:items-end lg:min-w-[200px]">
                {renderStars(contractor.rating)}
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500">Заказов</p>
                    <p className="font-semibold">{contractor.totalOrders}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Сумма</p>
                    <p className="font-semibold text-green-600">{formatCurrency(contractor.totalAmount)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-sm text-slate-500">
                  <Calendar className="w-4 h-4" />
                  Последний заказ: {new Date(contractor.lastOrderDate).toLocaleDateString('ru')}
                </div>

                {/* Меню действий */}
                <div className="relative">
                  <button
                    onClick={() => setShowMenu(showMenu === contractor.id ? null : contractor.id)}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>
                  
                  {showMenu === contractor.id && (
                    <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-10">
                      <button
                        onClick={() => {
                          setSelectedContractor(contractor)
                          setShowModal(true)
                          setShowMenu(null)
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                      >
                        <Edit className="w-4 h-4" />
                        Редактировать
                      </button>
                      <button
                        onClick={() => toast.success('Открываем историю заказов')}
                        className="w-full px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                      >
                        <FileText className="w-4 h-4" />
                        История заказов
                      </button>
                      <button
                        onClick={() => toggleBlacklist(contractor.id)}
                        className="w-full px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                      >
                        {contractor.status === 'blacklist' ? (
                          <>
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            <span className="text-green-600">Убрать из ЧС</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-4 h-4 text-red-600" />
                            <span className="text-red-600">В чёрный список</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(contractor.id)}
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
        ))}
      </div>

      {filteredContractors.length === 0 && (
        <div className="card p-12 text-center">
          <Building2 className="w-12 h-12 mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500">Контрагенты не найдены</p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 text-primary-600 hover:underline"
          >
            Добавить первого контрагента
          </button>
        </div>
      )}

      {/* Модалка добавления - TODO: полная форма */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">
              {selectedContractor ? 'Редактировать контрагента' : 'Новый контрагент'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Название контрагента *</label>
                  <input
                    type="text"
                    value={contractorName}
                    onChange={(e) => setContractorName(e.target.value)}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Тип контрагента *</label>
                  <select
                    value={contractorType}
                    onChange={(e) => setContractorType(e.target.value as ContractorType)}
                    className="input"
                    required
                  >
                    <option value="supplier">Поставщик</option>
                    <option value="subcontractor">Субподрядчик</option>
                    <option value="both">Поставщик + Субподрядчик</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Телефон *</label>
                  <input
                    type="tel"
                    value={contractorPhone}
                    onChange={(e) => setContractorPhone(e.target.value)}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Специализации</label>
                  <input
                    type="text"
                    value={contractorCategories.join(', ')}
                    onChange={(e) => setContractorCategories(e.target.value.split(',').map(cat => cat.trim()))}
                    className="input"
                    placeholder="Например: Штукатурные, Малярные"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Рейтинг</label>
                  <input
                    type="number"
                    value={contractorRating}
                    onChange={(e) => setContractorRating(Number(e.target.value))}
                    className="input"
                    min="0"
                    max="5"
                    step="0.1"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
                  Отмена
                </button>
                <button type="submit" className="btn-primary">
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


