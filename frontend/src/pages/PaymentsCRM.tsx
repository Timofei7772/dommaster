import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '@/hooks/useToast'
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api-client'
import { 
  DollarSign, Calendar, Plus, Trash2, CheckCircle2, AlertTriangle, ArrowLeft, Loader2, QrCode, X, Copy, Check
} from 'lucide-react'
import { staggerContainer, fadeInUp, scaleIn } from '@/lib/motion'
import QRCode from 'qrcode'

interface Payment {
  id: number
  project_id: number
  description: string
  planned_date: string
  planned_amount: number
  actual_date?: string
  actual_amount: number
  status: 'planned' | 'paid' | 'delayed'
  paid_at?: string
}

interface Company {
  id: number
  name: string
  bank_details?: string
}

export default function PaymentsCRM() {
  const [searchParams] = useSearchParams()
  const projectId = searchParams.get('projectId')

  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [projectName, setProjectName] = useState('')
  const [company, setCompany] = useState<Company | null>(null)
  
  // Статистика
  const [stats, setStats] = useState({
    total_planned: 0,
    total_paid: 0,
    total_remaining: 0
  })

  // Фильтры дат
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Модальные окна
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [confirmPaymentId, setConfirmPaymentId] = useState<number | null>(null)
  const [actualAmount, setActualAmount] = useState(0)

  const [isQrOpen, setIsQrOpen] = useState(false)
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null)
  const [qrString, setQrString] = useState('')

  // Добавление платежа
  const [description, setDescription] = useState('')
  const [plannedDate, setPlannedDate] = useState('')
  const [plannedAmount, setPlannedAmount] = useState(0)

  const toast = useToast()

  useEffect(() => {
    if (projectId) {
      fetchData()
    }
  }, [projectId, startDate, endDate])

  const fetchData = async () => {
    setLoading(true)
    try {
      const project = await apiGet<any>(`/crm-projects/${projectId}`)
      setProjectName(project.name)
      
      // Ищем данные о компании из профиля
      const profile = await apiGet<any>('/auth/me')
      setCompany(profile.company)

      let path = `/crm-payments/project/${projectId}`
      const params = []
      if (startDate) params.push(`start_date=${startDate}`)
      if (endDate) params.push(`end_date=${endDate}`)
      if (params.length) path += `?${params.join('&')}`

      const statsData = await apiGet<{
        total_planned: number
        total_paid: number
        total_remaining: number
        payments: Payment[]
      }>(path)

      setPayments(statsData.payments)
      setStats({
        total_planned: statsData.total_planned,
        total_paid: statsData.total_paid,
        total_remaining: statsData.total_remaining
      })
    } catch (err: any) {
      toast.error('Ошибка загрузки платежей: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!description || !plannedDate || !plannedAmount) {
      toast.error('Заполните описание, плановую дату и сумму')
      return
    }

    try {
      await apiPost(`/crm-payments/project/${projectId}`, {
        description,
        planned_date: plannedDate,
        planned_amount: Number(plannedAmount)
      })
      toast.success('Платеж успешно запланирован!')
      setDescription('')
      setPlannedDate('')
      setPlannedAmount(0)
      fetchData()
    } catch (err: any) {
      toast.error('Ошибка добавления: ' + err.message)
    }
  }

  const openConfirmModal = (payment: Payment) => {
    setConfirmPaymentId(payment.id)
    setActualAmount(payment.planned_amount)
    setIsConfirmOpen(true)
  }

  const handleConfirmReceived = async () => {
    if (!confirmPaymentId) return
    try {
      await apiPost(`/crm-payments/${confirmPaymentId}/confirm`, {
        actual_amount: Number(actualAmount)
      })
      toast.success('Платеж подтвержден как полученный')
      setIsConfirmOpen(false)
      fetchData()
    } catch (err: any) {
      toast.error('Ошибка подтверждения: ' + err.message)
    }
  }

  const generateQrPayment = async (payment: Payment) => {
    // Реквизиты компании
    const compName = company?.name || 'SmetaAI CRM'
    // Парсим реквизиты (ожидаем формат вида: Р/С=...|БИК=...|Банк=...|КоррСчет=...)
    // По умолчанию сгенерируем тестовый ГОСТ-строку
    const bankDetails = company?.bank_details || 'ИНН=7700000000|Р/С=40702810000000000000|БИК=044525225|К/С=30101810400000000225'
    
    // Сумма в копейках для ГОСТ стандарта
    const sumInKopecks = Math.round(payment.planned_amount * 100)
    
    // Формируем ГОСТ-строку
    // Пример: ST00012|Name=ООО СтройСервис|PersonalAcc=40702810000000000000|BankName=ПАО СБЕРБАНК|BIC=044525225|CorrespAcc=30101810400000000225|Sum=100000|Purpose=Оплата по договору сметы
    const nameMatch = bankDetails.match(/Name=([^|]+)/) || bankDetails.match(/Имя=([^|]+)/)
    const accMatch = bankDetails.match(/PersonalAcc=([^|]+)/) || bankDetails.match(/Р\/С=([^|]+)/)
    const bicMatch = bankDetails.match(/BIC=([^|]+)/) || bankDetails.match(/БИК=([^|]+)/)
    const corrMatch = bankDetails.match(/CorrespAcc=([^|]+)/) || bankDetails.match(/К\/С=([^|]+)/)

    const qrText = `ST00012|Name=${nameMatch ? nameMatch[1] : compName}|PersonalAcc=${accMatch ? accMatch[1] : '40702810000000000000'}|BIC=${bicMatch ? bicMatch[1] : '044525225'}|CorrespAcc=${corrMatch ? corrMatch[1] : '30101810400000000225'}|Sum=${sumInKopecks}|Purpose=Оплата платежа: ${payment.description}`

    try {
      const dataUrl = await QRCode.toDataURL(qrText, { width: 256, margin: 2 })
      setQrString(qrText)
      setQrCodeUrl(dataUrl)
      setIsQrOpen(true)
    } catch (err) {
      toast.error('Не удалось сгенерировать QR код')
    }
  }

  const handleDeletePayment = async (paymentId: number) => {
    if (!confirm('Удалить этот платеж из графика?')) return
    try {
      await apiDelete(`/crm-payments/${paymentId}`)
      toast.success('Платеж удален')
      fetchData()
    } catch (err: any) {
      toast.error('Ошибка удаления: ' + err.message)
    }
  }

  if (!projectId) {
    return (
      <div className="p-8 text-center text-slate-500">
        Укажите идентификатор проекта (?projectId=...) для просмотра его платежей
      </div>
    )
  }

  return (
    <motion.div 
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-6 text-slate-800 dark:text-slate-100"
    >
      {/* Header with back navigation */}
      <div className="flex items-center gap-4">
        <Link 
          to="/crm"
          className="p-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </Link>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">График проектных платежей</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Проект: {projectName || 'Загрузка...'}</p>
        </div>
      </div>

      {/* Stats banners */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Запланировано всего', value: stats.total_planned, color: 'text-slate-900 dark:text-white', border: 'border-slate-200' },
          { label: 'Получено платежей', value: stats.total_paid, color: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-500/20' },
          { label: 'Остаток к получению', value: stats.total_remaining, color: 'text-violet-600 dark:text-violet-400', border: 'border-violet-200 dark:border-violet-500/20' },
        ].map((stat, i) => (
          <div key={i} className={`bg-white dark:bg-slate-800 border ${stat.border} rounded-2xl p-5 shadow-sm`}>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value.toLocaleString()} ₽</p>
          </div>
        ))}
      </div>

      {/* Filter and Add Block */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Add Payment Form */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Запланировать новый платеж</h3>
          <form onSubmit={handleAddPayment} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Назначение платежа</label>
              <input
                type="text"
                required
                placeholder="Предоплата за кровлю / Этап 1..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-violet-500 text-slate-950 dark:text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Плановая дата</label>
                <input
                  type="date"
                  required
                  value={plannedDate}
                  onChange={(e) => setPlannedDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-violet-500 text-slate-950 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Сумма (₽)</label>
                <input
                  type="number"
                  required
                  placeholder="0"
                  value={plannedAmount || ''}
                  onChange={(e) => setPlannedAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-violet-500 text-slate-950 dark:text-white"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold shadow-sm flex items-center justify-center gap-1.5 transition-colors mt-2"
            >
              <Plus className="w-4 h-4" />
              Добавить в график
            </button>
          </form>
        </div>

        {/* Payments Table and Date Filters */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between">
          <div>
            {/* Header + Date Filter */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">График оплат</h3>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-2 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs"
                />
                <span className="text-slate-400 text-xs">до</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-2 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs"
                />
                {(startDate || endDate) && (
                  <button 
                    onClick={() => { setStartDate(''); setEndDate('') }}
                    className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400"
                  >
                    Сбросить
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-center text-slate-500 flex justify-center items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
                Загрузка платежей...
              </div>
            ) : payments.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                Платежи за выбранный период отсутствуют.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50/50 dark:bg-slate-800/30 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-100 dark:border-slate-700">
                      <th className="px-5 py-3">Описание платежа</th>
                      <th className="px-5 py-3">Планируемый срок</th>
                      <th className="px-5 py-3 text-right">Сумма (₽)</th>
                      <th className="px-5 py-3">Статус</th>
                      <th className="px-5 py-3 text-right">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {payments.map((payment) => {
                      const isPaid = payment.status === 'paid'
                      return (
                        <tr key={payment.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/20 transition-colors">
                          <td className="px-5 py-3.5 font-medium">{payment.description}</td>
                          <td className="px-5 py-3.5 text-slate-500 text-xs">
                            {payment.planned_date}
                          </td>
                          <td className="px-5 py-3.5 text-right font-semibold">
                            {isPaid ? payment.actual_amount.toLocaleString() : payment.planned_amount.toLocaleString()}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${
                              isPaid 
                                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                                : payment.status === 'delayed'
                                ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                                : 'bg-slate-500/10 text-slate-500 border-slate-500/20'
                            }`}>
                              {isPaid ? 'Получен' : payment.status === 'delayed' ? 'Просрочен' : 'Планируется'}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex justify-end gap-1">
                              {!isPaid && (
                                <>
                                  <button
                                    onClick={() => openConfirmModal(payment)}
                                    className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg transition-colors"
                                    title="Подтвердить получение"
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => generateQrPayment(payment)}
                                    className="p-1.5 text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-500/10 rounded-lg transition-colors"
                                    title="Сгенерировать QR код оплаты"
                                  >
                                    <QrCode className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => handleDeletePayment(payment.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors"
                                title="Удалить"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- CONFIRM PAYMENT RECEIVED MODAL --- */}
      <AnimatePresence>
        {isConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
            <motion.div
              variants={scaleIn}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden p-6"
            >
              <h3 className="font-bold text-lg text-slate-950 dark:text-white mb-2">Подтверждение оплаты</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Укажите фактически полученную сумму платежа для регистрации в финансах проекта.</p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Сумма перевода (₽)</label>
                  <input
                    type="number"
                    value={actualAmount}
                    onChange={(e) => setActualAmount(Number(e.target.value))}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-950 dark:text-white focus:outline-none"
                  />
                </div>
                
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => setIsConfirmOpen(false)}
                    className="px-4 py-2 border border-slate-200 dark:border-slate-700 dark:text-slate-300 hover:bg-slate-50 rounded-xl text-sm font-medium"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={handleConfirmReceived}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium"
                  >
                    Провести платеж
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- QR PAYMENT CODE GENERATOR MODAL --- */}
      <AnimatePresence>
        {isQrOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
            <motion.div
              variants={scaleIn}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden p-6 flex flex-col items-center text-center"
            >
              <div className="flex justify-between items-center w-full mb-4">
                <h3 className="font-bold text-lg text-slate-950 dark:text-white">QR код для оплаты клиентом</h3>
                <button onClick={() => setIsQrOpen(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
                Клиент может отсканировать этот QR-код камерой любого мобильного банка РФ (Сбербанк, Тинькофф, ВТБ и др.) для автоматического заполнения реквизитов платежа.
              </p>

              {qrCodeUrl ? (
                <div className="bg-white p-3 rounded-2xl border border-slate-200 mb-6 shadow-sm">
                  <img src={qrCodeUrl} alt="QR Code" className="w-56 h-56" />
                </div>
              ) : (
                <div className="w-56 h-56 flex items-center justify-center bg-slate-50 rounded-2xl mb-6">
                  <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                </div>
              )}

              <div className="w-full text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 mb-6 text-left break-all font-mono select-all">
                {qrString}
              </div>

              <button
                onClick={() => setIsQrOpen(false)}
                className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                Готово
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
