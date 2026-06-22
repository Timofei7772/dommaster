import { useState } from 'react'
import {
  X,
  FileText,
  FilePlus,
  FileEdit,
  FileMinus,
  Check,
  ChevronRight,
  Calendar,
  AlertTriangle
} from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'

interface AdditionalAgreementModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (agreement: AgreementData) => void
  contract: {
    id: number
    number: string
    totalAmount: number
    customerName: string
  }
}

interface AgreementData {
  type: 'additional' | 'replacement' | 'independent'
  number: string
  date: string
  contractId: number
  
  // Работы
  works: Array<{
    name: string
    unit: string
    quantity: number
    price: number
    total: number
    isNew?: boolean
    isReplacement?: boolean
    originalWorkId?: number
  }>
  
  // Суммы
  additionalAmount: number
  newTotalAmount: number
  
  // Причина
  reason: string
  
  // Сроки
  newEndDate?: string
  extensionDays?: number
}

const agreementTypes = [
  {
    id: 'additional',
    name: 'Допсмета',
    desc: 'Дополнительные работы к основному договору',
    icon: FilePlus,
    color: 'from-green-500 to-emerald-500',
    hint: 'Используется когда нужно добавить новые работы, не предусмотренные изначально'
  },
  {
    id: 'replacement',
    name: 'Замена работ',
    desc: 'Замена одних работ на другие',
    icon: FileEdit,
    color: 'from-amber-500 to-orange-500',
    hint: 'Используется когда нужно заменить некоторые работы на альтернативные'
  },
  {
    id: 'independent',
    name: 'Отдельное соглашение',
    desc: 'Самостоятельное дополнение',
    icon: FileText,
    color: 'from-blue-500 to-indigo-500',
    hint: 'Отдельный перечень работ с независимой стоимостью'
  },
]

