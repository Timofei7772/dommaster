import { useState } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { 
  Users, 
  Search, 
  Plus, 
  Phone, 
  Star,
  MoreVertical,
  Edit,
  Trash2,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  Briefcase,
  MapPin,
  Zap,
  Award,
  TrendingUp,
  DollarSign,
  UserCheck,
} from 'lucide-react'
import toast from 'react-hot-toast'

type WorkerStatus = 'available' | 'busy' | 'vacation' | 'inactive'
type WorkerType = 'individual' | 'brigade'

interface Worker {
  id: number
  name: string
  type: WorkerType
  phone: string
  specializations: string[]
  rating: number
  completedProjects: number
  currentProject?: string
  hourlyRate: number
  status: WorkerStatus
  location: string
  experience: number // лет
  notes: string
  availability: string // когда освободится
  priceAgreement: number // % скидки от базовой цены
}

// Демо данные
const demoWorkers: Worker[] = [
  {
    id: 1,
    name: 'Бригада "Мастер-Строй"',
    type: 'brigade',
    phone: '+7 (916) 111-22-33',
    specializations: ['Штукатурные', 'Малярные', 'Плиточные'],
    rating: 4.9,
    completedProjects: 156,
    hourlyRate: 800,
    status: 'available',
    location: 'Москва, выезд в область',
    experience: 12,
    notes: 'Лучшая бригада! Всегда качественно и в срок',
    availability: 'Свободны сейчас',
    priceAgreement: 15
  },
  {
    id: 2,
    name: 'Петров Сергей Иванович',
    type: 'individual',
    phone: '+7 (903) 222-33-44',
    specializations: ['Электрика', 'Слаботочка'],
    rating: 4.8,
    completedProjects: 89,
    currentProject: 'ЖК "Солнечный" кв. 45',
    hourlyRate: 1200,
    status: 'busy',
    location: 'Москва',
    experience: 15,
    notes: 'Профи в электрике, сертификаты, допуски',
    availability: 'Освободится 20.01.2026',
    priceAgreement: 10
  },
  {
    id: 3,
    name: 'Бригада "СантехПро"',
    type: 'brigade',
    phone: '+7 (925) 333-44-55',
    specializations: ['Сантехника', 'Отопление', 'Канализация'],
    rating: 4.6,
    completedProjects: 78,
    hourlyRate: 900,
    status: 'available',
    location: 'Москва и МО',
    experience: 8,
    notes: 'Работают с любыми брендами сантехники',
    availability: 'Свободны с 15.01',
    priceAgreement: 12
  },
  {
    id: 4,
    name: 'Кузнецов Дмитрий',
    type: 'individual',
    phone: '+7 (926) 444-55-66',
    specializations: ['Плиточные работы', 'Мозаика'],
    rating: 5.0,
    completedProjects: 234,
    currentProject: 'Частный дом, Рублёвка',
    hourlyRate: 1500,
    status: 'busy',
    location: 'Москва, элитные объекты',
    experience: 20,
    notes: 'Топовый плиточник, работает на премиум объектах',
    availability: 'Запись на февраль',
    priceAgreement: 5
  },
  {
    id: 5,
    name: 'Бригада "Потолки-Монтаж"',
    type: 'brigade',
    phone: '+7 (916) 555-66-77',
    specializations: ['Натяжные потолки', 'ГКЛ потолки', 'Многоуровневые'],
    rating: 4.7,
    completedProjects: 312,
    hourlyRate: 600,
    status: 'available',
    location: 'Вся Москва и МО',
    experience: 10,
    notes: 'Быстрый монтаж, гарантия 10 лет',
    availability: 'Выезд в день заказа',
    priceAgreement: 20
  },
  {
    id: 6,
    name: 'Иванов Алексей',
    type: 'individual',
    phone: '+7 (903) 666-77-88',
    specializations: ['Демонтаж', 'Вынос мусора'],
    rating: 4.3,
    completedProjects: 45,
    hourlyRate: 500,
    status: 'vacation',
    location: 'Москва',
    experience: 5,
    notes: 'В отпуске до конца января',
    availability: '01.02.2026',
    priceAgreement: 25
  },
  {
    id: 7,
    name: 'Сидоров Михаил',
    type: 'individual',
    phone: '+7 (926) 777-88-99',
    specializations: ['Малярные', 'Штукатурные'],
    rating: 3.5,
    completedProjects: 12,
    hourlyRate: 450,
    status: 'inactive',
    location: 'Москва',
    experience: 2,
    notes: 'Больше не работаем - низкое качество',
    availability: '-',
    priceAgreement: 0
  },
]

