/**
 * ZARU Смета - Печать документов
 * Подключён к реальной БД через Electron IPC
 */

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FileText,
  FileDown,
  CheckCircle,
  Building2,
  User,
  ClipboardList,
  Receipt,
  FileCheck,
  Briefcase,
  FolderOpen,
  Loader2,
  AlertCircle
} from 'lucide-react'
import toast from 'react-hot-toast'
import { formatCurrency } from '@/lib/utils'
import { api } from '@/lib/api'
import { isElectron } from '@/lib/electron'
import { useSettings } from '@/hooks/useSettings'
import { normalizeError } from '@/lib/error-normalizer'
import {
  AGREEMENT_DISABLED_MESSAGE,
  agreementActions,
  buildAgreementGenerationData,
  findLinkedContractForEstimate,
  getAgreementAvailability,
} from '@/lib/document-agreements'
import {
  exportEstimatePdfForDocuments,
  formatEstimatePdfActionError,
} from '@/lib/document-estimate-actions'
import {
  exportDiagnosticsBundleForDocuments,
  generatePackageForDocuments,
  openDiagnosticsLogsForDocuments,
} from '@/lib/documents-support-actions'

type DocType = 'ks2' | 'ks3' | 'act' | 'contract' | 'invoice'

const docTypes = [
  { id: 'ks2', name: 'КС-2', desc: 'Акт о приёмке выполненных работ', icon: ClipboardList },
  { id: 'ks3', name: 'КС-3', desc: 'Справка о стоимости работ', icon: Receipt },
  { id: 'act', name: 'Акт', desc: 'Акт выполненных работ', icon: FileCheck },
  { id: 'contract', name: 'Договор', desc: 'Договор подряда', icon: Briefcase },
  { id: 'invoice', name: 'Счёт', desc: 'Счёт на оплату', icon: FileText },
]

