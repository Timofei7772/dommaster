import { useState } from 'react'
import {
  Users,
  Plus,
  Search,
  Phone,
  Mail,
  MapPin,
  Building2,
  User,
  Eye,
  Edit,
  Star,
  DollarSign,
  Trash2,
  X,
  PlusCircle
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'

interface Client {
  id: number
  type: 'individual' | 'company'
  name: string
  inn?: string
  phone: string
  email: string
  address: string
  contactPerson?: string
  contractsCount: number
  totalAmount: number
  rating: number
  notes?: string
}

// Демо данные
const demoClients: Client[] = [
  {
    id: 1,
    type: 'individual',
    name: 'Иванов Иван Иванович',
    phone: '+7 (999) 123-45-67',
    email: 'ivanov@mail.ru',
    address: 'г. Москва, ул. Пушкина, д. 15, кв. 42',
    contractsCount: 3,
    totalAmount: 1580000,
    rating: 5,
  },
  {
    id: 2,
    type: 'company',
    name: 'ООО "Аврора"',
    inn: '7701234567',
    phone: '+7 (495) 123-45-67',
    email: 'info@aurora.ru',
    address: 'г. Москва, БЦ Аврора, ул. Ленина, 10',
    contactPerson: 'Сидоров А.П.',
    contractsCount: 5,
    totalAmount: 4200000,
    rating: 4,
  },
  {
    id: 3,
    type: 'company',
    name: 'ЖК Солнечный',
    inn: '7702345678',
    phone: '+7 (495) 987-65-43',
    email: 'info@sunny-jk.ru',
    address: 'г. Москва, ЖК Солнечный',
    contactPerson: 'Петрова М.И.',
    contractsCount: 2,
    totalAmount: 8500000,
    rating: 5,
  },
  {
    id: 4,
    type: 'individual',
    name: 'Петров Пётр Петрович',
    phone: '+7 (916) 555-44-33',
    email: 'petrov@gmail.com',
    address: 'Московская область, г. Химки',
    contractsCount: 1,
    totalAmount: 2500000,
    rating: 0,
  },
]

const typeConfig: Record<string, { label: string; icon: typeof User; class: string }> = {
  individual: { label: 'Физ. лицо', icon: User, class: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30' },
  company: { label: 'Юр. лицо', icon: Building2, class: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30' },
}

// Хук для localStorage
function useLocalStorage<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch {
      return initialValue
    }
  })

  const setValue: React.Dispatch<React.SetStateAction<T>> = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value
      setStoredValue(valueToStore)
      window.localStorage.setItem(key, JSON.stringify(valueToStore))
    } catch (error) {
      console.error(error)
    }
  }

  return [storedValue, setValue]
}

