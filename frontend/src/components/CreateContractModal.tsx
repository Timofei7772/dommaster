import { useState } from 'react'
import {
  X,
  FileText,
  User,
  Building2,
  MapPin,
  
  Briefcase,
  CreditCard,
  FileSignature,
  Check,
  ChevronRight,
  Sparkles
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface CreateContractModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (contract: ContractData) => void
  estimateData?: {
    id: number
    name: string
    total: number
    works: Array<{ name: string; unit: string; quantity: number; price: number; total: number }>
  }
}

interface ContractData {
  type: 'individual' | 'legal' | 'ip'
  number: string
  date: string
  
  // Заказчик
  customerType: 'individual' | 'legal' | 'ip'
  customerName: string
  customerPassport?: string
  customerAddress: string
  customerPhone: string
  customerEmail?: string
  customerInn?: string
  customerKpp?: string
  customerOgrn?: string
  customerBank?: string
  customerBik?: string
  customerAccount?: string
  customerDirector?: string
  customerDirectorBasis?: string
  
  // Объект
  objectName: string
  objectAddress: string
  
  // Сроки и оплата
  startDate: string
  endDate: string
  totalAmount: number
  prepaymentPercent: number
  prepaymentAmount: number
  warrantyMonths: number
  
  // Дополнительно
  additionalTerms?: string
}

const customerTypes = [
  { 
    id: 'individual', 
    name: 'Физическое лицо', 
    desc: 'Гражданин РФ', 
    icon: User,
    color: 'from-blue-500 to-cyan-500'
  },
  { 
    id: 'legal', 
    name: 'Юридическое лицо', 
    desc: 'ООО, АО, ПАО и др.', 
    icon: Building2,
    color: 'from-purple-500 to-pink-500'
  },
  { 
    id: 'ip', 
    name: 'ИП', 
    desc: 'Индивидуальный предприниматель', 
    icon: Briefcase,
    color: 'from-amber-500 to-orange-500'
  },
]