export default function Documents() {
  const queryClient = useQueryClient()
  const [selectedDoc, setSelectedDoc] = useState<DocType>('ks2')
  const [selectedEstimateId, setSelectedEstimateId] = useState<number | null>(null)
  const [docNumber, setDocNumber] = useState('')
  const [docNumberEdited, setDocNumberEdited] = useState(false)
  const [docDate, setDocDate] = useState(new Date().toISOString().split('T')[0])
  const [periodFrom, setPeriodFrom] = useState(new Date().toISOString().split('T')[0])
  const [periodTo, setPeriodTo] = useState(new Date().toISOString().split('T')[0])
  const [activeAction, setActiveAction] = useState<string | null>(null)
  const { settings } = useSettings()
  const isGenerating = activeAction !== null

  // Загрузка смет из БД
  const { data: estimates = [] } = useQuery({
    queryKey: ['estimates'],
    queryFn: () => api.estimates.getAll()
  })

  // Загрузка позиций выбранной сметы
  const { data: items = [] } = useQuery({
    queryKey: ['estimate-items', selectedEstimateId],
    queryFn: () => selectedEstimateId ? api.estimateItems.getAll(selectedEstimateId) : Promise.resolve([]),
    enabled: !!selectedEstimateId,
  })

  // Выбранная смета
  const selectedEstimate = estimates.find((e: any) => e.id === selectedEstimateId) || null

  const { data: contracts = [] } = useQuery({
    queryKey: ['contracts', selectedEstimate?.project_id],
    queryFn: () => selectedEstimate?.project_id
      ? api.contracts.getAll(selectedEstimate.project_id)
      : Promise.resolve([]),
    enabled: !!selectedEstimate?.project_id,
  })

  const linkedContract = findLinkedContractForEstimate(contracts, selectedEstimateId)
  const agreementAvailability = getAgreementAvailability(linkedContract)

  // Автозаполнение номера при смене типа документа/сметы
  useEffect(() => {
    if (docNumberEdited) return
    const prefix = selectedDoc.toUpperCase()
    const num = selectedEstimate?.number || Date.now().toString().slice(-6)
    setDocNumber(`${prefix}-${num}`)
  }, [selectedDoc, selectedEstimate, docNumberEdited])

  // Данные подрядчика из настроек
  const companyRaw = settings?.company
  const company = companyRaw
    ? (typeof companyRaw === 'string' ? (() => { try { return JSON.parse(companyRaw) } catch { return {} } })() : companyRaw)
    : {}

  const contractor = {
    name: company?.name || '',
    inn: company?.inn || '',
    kpp: company?.kpp || '',
    address: company?.address || '',
    bank: company?.bankName || '',
    bik: company?.bik || '',
    account: company?.checkingAccount || '',
  }

  // Данные заказчика из сметы/проекта
  const customer = {
    name: selectedEstimate?.client_name || '',
    address: selectedEstimate?.address || '',
  }

  const objectInfo = {
    name: selectedEstimate?.name || '',
    address: selectedEstimate?.address || '',
  }

  const toNumber = (value: unknown) => {
    const num = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(num) ? num : 0
  }

  const vatPercent = toNumber(selectedEstimate?.vat_percent || 20)
  const total = toNumber(selectedEstimate?.total_with_vat || selectedEstimate?.total_cost || 0)
  const totalWithoutVatStored = toNumber(selectedEstimate?.total_without_vat)
  const vatAmountStored = toNumber(selectedEstimate?.total_vat)
  const totalWithoutVat = totalWithoutVatStored > 0
    ? totalWithoutVatStored
    : (vatPercent > 0 ? total / (1 + vatPercent / 100) : total)
  const totalVatAmount = vatAmountStored > 0
    ? vatAmountStored
    : Math.max(0, total - totalWithoutVat)

  // Генерация документов через Electron IPC
  const generateDocument = async () => {
    if (!selectedEstimateId) {
      toast.error('Выберите смету')
      return
    }
    if (!docNumber.trim()) {
      toast.error('Укажите номер документа')
      return
    }
    if (!docDate) {
      toast.error('Укажите дату документа')
      return
    }
    if (['ks2', 'ks3', 'act'].includes(selectedDoc) && periodFrom > periodTo) {
      toast.error('Период "с" не может быть позже периода "по"')
      return
    }
    if (['contract', 'invoice'].includes(selectedDoc) && !customer.name.trim()) {
      toast.error('Для этого документа требуется заказчик в смете/проекте')
      return
    }

    setActiveAction('document')
    try {

      if (!isElectron()) {
        toast.error('Генерация документов доступна только в десктопной версии')
        return
      }

      let result: { path: string } | null = null

      switch (selectedDoc) {
        case 'ks2': {
          // Создаём КС-2 в БД и генерируем PDF
          const act = await api.ks2.create({
            estimate_id: selectedEstimateId,
            project_id: selectedEstimate?.project_id,
            number: docNumber,
            date: docDate,
            period_from: periodFrom,
            period_to: periodTo,
            amount: total,
          })
          result = await api.docs.generateKS2(act.id)
          toast.success('КС-2 создан!')
          break
        }
        case 'ks3': {
          // Создаём КС-3 в БД и генерируем PDF
          const cert = await api.ks3.create({
            project_id: selectedEstimate?.project_id,
            number: docNumber,
            date: docDate,
            period_from: periodFrom,
            period_to: periodTo,
            amount_without_vat: totalWithoutVat,
            vat_amount: totalVatAmount,
            amount: total,
          })
          result = await api.docs.generateKS3(cert.id)
          toast.success('КС-3 создана!')
          break
        }
        case 'act': {
          // Акт = аналогично КС-2
          const actData = await api.ks2.create({
            estimate_id: selectedEstimateId,
            project_id: selectedEstimate?.project_id,
            number: docNumber,
            date: docDate,
            period_from: periodFrom,
            period_to: periodTo,
            amount: total,
          })
          result = await api.docs.generateKS2(actData.id)
          toast.success('Акт создан!')
          break
        }
        case 'contract': {
          // Создаём договор и генерируем Word
          const contract = await api.contracts.create({
            estimate_id: selectedEstimateId,
            project_id: selectedEstimate?.project_id,
            number: docNumber,
            date: docDate,
            client: customer.name,
            amount: total,
            status: 'draft',
          })
          result = await api.docs.generateContract(contract.id)
          await queryClient.invalidateQueries({ queryKey: ['contracts'] })
          toast.success('Договор создан!')
          break
        }
        case 'invoice': {
          // Счёт-фактура
          result = await api.docs.generateInvoice(selectedEstimateId, {
            number: docNumber,
            date: docDate,
            client_name: customer.name,
          })
          toast.success('Счёт-фактура создана!')
          break
        }
      }

      // Открываем файл
      if (result?.path) {
        await api.shell.openPath(result.path)
      }
    } catch (error: any) {
      console.error('Ошибка генерации:', error)
      toast.error(normalizeError(error, 'Не удалось создать документ'))
    } finally {
      setActiveAction(null)
    }
  }

  // Экспорт сметы в PDF
  const exportEstimatePdf = async () => {
    if (!selectedEstimateId) {
      toast.error('Выберите смету')
      return
    }

    setActiveAction('estimate')
    try {
      if (!isElectron()) {
        toast.error('Экспорт доступен только в десктопной версии')
        return
      }

      await exportEstimatePdfForDocuments({
        estimateId: selectedEstimateId,
        docs: api.docs,
        shell: api.shell,
        notifySuccess: (message) => toast.success(message),
        notifyInfo: (message) => toast(message),
      })
    } catch (error: any) {
      toast.error(
        formatEstimatePdfActionError(error, 'Не удалось создать PDF сметы')
      )
    } finally {
      setActiveAction(null)
    }
  }

  const generatePackage = async () => {
    if (!selectedEstimateId) {
      toast.error('Выберите смету')
      return
    }

    setActiveAction('package')
    try {
      if (!isElectron()) {
        toast.error('Пакет документов доступен только в десктопной версии')
        return
      }

      await generatePackageForDocuments({
        estimateId: selectedEstimateId,
        docs: api.docs,
        shell: api.shell,
        notifySuccess: (message) => toast.success(message),
        notifyInfo: (message) => toast(message),
      })
    } catch (error: any) {
      toast.error(normalizeError(error, 'Не удалось сформировать пакет документов'))
    } finally {
      setActiveAction(null)
    }
  }

  const generateAgreement = async (agreementType: (typeof agreementActions)[number]['type']) => {
    if (!selectedEstimateId) {
      toast.error('Выберите смету')
      return
    }

    if (!linkedContract) {
      toast.error(AGREEMENT_DISABLED_MESSAGE)
      return
    }

    setActiveAction(`agreement:${agreementType}`)
    try {
      if (!isElectron()) {
        toast.error('Генерация документов доступна только в десктопной версии')
        return
      }

      const result = await api.docs.generateAgreement(
        linkedContract.id,
        agreementType,
        buildAgreementGenerationData(agreementType, docDate)
      )

      toast.success('Допсоглашение создано!')

      if (result?.path) {
        await api.shell.openPath(result.path)
      }
    } catch (error: any) {
      toast.error(normalizeError(error, 'Не удалось создать допсоглашение'))
    } finally {
      setActiveAction(null)
    }
  }

  const openLogsFolder = async () => {
    setActiveAction('logs')
    try {
      if (!isElectron()) {
        toast.error('Диагностика доступна только в десктопной версии')
        return
      }

      await openDiagnosticsLogsForDocuments({
        diagnostics: api.diagnostics,
      })
    } catch (error: any) {
      toast.error(normalizeError(error, 'Не удалось открыть папку логов'))
    } finally {
      setActiveAction(null)
    }
  }

  const exportDiagnostics = async () => {
    setActiveAction('diagnostics')
    try {
      if (!isElectron()) {
        toast.error('Диагностика доступна только в десктопной версии')
        return
      }

      await exportDiagnosticsBundleForDocuments({
        diagnostics: api.diagnostics,
        notifySuccess: (message) => toast.success(message),
      })
    } catch (error: any) {
      toast.error(normalizeError(error, 'Не удалось экспортировать диагностику'))
    } finally {
      setActiveAction(null)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-7 h-7 text-primary-600" />
            Печать документов
          </h1>
          <p className="text-slate-600 dark:text-slate-400">КС-2, КС-3, акты, договоры, счета</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportEstimatePdf}
            disabled={!selectedEstimateId || isGenerating}
            className="btn-secondary flex items-center gap-2 disabled:opacity-50"
          >
            {activeAction === 'estimate' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            Смета PDF
          </button>
          <button
            onClick={generatePackage}
            disabled={!selectedEstimateId || isGenerating}
            className="btn-secondary flex items-center gap-2 disabled:opacity-50"
          >
            {activeAction === 'package' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />}
            Пакет документов
          </button>
          <button
            onClick={generateDocument}
            disabled={!selectedEstimateId || isGenerating}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {activeAction === 'document' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            Создать документ
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Left: Doc Types */}
        <div className="space-y-4">
          <div className="card p-4">
            <h3 className="font-semibold mb-3">Тип документа</h3>
            <div className="space-y-2">
              {docTypes.map(d => (
                <button key={d.id} onClick={() => setSelectedDoc(d.id as DocType)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${selectedDoc === d.id ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                  <d.icon className={`w-5 h-5 ${selectedDoc === d.id ? 'text-primary-600' : 'text-slate-400'}`} />
                  <div>
                    <p className="font-medium">{d.name}</p>
                    <p className="text-xs text-slate-500">{d.desc}</p>
                  </div>
                  {selectedDoc === d.id && <CheckCircle className="w-4 h-4 text-primary-600 ml-auto" />}
                </button>
              ))}
            </div>
          </div>

          {/* Выбор сметы */}
          <div className="card p-4">
            <h3 className="font-semibold mb-3">Смета</h3>
            {estimates.length === 0 ? (
              <div className="text-sm text-slate-500 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Нет смет. Создайте смету.
              </div>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {estimates.map((est: any) => (
                  <button
                    key={est.id}
                    onClick={() => setSelectedEstimateId(est.id)}
                    className={`w-full text-left p-2 rounded-lg text-sm transition-all ${
                      selectedEstimateId === est.id
                        ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-500'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent'
                    }`}
                  >
                    <p className="font-medium truncate">{est.number || 'Б/Н'}</p>
                    <p className="text-xs text-slate-500 truncate">{est.name}</p>
                    <p className="text-xs text-primary-600 font-medium">
                      {formatCurrency(est.total_with_vat || est.total_cost || 0)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="card p-4">
            <h3 className="font-semibold mb-3">Доп. соглашения</h3>
            <div className="space-y-2">
              {agreementActions.map((agreement) => (
                <button
                  key={agreement.type}
                  onClick={() => generateAgreement(agreement.type)}
                  disabled={!selectedEstimateId || agreementAvailability.disabled || isGenerating}
                  title={agreementAvailability.reason || undefined}
                  className="w-full btn-secondary flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {activeAction === `agreement:${agreement.type}` ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileCheck className="w-4 h-4" />
                  )}
                  {agreement.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-3">
              {!selectedEstimateId
                ? 'Выберите смету, затем система определит доступность допсоглашений.'
                : agreementAvailability.disabled
                  ? 'Сначала сформируйте договор, чтобы добавить допсоглашение.'
                  : `Основание: договор № ${linkedContract?.number || '—'}`}
            </p>
          </div>

          <div className="card p-4">
            <h3 className="font-semibold mb-3">Диагностика</h3>
            <div className="space-y-2">
              <button
                onClick={openLogsFolder}
                disabled={isGenerating}
                className="w-full btn-secondary flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {activeAction === 'logs' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />}
                Открыть логи
              </button>
              <button
                onClick={exportDiagnostics}
                disabled={isGenerating}
                className="w-full btn-secondary flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {activeAction === 'diagnostics' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                Экспорт диагностики
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-3">
              Для поддержки и быстрой отправки технической информации без ручного поиска файлов.
            </p>
          </div>
        </div>

        {/* Right: Form */}
        <div className="lg:col-span-3 space-y-4">
          {!selectedEstimateId && (
            <div className="card p-8 text-center">
              <FolderOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">Выберите смету слева для создания документа</p>
            </div>
          )}

          {selectedEstimateId && (
            <>
              {/* Doc Info */}
              <div className="card p-4">
                <div className="grid md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm text-slate-500 mb-1">Номер</label>
                    <input
                      value={docNumber}
                      onChange={e => {
                        setDocNumber(e.target.value)
                        setDocNumberEdited(true)
                      }}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-500 mb-1">Дата</label>
                    <input type="date" value={docDate} onChange={e => setDocDate(e.target.value)} className="input" />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-500 mb-1">Период с</label>
                    <input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} className="input" />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-500 mb-1">Период по</label>
                    <input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)} className="input" />
                  </div>
                </div>
              </div>

              {/* Parties */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="card p-4">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Building2 className="w-4 h-4" />Подрядчик
                    {!contractor.name && (
                      <span className="text-xs text-amber-500">(заполните в Настройках)</span>
                    )}
                  </h3>
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">{contractor.name || 'Не указан'}</p>
                    {contractor.inn && <p className="text-slate-500">ИНН {contractor.inn}{contractor.kpp ? ` / КПП ${contractor.kpp}` : ''}</p>}
                    {contractor.address && <p className="text-slate-500">{contractor.address}</p>}
                    {contractor.bank && <p className="text-slate-500">{contractor.bank}, БИК {contractor.bik}</p>}
                  </div>
                </div>
                <div className="card p-4">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <User className="w-4 h-4" />Заказчик
                  </h3>
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">{customer.name || 'Не указан'}</p>
                    {customer.address && <p className="text-slate-500">{customer.address}</p>}
                  </div>
                </div>
              </div>

              {/* Object */}
              <div className="card p-4">
                <h3 className="font-semibold mb-3">Объект</h3>
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-500">Наименование: </span>
                    <span className="font-medium">{objectInfo.name || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Адрес: </span>
                    <span className="font-medium">{objectInfo.address || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Works Table */}
              <div className="card p-4">
                <h3 className="font-semibold mb-3">
                  Позиции сметы
                  <span className="text-sm font-normal text-slate-500 ml-2">({items.length} шт.)</span>
                </h3>
                {items.length === 0 ? (
                  <p className="text-sm text-slate-500">Нет позиций в выбранной смете</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-slate-800">
                          <th className="p-2 text-center w-10">№</th>
                          <th className="p-2 text-left">Наименование</th>
                          <th className="p-2 text-center w-16">Ед.</th>
                          <th className="p-2 text-right w-20">Кол-во</th>
                          <th className="p-2 text-right w-28">Цена</th>
                          <th className="p-2 text-right w-32">Сумма</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.slice(0, 50).map((item: any, i: number) => {
                          const price = item.price_smeta || item.material_price + item.labor_price || item.price || 0
                          const itemTotal = item.sum_smeta || item.total || price * (item.quantity || 0)
                          return (
                            <tr key={item.id} className="border-b border-slate-100 dark:border-slate-800">
                              <td className="p-2 text-center text-slate-400">{i + 1}</td>
                              <td className="p-2">{item.name}</td>
                              <td className="p-2 text-center">{item.unit}</td>
                              <td className="p-2 text-right">{item.quantity}</td>
                              <td className="p-2 text-right">{formatCurrency(price)}</td>
                              <td className="p-2 text-right font-medium">{formatCurrency(itemTotal)}</td>
                            </tr>
                          )
                        })}
                        {items.length > 50 && (
                          <tr>
                            <td colSpan={6} className="p-2 text-center text-sm text-slate-500">
                              ...и ещё {items.length - 50} позиций
                            </td>
                          </tr>
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50 dark:bg-slate-800">
                          <td colSpan={4}></td>
                          <td className="p-2 text-right text-sm text-slate-500">Материалы:</td>
                          <td className="p-2 text-right font-medium">{formatCurrency(selectedEstimate?.total_materials || 0)}</td>
                        </tr>
                        <tr className="bg-slate-50 dark:bg-slate-800">
                          <td colSpan={4}></td>
                          <td className="p-2 text-right text-sm text-slate-500">Работы:</td>
                          <td className="p-2 text-right font-medium">{formatCurrency(selectedEstimate?.total_works || 0)}</td>
                        </tr>
                        {(selectedEstimate?.overhead_percent || 0) > 0 && (
                          <tr className="bg-slate-50 dark:bg-slate-800">
                            <td colSpan={4}></td>
                            <td className="p-2 text-right text-sm text-slate-500">Накл. ({selectedEstimate?.overhead_percent}%):</td>
                            <td className="p-2 text-right font-medium">{formatCurrency(selectedEstimate?.total_overhead || 0)}</td>
                          </tr>
                        )}
                        {(selectedEstimate?.profit_percent || 0) > 0 && (
                          <tr className="bg-slate-50 dark:bg-slate-800">
                            <td colSpan={4}></td>
                            <td className="p-2 text-right text-sm text-slate-500">Прибыль ({selectedEstimate?.profit_percent}%):</td>
                            <td className="p-2 text-right font-medium">{formatCurrency(selectedEstimate?.total_profit || 0)}</td>
                          </tr>
                        )}
                        <tr className="bg-slate-50 dark:bg-slate-800">
                          <td colSpan={4}></td>
                          <td className="p-2 text-right text-sm text-slate-500">НДС ({selectedEstimate?.vat_percent || 0}%):</td>
                          <td className="p-2 text-right font-medium">{formatCurrency(selectedEstimate?.total_vat || 0)}</td>
                        </tr>
                        <tr className="font-bold border-t-2 border-primary-200 dark:border-primary-800">
                          <td colSpan={5} className="p-2 text-right">ИТОГО:</td>
                          <td className="p-2 text-right text-primary-600 text-lg">{formatCurrency(total)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}