const statusConfig: Record<WorkerStatus, { label: string; color: string; icon: typeof CheckCircle }> = {
  available: { label: 'Свободен', color: 'text-green-600 bg-green-100 dark:bg-green-900/30', icon: CheckCircle },
  busy: { label: 'Занят', color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30', icon: Clock },
  vacation: { label: 'Отпуск', color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30', icon: Calendar },
  inactive: { label: 'Неактивен', color: 'text-red-600 bg-red-100 dark:bg-red-900/30', icon: XCircle },
}

export default function Workers() {
  const [workers, setWorkers] = useLocalStorage<Worker[]>('zaru_workers_v1', demoWorkers)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<WorkerStatus | 'all'>('all')
  const [filterSpec, setFilterSpec] = useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null)
  const [showMenu, setShowMenu] = useState<number | null>(null)
  const [workerName, setWorkerName] = useState('')
  const [workerRating, setWorkerRating] = useState<number | ''>(
    ''
  )
  const [workerPhone, setWorkerPhone] = useState('')
  const [workerHourlyRate, setWorkerHourlyRate] = useState<number | ''>(
    ''
  )
  const [workerAvailability, setWorkerAvailability] = useState('')
  const [workerDiscount, setWorkerDiscount] = useState<number | ''>(
    ''
  )

  // Все специализации
  const allSpecs = Array.from(new Set(workers.flatMap(w => w.specializations)))

  // Фильтрация
  const filteredWorkers = workers.filter(w => {
    const matchesSearch = !search || 
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.specializations.some(s => s.toLowerCase().includes(search.toLowerCase()))
    const matchesStatus = filterStatus === 'all' || w.status === filterStatus
    const matchesSpec = filterSpec === 'all' || w.specializations.includes(filterSpec)
    return matchesSearch && matchesStatus && matchesSpec
  })

  // Статистика
  const stats = {
    total: workers.length,
    available: workers.filter(w => w.status === 'available').length,
    busy: workers.filter(w => w.status === 'busy').length,
    avgRating: (workers.reduce((sum, w) => sum + w.rating, 0) / workers.length).toFixed(1)
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
    if (confirm('Удалить мастера?')) {
      setWorkers(prev => prev.filter(w => w.id !== id))
      toast.success('Мастер удалён')
    }
    setShowMenu(null)
  }

  const handleCall = (phone: string, name: string) => {
    toast.success(`Звоним: ${name}`)
    window.open(`tel:${phone}`, '_self')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!workerName || !workerPhone || !workerHourlyRate || !workerAvailability) {
      toast.error('Пожалуйста, заполните все обязательные поля.');
      return;
    }

    const newWorker = {
      id: selectedWorker?.id || Date.now(),
      name: workerName,
      phone: workerPhone,
      hourlyRate: workerHourlyRate,
      availability: workerAvailability,
      discount: workerDiscount || 0,
      rating: workerRating || 0,
      type: selectedWorker?.type || 'individual',
      specializations: selectedWorker?.specializations || [],
      completedProjects: selectedWorker?.completedProjects || 0,
      status: selectedWorker?.status || 'available',
      location: selectedWorker?.location || '',
      experience: selectedWorker?.experience || 0,
      notes: selectedWorker?.notes || '',
      priceAgreement: workerDiscount || 0,
    };

    if (selectedWorker) {
      setWorkers(prev => prev.map(w => w.id === selectedWorker.id ? newWorker : w));
      toast.success('Мастер успешно обновлён!')
    } else {
      setWorkers(prev => [...prev, newWorker]);
      toast.success('Мастер успешно добавлен!')
    }

    setShowModal(false);
    resetForm();
  }

  const resetForm = () => {
    setWorkerName('');
    setWorkerPhone('');
    setWorkerHourlyRate(0);
    setWorkerAvailability('');
    setWorkerDiscount(0);
    setWorkerRating(0);
    setSelectedWorker(null);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Заголовок */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-7 h-7 text-primary-600" />
            Рабочие и Мастера
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            База исполнителей для ваших проектов
          </p>
        </div>
        <button
          onClick={() => {
            setSelectedWorker(null)
            setShowModal(true)
          }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Добавить мастера
        </button>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-sm text-slate-500">Всего мастеров</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.available}</p>
              <p className="text-sm text-slate-500">Свободны</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.busy}</p>
              <p className="text-sm text-slate-500">На объектах</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
              <Star className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.avgRating}</p>
              <p className="text-sm text-slate-500">Средний рейтинг</p>
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
            placeholder="Поиск по имени или специализации..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as WorkerStatus | 'all')}
          className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
        >
          <option value="all">Все статусы</option>
          <option value="available">🟢 Свободны</option>
          <option value="busy">🟡 Заняты</option>
          <option value="vacation">🔵 В отпуске</option>
          <option value="inactive">🔴 Неактивны</option>
        </select>
        <select
          value={filterSpec}
          onChange={(e) => setFilterSpec(e.target.value)}
          className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
        >
          <option value="all">Все специализации</option>
          {allSpecs.map(spec => (
            <option key={spec} value={spec}>{spec}</option>
          ))}
        </select>
      </div>

      {/* Список мастеров */}
      <div className="grid gap-4">
        {filteredWorkers.map(worker => {
          const statusCfg = statusConfig[worker.status]
          const StatusIcon = statusCfg.icon
          
          return (
            <div 
              key={worker.id}
              className={`card p-5 hover:shadow-lg transition-all ${
                worker.status === 'inactive' ? 'opacity-60' : ''
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                {/* Основная информация */}
                <div className="flex-1">
                  <div className="flex items-start gap-3">
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                      worker.type === 'brigade' 
                        ? 'bg-purple-100 dark:bg-purple-900/30' 
                        : 'bg-blue-100 dark:bg-blue-900/30'
                    }`}>
                      {worker.type === 'brigade' ? (
                        <Users className="w-7 h-7 text-purple-600" />
                      ) : (
                        <Users className="w-7 h-7 text-blue-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-lg">{worker.name}</h3>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${statusCfg.color} flex items-center gap-1`}>
                          <StatusIcon className="w-3 h-3" />
                          {statusCfg.label}
                        </span>
                        {worker.type === 'brigade' && (
                          <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded-full">
                            Бригада
                          </span>
                        )}
                        {worker.rating >= 4.8 && (
                          <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 rounded-full flex items-center gap-1">
                            <Award className="w-3 h-3" />
                            Топ
                          </span>
                        )}
                      </div>
                      
                      {renderStars(worker.rating)}
                      
                      <div className="flex flex-wrap gap-1 mt-3">
                        {worker.specializations.map(spec => (
                          <span key={spec} className="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center gap-1">
                            <Zap className="w-3 h-3 text-primary-500" />
                            {spec}
                          </span>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-4 mt-3 text-sm">
                        <button
                          onClick={() => handleCall(worker.phone, worker.name)}
                          className="flex items-center gap-1 text-primary-600 hover:underline"
                        >
                          <Phone className="w-4 h-4" />
                          {worker.phone}
                        </button>
                        <span className="flex items-center gap-1 text-slate-500">
                          <MapPin className="w-4 h-4" />
                          {worker.location}
                        </span>
                        <span className="flex items-center gap-1 text-slate-500">
                          <Briefcase className="w-4 h-4" />
                          {worker.experience} лет опыта
                        </span>
                      </div>

                      {worker.currentProject && (
                        <div className="mt-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-sm">
                          <span className="text-amber-600 font-medium">Текущий объект:</span> {worker.currentProject}
                        </div>
                      )}

                      {worker.notes && (
                        <p className="mt-2 text-sm text-slate-500 italic">
                          💬 {worker.notes}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Статистика и цены */}
                <div className="flex flex-col gap-3 lg:items-end lg:min-w-[220px] border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-700 pt-4 lg:pt-0 lg:pl-4">
                  <div className="grid grid-cols-2 gap-4 text-sm w-full">
                    <div className="text-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <p className="text-slate-500 text-xs">Проектов</p>
                      <p className="font-bold text-lg">{worker.completedProjects}</p>
                    </div>
                    <div className="text-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <p className="text-slate-500 text-xs">Ставка/час</p>
                      <p className="font-bold text-lg text-green-600">{worker.hourlyRate}₽</p>
                    </div>
                  </div>

                  <div className="w-full p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-green-700 dark:text-green-400">Скидка от базы</span>
                      <span className="font-bold text-green-600">-{worker.priceAgreement}%</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-slate-500 w-full">
                    <Calendar className="w-4 h-4" />
                    <span>{worker.availability}</span>
                  </div>

                  {/* Кнопки действий */}
                  <div className="flex gap-2 w-full">
                    <button
                      onClick={() => handleCall(worker.phone, worker.name)}
                      className="flex-1 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center justify-center gap-1"
                    >
                      <Phone className="w-4 h-4" />
                      Позвонить
                    </button>
                    <div className="relative">
                      <button
                        onClick={() => setShowMenu(showMenu === worker.id ? null : worker.id)}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                      >
                        <MoreVertical className="w-5 h-5" />
                      </button>
                      
                      {showMenu === worker.id && (
                        <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-10">
                          <button
                            onClick={() => {
                              setSelectedWorker(worker)
                              setShowModal(true)
                              setShowMenu(null)
                            }}
                            className="w-full px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                          >
                            <Edit className="w-4 h-4" />
                            Редактировать
                          </button>
                          <button
                            onClick={() => toast.success('Открываем историю проектов')}
                            className="w-full px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                          >
                            <TrendingUp className="w-4 h-4" />
                            История проектов
                          </button>
                          <button
                            onClick={() => toast.success('Назначаем на проект')}
                            className="w-full px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
                          >
                            <Briefcase className="w-4 h-4" />
                            Назначить на проект
                          </button>
                          <button
                            onClick={() => handleDelete(worker.id)}
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
            </div>
          )
        })}
      </div>

      {filteredWorkers.length === 0 && (
        <div className="card p-12 text-center">
          <Users className="w-12 h-12 mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500">Мастера не найдены</p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 text-primary-600 hover:underline"
          >
            Добавить первого мастера
          </button>
        </div>
      )}

      {/* Подсказка */}
      <div className="card p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-100 dark:border-green-800">
        <div className="flex items-center gap-3">
          <DollarSign className="w-5 h-5 text-green-600" />
          <div>
            <p className="font-medium text-green-900 dark:text-green-100">
              Скидка от базы — ваша договорённость с мастером
            </p>
            <p className="text-sm text-green-700 dark:text-green-300">
              Это процент, на который мастер согласен работать дешевле базовых расценок
            </p>
          </div>
        </div>
      </div>

      {/* Модалка */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4">
              {selectedWorker ? 'Редактировать мастера' : 'Новый мастер'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Имя мастера *</label>
                  <input
                    type="text"
                    value={workerName}
                    onChange={(e) => setWorkerName(e.target.value)}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Рейтинг</label>
                  <input
                    type="number"
                    value={workerRating}
                    onChange={(e) => setWorkerRating(Number(e.target.value))}
                    className="input"
                    min="0"
                    max="5"
                    step="0.1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Телефон *</label>
                  <input
                    type="tel"
                    value={workerPhone}
                    onChange={(e) => setWorkerPhone(e.target.value)}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Ставка/час *</label>
                  <input
                    type="number"
                    value={workerHourlyRate}
                    onChange={(e) => setWorkerHourlyRate(Number(e.target.value))}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Доступность *</label>
                  <input
                    type="text"
                    value={workerAvailability}
                    onChange={(e) => setWorkerAvailability(e.target.value)}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Скидка от базы (%)</label>
                  <input
                    type="number"
                    value={workerDiscount}
                    onChange={(e) => setWorkerDiscount(Number(e.target.value))}
                    className="input"
                    min="0"
                    max="100"
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