export default function CreateContractModal({ isOpen, onClose, onSave, estimateData }: CreateContractModalProps) {
  const [step, setStep] = useState(1)
  const [contract, setContract] = useState<Partial<ContractData>>({
    type: 'individual',
    customerType: 'individual',
    number: `Д-${String(Date.now()).slice(-6)}/2026`,
    date: new Date().toISOString().split('T')[0],
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    totalAmount: estimateData?.total || 0,
    prepaymentPercent: 50,
    prepaymentAmount: (estimateData?.total || 0) * 0.5,
    warrantyMonths: 12,
  })

  if (!isOpen) return null

  const updateContract = (updates: Partial<ContractData>) => {
    setContract(prev => {
      const newContract = { ...prev, ...updates }
      // Пересчёт аванса при изменении процента
      if (updates.prepaymentPercent !== undefined) {
        newContract.prepaymentAmount = (newContract.totalAmount || 0) * (updates.prepaymentPercent / 100)
      }
      if (updates.totalAmount !== undefined && newContract.prepaymentPercent) {
        newContract.prepaymentAmount = updates.totalAmount * (newContract.prepaymentPercent / 100)
      }
      return newContract
    })
  }

  const handleSave = () => {
    onSave(contract as ContractData)
    onClose()
  }

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold mb-2">Выберите тип заказчика</h3>
        <p className="text-sm text-slate-500">От этого зависит форма договора и необходимые реквизиты</p>
      </div>
      
      <div className="grid gap-4">
        {customerTypes.map(type => (
          <button
            key={type.id}
            onClick={() => {
              updateContract({ customerType: type.id as ContractData['customerType'] })
              setStep(2)
            }}
            className={cn(
              "flex items-center gap-4 p-5 rounded-xl border-2 transition-all text-left group hover:shadow-lg",
              contract.customerType === type.id 
                ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20" 
                : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
            )}
          >
            <div className={cn(
              "w-14 h-14 rounded-xl bg-gradient-to-br flex items-center justify-center",
              type.color
            )}>
              <type.icon className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-slate-900 dark:text-white">{type.name}</h4>
              <p className="text-sm text-slate-500">{type.desc}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:translate-x-1 transition-transform" />
          </button>
        ))}
      </div>
    </div>
  )

  const renderStep2Individual = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <User className="w-5 h-5 text-blue-500" />
        <h3 className="font-semibold">Данные заказчика (физ. лицо)</h3>
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-1">ФИО полностью *</label>
        <input
          type="text"
          value={contract.customerName || ''}
          onChange={e => updateContract({ customerName: e.target.value })}
          className="input"
          placeholder="Иванов Иван Иванович"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-1">Паспортные данные *</label>
        <input
          type="text"
          value={contract.customerPassport || ''}
          onChange={e => updateContract({ customerPassport: e.target.value })}
          className="input"
          placeholder="серия 4515 № 123456, выдан ОВД г. Москвы 01.01.2020"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-1">Адрес регистрации *</label>
        <input
          type="text"
          value={contract.customerAddress || ''}
          onChange={e => updateContract({ customerAddress: e.target.value })}
          className="input"
          placeholder="г. Москва, ул. Примерная, д. 1, кв. 1"
        />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Телефон *</label>
          <input
            type="tel"
            value={contract.customerPhone || ''}
            onChange={e => updateContract({ customerPhone: e.target.value })}
            className="input"
            placeholder="+7 (999) 123-45-67"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">E-mail</label>
          <input
            type="email"
            value={contract.customerEmail || ''}
            onChange={e => updateContract({ customerEmail: e.target.value })}
            className="input"
            placeholder="email@example.com"
          />
        </div>
      </div>
    </div>
  )

  const renderStep2Legal = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Building2 className="w-5 h-5 text-purple-500" />
        <h3 className="font-semibold">Данные заказчика (юр. лицо)</h3>
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-1">Полное наименование *</label>
        <input
          type="text"
          value={contract.customerName || ''}
          onChange={e => updateContract({ customerName: e.target.value })}
          className="input"
          placeholder='ООО "Название компании"'
        />
      </div>
      
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">ИНН *</label>
          <input
            type="text"
            value={contract.customerInn || ''}
            onChange={e => updateContract({ customerInn: e.target.value })}
            className="input"
            placeholder="7712345678"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">КПП *</label>
          <input
            type="text"
            value={contract.customerKpp || ''}
            onChange={e => updateContract({ customerKpp: e.target.value })}
            className="input"
            placeholder="771201001"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">ОГРН</label>
          <input
            type="text"
            value={contract.customerOgrn || ''}
            onChange={e => updateContract({ customerOgrn: e.target.value })}
            className="input"
            placeholder="1027700000000"
          />
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-1">Юридический адрес *</label>
        <input
          type="text"
          value={contract.customerAddress || ''}
          onChange={e => updateContract({ customerAddress: e.target.value })}
          className="input"
          placeholder="123456, г. Москва, ул. Примерная, д. 1, офис 1"
        />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Руководитель *</label>
          <input
            type="text"
            value={contract.customerDirector || ''}
            onChange={e => updateContract({ customerDirector: e.target.value })}
            className="input"
            placeholder="Генеральный директор Иванов И.И."
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Действует на основании</label>
          <input
            type="text"
            value={contract.customerDirectorBasis || ''}
            onChange={e => updateContract({ customerDirectorBasis: e.target.value })}
            className="input"
            placeholder="Устава"
          />
        </div>
      </div>
      
      <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
        <p className="text-sm font-medium mb-2 flex items-center gap-2">
          <CreditCard className="w-4 h-4" /> Банковские реквизиты
        </p>
        <div className="grid grid-cols-2 gap-3">
          <input
            type="text"
            value={contract.customerBank || ''}
            onChange={e => updateContract({ customerBank: e.target.value })}
            className="input"
            placeholder="Название банка"
          />
          <input
            type="text"
            value={contract.customerBik || ''}
            onChange={e => updateContract({ customerBik: e.target.value })}
            className="input"
            placeholder="БИК"
          />
          <input
            type="text"
            value={contract.customerAccount || ''}
            onChange={e => updateContract({ customerAccount: e.target.value })}
            className="input col-span-2"
            placeholder="Расчётный счёт"
          />
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Телефон</label>
          <input
            type="tel"
            value={contract.customerPhone || ''}
            onChange={e => updateContract({ customerPhone: e.target.value })}
            className="input"
            placeholder="+7 (495) 123-45-67"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">E-mail</label>
          <input
            type="email"
            value={contract.customerEmail || ''}
            onChange={e => updateContract({ customerEmail: e.target.value })}
            className="input"
            placeholder="info@company.ru"
          />
        </div>
      </div>
    </div>
  )

  const renderStep2IP = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Briefcase className="w-5 h-5 text-amber-500" />
        <h3 className="font-semibold">Данные заказчика (ИП)</h3>
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-1">ФИО ИП полностью *</label>
        <input
          type="text"
          value={contract.customerName || ''}
          onChange={e => updateContract({ customerName: e.target.value })}
          className="input"
          placeholder="ИП Иванов Иван Иванович"
        />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">ИНН *</label>
          <input
            type="text"
            value={contract.customerInn || ''}
            onChange={e => updateContract({ customerInn: e.target.value })}
            className="input"
            placeholder="771234567890"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">ОГРНИП</label>
          <input
            type="text"
            value={contract.customerOgrn || ''}
            onChange={e => updateContract({ customerOgrn: e.target.value })}
            className="input"
            placeholder="312774600000000"
          />
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-1">Адрес регистрации *</label>
        <input
          type="text"
          value={contract.customerAddress || ''}
          onChange={e => updateContract({ customerAddress: e.target.value })}
          className="input"
          placeholder="123456, г. Москва, ул. Примерная, д. 1"
        />
      </div>
      
      <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
        <p className="text-sm font-medium mb-2 flex items-center gap-2">
          <CreditCard className="w-4 h-4" /> Банковские реквизиты
        </p>
        <div className="grid grid-cols-2 gap-3">
          <input
            type="text"
            value={contract.customerBank || ''}
            onChange={e => updateContract({ customerBank: e.target.value })}
            className="input"
            placeholder="Название банка"
          />
          <input
            type="text"
            value={contract.customerBik || ''}
            onChange={e => updateContract({ customerBik: e.target.value })}
            className="input"
            placeholder="БИК"
          />
          <input
            type="text"
            value={contract.customerAccount || ''}
            onChange={e => updateContract({ customerAccount: e.target.value })}
            className="input col-span-2"
            placeholder="Расчётный счёт"
          />
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Телефон *</label>
          <input
            type="tel"
            value={contract.customerPhone || ''}
            onChange={e => updateContract({ customerPhone: e.target.value })}
            className="input"
            placeholder="+7 (999) 123-45-67"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">E-mail</label>
          <input
            type="email"
            value={contract.customerEmail || ''}
            onChange={e => updateContract({ customerEmail: e.target.value })}
            className="input"
            placeholder="ip@example.com"
          />
        </div>
      </div>
    </div>
  )

  const renderStep3 = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <MapPin className="w-5 h-5 text-green-500" />
        <h3 className="font-semibold">Объект и условия договора</h3>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Номер договора</label>
          <input
            type="text"
            value={contract.number || ''}
            onChange={e => updateContract({ number: e.target.value })}
            className="input"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Дата договора</label>
          <input
            type="date"
            value={contract.date || ''}
            onChange={e => updateContract({ date: e.target.value })}
            className="input"
          />
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-1">Наименование объекта *</label>
        <input
          type="text"
          value={contract.objectName || ''}
          onChange={e => updateContract({ objectName: e.target.value })}
          className="input"
          placeholder="Капитальный ремонт квартиры"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-1">Адрес объекта *</label>
        <input
          type="text"
          value={contract.objectAddress || ''}
          onChange={e => updateContract({ objectAddress: e.target.value })}
          className="input"
          placeholder="г. Москва, ул. Новая, д. 5, кв. 123"
        />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Дата начала работ</label>
          <input
            type="date"
            value={contract.startDate || ''}
            onChange={e => updateContract({ startDate: e.target.value })}
            className="input"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Дата окончания работ</label>
          <input
            type="date"
            value={contract.endDate || ''}
            onChange={e => updateContract({ endDate: e.target.value })}
            className="input"
          />
        </div>
      </div>
      
      <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl">
        <p className="text-sm font-medium mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-green-600" /> Стоимость и оплата
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Сумма договора</label>
            <input
              type="number"
              value={contract.totalAmount || 0}
              onChange={e => updateContract({ totalAmount: parseFloat(e.target.value) || 0 })}
              className="input font-semibold"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Аванс, %</label>
            <input
              type="number"
              min="0"
              max="100"
              value={contract.prepaymentPercent || 0}
              onChange={e => updateContract({ prepaymentPercent: parseFloat(e.target.value) || 0 })}
              className="input"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Сумма аванса</label>
            <input
              type="number"
              value={contract.prepaymentAmount || 0}
              readOnly
              className="input bg-slate-100 dark:bg-slate-700"
            />
          </div>
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-1">Гарантийный срок (мес.)</label>
        <input
          type="number"
          min="0"
          value={contract.warrantyMonths || 12}
          onChange={e => updateContract({ warrantyMonths: parseInt(e.target.value) || 0 })}
          className="input w-32"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-1">Дополнительные условия</label>
        <textarea
          value={contract.additionalTerms || ''}
          onChange={e => updateContract({ additionalTerms: e.target.value })}
          className="input min-h-[80px]"
          placeholder="Укажите особые условия договора..."
        />
      </div>
    </div>
  )

  const renderStep2 = () => {
    switch (contract.customerType) {
      case 'individual': return renderStep2Individual()
      case 'legal': return renderStep2Legal()
      case 'ip': return renderStep2IP()
      default: return renderStep2Individual()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <FileSignature className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-lg">Новый договор подряда</h2>
              <p className="text-sm text-slate-500">Шаг {step} из 3</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Progress */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map(s => (
              <div key={s} className="flex-1 flex items-center gap-2">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                  s < step ? "bg-green-500 text-white" :
                  s === step ? "bg-indigo-600 text-white" :
                  "bg-slate-200 dark:bg-slate-700 text-slate-500"
                )}>
                  {s < step ? <Check className="w-4 h-4" /> : s}
                </div>
                {s < 3 && (
                  <div className={cn(
                    "flex-1 h-1 rounded",
                    s < step ? "bg-green-500" : "bg-slate-200 dark:bg-slate-700"
                  )} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1 text-xs text-slate-500">
            <span>Тип заказчика</span>
            <span>Реквизиты</span>
            <span>Условия</span>
          </div>
        </div>
        
        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[50vh]">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </div>
        
        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
          <button
            onClick={() => step > 1 ? setStep(step - 1) : onClose()}
            className="btn-secondary"
          >
            {step > 1 ? 'Назад' : 'Отмена'}
          </button>
          
          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="btn-primary flex items-center gap-2"
            >
              Далее
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSave}
              className="btn-primary flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Создать договор
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