export default function Clients() {
  const [clients, setClients] = useLocalStorage<Client[]>('zaru_clients_v1', demoClients)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)

  // Форма
  const [formData, setFormData] = useState<Partial<Client>>({
    type: 'individual',
    name: '',
    phone: '',
    email: '',
    address: '',
    inn: '',
    contactPerson: '',
    notes: ''
  })

  const filteredClients = clients.filter((c) => {
    const matchesSearch = !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search) ||
      c.email?.toLowerCase().includes(search.toLowerCase())
    const matchesType = typeFilter === 'all' || c.type === typeFilter
    return matchesSearch && matchesType
  })

  // Статистика
  const totalClients = clients.length
  const companies = clients.filter((c) => c.type === 'company').length
  const individuals = clients.filter((c) => c.type === 'individual').length
  const totalRevenue = clients.reduce((sum, c) => sum + c.totalAmount, 0)

  const handleOpenAddModal = () => {
    setSelectedClient(null)
    setFormData({
      type: 'individual',
      name: '',
      phone: '',
      email: '',
      address: '',
      inn: '',
      contactPerson: '',
      notes: ''
    })
    setShowModal(true)
  }

  const handleOpenEditModal = (client: Client) => {
    setSelectedClient(client)
    setFormData({ ...client })
    setShowModal(true)
  }

  const handleOpenViewModal = (client: Client) => {
    setSelectedClient(client)
    setShowViewModal(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name || !formData.phone) {
      toast.error('Заполните обязательные поля: Имя и Телефон')
      return
    }

    if (selectedClient) {
      // Редактирование
      setClients(prev => prev.map(c =>
        c.id === selectedClient.id
          ? { ...c, ...formData } as Client
          : c
      ))
      toast.success('Клиент обновлён')
    } else {
      // Добавление
      const newClient: Client = {
        id: Date.now(),
        type: formData.type || 'individual',
        name: formData.name || '',
        inn: formData.inn,
        phone: formData.phone || '',
        email: formData.email || '',
        address: formData.address || '',
        contactPerson: formData.contactPerson,
        contractsCount: 0,
        totalAmount: 0,
        rating: 0,
        notes: formData.notes
      }
      setClients(prev => [...prev, newClient])
      toast.success('Клиент добавлен')
    }

    setShowModal(false)
  }

  const handleDelete = (id: number) => {
    if (confirm('Удалить клиента?')) {
      setClients(prev => prev.filter(c => c.id !== id))
      toast.success('Клиент удалён')
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Заголовок */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-7 h-7 text-emerald-600" />
            Клиенты
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            База заказчиков и контрагентов
          </p>
        </div>
        <button onClick={handleOpenAddModal} className="btn-primary flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Добавить клиента
        </button>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <Users className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Всего клиентов</p>
            <p className="text-xl font-bold text-slate-900 dark:text-white">{totalClients}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
            <Building2 className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Юр. лица</p>
            <p className="text-xl font-bold text-slate-900 dark:text-white">{companies}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <User className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Физ. лица</p>
            <p className="text-xl font-bold text-slate-900 dark:text-white">{individuals}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <DollarSign className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Общий оборот</p>
            <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(totalRevenue)}</p>
          </div>
        </div>
      </div>

      {/* Фильтры */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Поиск по имени, телефону или email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTypeFilter('all')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${typeFilter === 'all'
              ? 'bg-emerald-600 text-white'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
          >
            Все
          </button>
          <button
            onClick={() => setTypeFilter('company')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${typeFilter === 'company'
              ? 'bg-purple-600 text-white'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
          >
            <Building2 className="w-4 h-4" />
            Юр. лица
          </button>
          <button
            onClick={() => setTypeFilter('individual')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${typeFilter === 'individual'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
          >
            <User className="w-4 h-4" />
            Физ. лица
          </button>
        </div>
      </div>

      {/* Список клиентов */}
      <div className="grid gap-4">
        {filteredClients.map((client) => {
          const type = typeConfig[client.type]
          const TypeIcon = type.icon

          return (
            <div key={client.id} className="card p-5 hover:shadow-lg transition-shadow">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                {/* Аватар и тип */}
                <div className={`w-14 h-14 rounded-xl ${type.class} flex items-center justify-center flex-shrink-0`}>
                  <TypeIcon className="w-7 h-7" />
                </div>

                {/* Основная информация */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-semibold text-lg text-slate-900 dark:text-white">
                      {client.name}
                    </h3>
                    {client.rating > 0 && (
                      <div className="flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`w-4 h-4 ${i < client.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'
                              }`}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-slate-400" />
                      <a href={`tel:${client.phone}`} className="hover:text-primary-600">{client.phone}</a>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-slate-400" />
                      <a href={`mailto:${client.email}`} className="hover:text-primary-600">{client.email}</a>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-slate-400" />
                      <span className="truncate">{client.address}</span>
                    </div>
                  </div>

                  {client.type === 'company' && client.contactPerson && (
                    <p className="text-sm text-slate-500 mt-1">
                      Контактное лицо: {client.contactPerson}
                    </p>
                  )}
                </div>

                {/* Статистика клиента */}
                <div className="flex items-center gap-6 lg:gap-8">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                      {client.contractsCount}
                    </p>
                    <p className="text-xs text-slate-500">договоров</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-emerald-600">
                      {formatCurrency(client.totalAmount)}
                    </p>
                    <p className="text-xs text-slate-500">оборот</p>
                  </div>
                </div>

                {/* Действия */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenViewModal(client)}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                    title="Просмотр"
                  >
                    <Eye className="w-5 h-5 text-slate-500" />
                  </button>
                  <Link
                    to="/pipeline"
                    className="p-2 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded-lg text-indigo-600"
                    title="Создать сделку"
                  >
                    <PlusCircle className="w-5 h-5" />
                  </Link>
                  <button
                    onClick={() => handleOpenEditModal(client)}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                    title="Редактировать"
                  >
                    <Edit className="w-5 h-5 text-slate-500" />
                  </button>
                  <button
                    onClick={() => handleDelete(client.id)}
                    className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg"
                    title="Удалить"
                  >
                    <Trash2 className="w-5 h-5 text-red-500" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {filteredClients.length === 0 && (
        <div className="card p-12 text-center">
          <Users className="w-16 h-16 mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
            Клиенты не найдены
          </h3>
          <p className="text-slate-500 mb-6">
            Добавьте первого клиента для начала работы
          </p>
          <button onClick={handleOpenAddModal} className="btn-primary">
            <Plus className="w-4 h-4 mr-2" />
            Добавить клиента
          </button>
        </div>
      )}

      {/* Модалка добавления/редактирования */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">
                {selectedClient ? 'Редактировать клиента' : 'Новый клиент'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Тип клиента *</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as 'individual' | 'company' }))}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="individual">Физическое лицо</option>
                    <option value="company">Юридическое лицо</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">ФИО / Название организации *</label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    placeholder="Иванов Иван Иванович"
                    required
                  />
                </div>
                {formData.type === 'company' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-1">ИНН</label>
                      <input
                        type="text"
                        value={formData.inn || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, inn: e.target.value }))}
                        className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        placeholder="7701234567"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Контактное лицо</label>
                      <input
                        type="text"
                        value={formData.contactPerson || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, contactPerson: e.target.value }))}
                        className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        placeholder="Сидоров А.П."
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">Телефон *</label>
                  <input
                    type="tel"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    placeholder="+7 (999) 123-45-67"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    placeholder="email@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Адрес</label>
                  <input
                    type="text"
                    value={formData.address || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    placeholder="г. Москва, ул. Примерная, д. 1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Заметки</label>
                  <textarea
                    value={formData.notes || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    rows={2}
                    placeholder="Дополнительная информация..."
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
                  Отмена
                </button>
                <button type="submit" className="btn-primary">
                  {selectedClient ? 'Сохранить' : 'Добавить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модалка просмотра */}
      {showViewModal && selectedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowViewModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Информация о клиенте</h2>
              <button onClick={() => setShowViewModal(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-xl ${typeConfig[selectedClient.type].class} flex items-center justify-center`}>
                  {selectedClient.type === 'company' ? <Building2 className="w-8 h-8" /> : <User className="w-8 h-8" />}
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{selectedClient.name}</h3>
                  <span className={`px-2 py-1 text-xs rounded-full ${typeConfig[selectedClient.type].class}`}>
                    {typeConfig[selectedClient.type].label}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-500">Телефон:</span><br /><strong>{selectedClient.phone}</strong></div>
                <div><span className="text-slate-500">Email:</span><br /><strong>{selectedClient.email}</strong></div>
                <div className="col-span-2"><span className="text-slate-500">Адрес:</span><br /><strong>{selectedClient.address}</strong></div>
                {selectedClient.inn && <div><span className="text-slate-500">ИНН:</span><br /><strong>{selectedClient.inn}</strong></div>}
                {selectedClient.contactPerson && <div><span className="text-slate-500">Контактное лицо:</span><br /><strong>{selectedClient.contactPerson}</strong></div>}
              </div>

              <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary-600">{selectedClient.contractsCount}</p>
                  <p className="text-xs text-slate-500">Договоров</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-600">{formatCurrency(selectedClient.totalAmount)}</p>
                  <p className="text-xs text-slate-500">Оборот</p>
                </div>
                <div className="text-center">
                  <div className="flex justify-center">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className={`w-4 h-4 ${i < selectedClient.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}`} />
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">Рейтинг</p>
                </div>
              </div>

              {selectedClient.notes && (
                <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                  <p className="text-sm text-slate-600 dark:text-slate-400">{selectedClient.notes}</p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowViewModal(false)} className="btn-secondary">Закрыть</button>
              <button onClick={() => { setShowViewModal(false); handleOpenEditModal(selectedClient); }} className="btn-primary flex items-center gap-2">
                <Edit className="w-4 h-4" />
                Редактировать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