export default function AdditionalAgreementModal({ 
  isOpen, 
  onClose, 
  onSave, 
  contract 
}: AdditionalAgreementModalProps) {
  const [step, setStep] = useState(1)
  const [agreement, setAgreement] = useState<Partial<AgreementData>>({
    type: 'additional',
    number: `ДС-${contract.number.replace('Д-', '')}-1`,
    date: new Date().toISOString().split('T')[0],
    contractId: contract.id,
    works: [],
    additionalAmount: 0,
    newTotalAmount: contract.totalAmount,
  })

  const [newWork, setNewWork] = useState({
    name: '',
    unit: 'м²',
    quantity: 1,
    price: 0,
  })

  if (!isOpen) return null

  const addWork = () => {
    if (!newWork.name || !newWork.price) return
    
    const work = {
      ...newWork,
      total: newWork.quantity * newWork.price,
      isNew: true,
    }
    
    const works = [...(agreement.works || []), work]
    const additionalAmount = works.reduce((sum, w) => sum + w.total, 0)
    
    setAgreement(prev => ({
      ...prev,
      works,
      additionalAmount,
      newTotalAmount: contract.totalAmount + additionalAmount,
    }))
    
    setNewWork({ name: '', unit: 'м²', quantity: 1, price: 0 })
  }

  const removeWork = (index: number) => {
    const works = (agreement.works || []).filter((_, i) => i !== index)
    const additionalAmount = works.reduce((sum, w) => sum + w.total, 0)
    
    setAgreement(prev => ({
      ...prev,
      works,
      additionalAmount,
      newTotalAmount: contract.totalAmount + additionalAmount,
    }))
  }

  const handleSave = () => {
    onSave(agreement as AgreementData)
    onClose()
  }

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold mb-2">Тип дополнительного соглашения</h3>
        <p className="text-sm text-slate-500">К договору {contract.number} с {contract.customerName}</p>
      </div>
      
      <div className="grid gap-4">
        {agreementTypes.map(type => (
          <button
            key={type.id}
            onClick={() => {
              setAgreement(prev => ({ ...prev, type: type.id as AgreementData['type'] }))
              setStep(2)
            }}
            className={cn(
              "flex items-start gap-4 p-5 rounded-xl border-2 transition-all text-left group hover:shadow-lg",
              agreement.type === type.id 
                ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20" 
                : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
            )}
          >
            <div className={cn(
              "w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center flex-shrink-0",
              type.color
            )}>
              <type.icon className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-slate-900 dark:text-white">{type.name}</h4>
              <p className="text-sm text-slate-500 mb-2">{type.desc}</p>
              <p className="text-xs text-slate-400">{type.hint}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:translate-x-1 transition-transform mt-3" />
          </button>
        ))}
      </div>
    </div>
  )

  const renderStep2 = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <FilePlus className="w-5 h-5 text-green-500" />
        <h3 className="font-semibold">
          {agreement.type === 'additional' && 'Дополнительные работы'}
          {agreement.type === 'replacement' && 'Замена работ'}
          {agreement.type === 'independent' && 'Перечень работ'}
        </h3>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Номер ДС</label>
          <input
            type="text"
            value={agreement.number || ''}
            onChange={e => setAgreement(prev => ({ ...prev, number: e.target.value }))}
            className="input"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Дата</label>
          <input
            type="date"
            value={agreement.date || ''}
            onChange={e => setAgreement(prev => ({ ...prev, date: e.target.value }))}
            className="input"
          />
        </div>
      </div>
      
      {/* Добавление работ */}
      <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
        <p className="text-sm font-medium mb-3">Добавить работу</p>
        <div className="grid grid-cols-12 gap-2">
          <input
            type="text"
            value={newWork.name}
            onChange={e => setNewWork(prev => ({ ...prev, name: e.target.value }))}
            className="input col-span-5"
            placeholder="Наименование работы"
          />
          <select
            value={newWork.unit}
            onChange={e => setNewWork(prev => ({ ...prev, unit: e.target.value }))}
            className="input col-span-2"
          >
            <option value="м²">м²</option>
            <option value="м.п.">м.п.</option>
            <option value="шт">шт</option>
            <option value="компл">компл</option>
            <option value="усл">усл</option>
          </select>
          <input
            type="number"
            value={newWork.quantity}
            onChange={e => setNewWork(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
            className="input col-span-2"
            placeholder="Кол-во"
          />
          <input
            type="number"
            value={newWork.price || ''}
            onChange={e => setNewWork(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
            className="input col-span-2"
            placeholder="Цена"
          />
          <button onClick={addWork} className="btn-primary col-span-1">
            <FilePlus className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* Список работ */}
      {(agreement.works?.length || 0) > 0 && (
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 dark:bg-slate-800">
              <tr>
                <th className="p-2 text-left">Наименование</th>
                <th className="p-2 text-center">Ед.</th>
                <th className="p-2 text-center">Кол-во</th>
                <th className="p-2 text-right">Цена</th>
                <th className="p-2 text-right">Сумма</th>
                <th className="p-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {agreement.works?.map((work, i) => (
                <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="p-2">{work.name}</td>
                  <td className="p-2 text-center">{work.unit}</td>
                  <td className="p-2 text-center">{work.quantity}</td>
                  <td className="p-2 text-right">{formatCurrency(work.price)}</td>
                  <td className="p-2 text-right font-medium">{formatCurrency(work.total)}</td>
                  <td className="p-2">
                    <button 
                      onClick={() => removeWork(i)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <FileMinus className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {/* Итоги */}
      <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-slate-500 mb-1">Сумма по договору</p>
            <p className="font-semibold">{formatCurrency(contract.totalAmount)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">
              {agreement.type === 'replacement' ? 'Изменение' : 'Дополнительно'}
            </p>
            <p className={cn(
              "font-semibold",
              (agreement.additionalAmount || 0) > 0 ? "text-green-600" : "text-red-600"
            )}>
              {(agreement.additionalAmount || 0) >= 0 ? '+' : ''}{formatCurrency(agreement.additionalAmount || 0)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Новая сумма</p>
            <p className="font-bold text-lg text-primary-600">{formatCurrency(agreement.newTotalAmount || contract.totalAmount)}</p>
          </div>
        </div>
      </div>
    </div>
  )

  const renderStep3 = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-5 h-5 text-amber-500" />
        <h3 className="font-semibold">Причина и сроки</h3>
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-1">Причина изменений *</label>
        <textarea
          value={agreement.reason || ''}
          onChange={e => setAgreement(prev => ({ ...prev, reason: e.target.value }))}
          className="input min-h-[100px]"
          placeholder="Укажите причину составления дополнительного соглашения..."
        />
      </div>
      
      <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
        <p className="text-sm font-medium mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4" /> Изменение сроков (при необходимости)
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Новая дата окончания</label>
            <input
              type="date"
              value={agreement.newEndDate || ''}
              onChange={e => setAgreement(prev => ({ ...prev, newEndDate: e.target.value }))}
              className="input"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Продление (дней)</label>
            <input
              type="number"
              value={agreement.extensionDays || ''}
              onChange={e => setAgreement(prev => ({ ...prev, extensionDays: parseInt(e.target.value) || 0 }))}
              className="input"
              placeholder="0"
            />
          </div>
        </div>
      </div>
      
      {/* Сводка */}
      <div className="p-4 border-2 border-indigo-200 dark:border-indigo-800 rounded-xl bg-indigo-50/50 dark:bg-indigo-900/20">
        <h4 className="font-semibold mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4 text-indigo-600" />
          Сводка по дополнительному соглашению
        </h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Тип:</span>
            <span className="font-medium">
              {agreementTypes.find(t => t.id === agreement.type)?.name}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Номер ДС:</span>
            <span className="font-medium">{agreement.number}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Количество работ:</span>
            <span className="font-medium">{agreement.works?.length || 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Изменение суммы:</span>
            <span className={cn(
              "font-medium",
              (agreement.additionalAmount || 0) >= 0 ? "text-green-600" : "text-red-600"
            )}>
              {(agreement.additionalAmount || 0) >= 0 ? '+' : ''}{formatCurrency(agreement.additionalAmount || 0)}
            </span>
          </div>
          <div className="flex justify-between pt-2 border-t border-indigo-200 dark:border-indigo-700">
            <span className="font-medium">Итоговая сумма договора:</span>
            <span className="font-bold text-primary-600">{formatCurrency(agreement.newTotalAmount || 0)}</span>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <FileEdit className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-lg">Дополнительное соглашение</h2>
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
                  s === step ? "bg-amber-500 text-white" :
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
            <span>Тип</span>
            <span>Работы</span>
            <span>Причина</span>
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
              disabled={!agreement.reason || (agreement.works?.length || 0) === 0}
            >
              <FileText className="w-4 h-4" />
              Создать ДС
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
