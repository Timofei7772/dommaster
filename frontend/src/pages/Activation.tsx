import { useEffect, useState } from 'react'
import { Key, Shield, CheckCircle, AlertTriangle, RefreshCw, Copy, ShoppingCart, ChevronDown, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'

import ActiveDevices from '@/components/ActiveDevices'
import {
  isAdminIssueHotkey,
  normalizeAdminIssueResponse,
  validateAdminIssueForm,
  type AdminIssuedLicense,
} from '@/lib/adminLicense'
import { buildBackendApiUrl } from '@/lib/backendApi'
import { LicenseDevice, LicenseInfo } from '@/lib/electron'
import { getLicenseStatusPresentation, getPlanBadge } from '@/lib/licensePageContent'
import {
  getEmailValidationError,
  getPurchaseRecipientState,
  isValidEmail,
  normalizeEmail,
  pickPreferredEmail,
  resolvePurchaseFlow,
} from '@/lib/purchaseEmail'

const LICENSE_PLANS = [
  {
    id: 'standard',
    name: 'Standard',
    pcs: '1 ПК',
    price: '2 500 ₽',
    accent: 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20',
    features: ['Полный функционал', 'Экспорт PDF и Excel', 'AI-сканер', 'Обновления 1 год'],
  },
  {
    id: 'double',
    name: 'Double',
    pcs: '2 ПК',
    price: '5 000 ₽',
    accent: 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20',
    features: ['2 слота активации', 'Полный функционал', 'AI-сканер', 'Оптимально для дома и офиса'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    pcs: '5 ПК',
    price: '10 000 ₽',
    accent: 'border-amber-400 bg-amber-50 dark:bg-amber-900/20',
    features: ['5 слотов активации', 'Полный функционал', 'Приоритетная поддержка', 'Подходит для бригады/офиса'],
  },
] as const

type LicensePlanId = (typeof LICENSE_PLANS)[number]['id']

const DEMO_LICENSE_INFO: LicenseInfo = {
  isValid: false,
  type: 'NONE',
  typeName: 'Демо-режим',
  email: '',
  daysLeft: 0,
  expiresAt: '',
  isTrial: false,
  isExpired: false,
  features: [],
  hwid: 'WEB-DEMO',
  needActivation: true,
}

const LAST_LICENSE_EMAIL_STORAGE_KEY = 'license.lastEmail'

export default function Activation() {
  const viteApiUrl = (import.meta as ImportMeta & { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL || ''
  const [licenseKey, setLicenseKey] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo>(DEMO_LICENSE_INFO)
  const [hwid, setHwid] = useState('')
  const [activationError, setActivationError] = useState('')
  const [activeDevices, setActiveDevices] = useState<LicenseDevice[]>([])
  const [maxPcs, setMaxPcs] = useState<number | undefined>(undefined)
  const [devicesLoading, setDevicesLoading] = useState(false)
  const [deactivatingSlot, setDeactivatingSlot] = useState<number | null>(null)
  const [buyingPlan, setBuyingPlan] = useState<LicensePlanId | null>(null)
  const [showPurchaseEmailModal, setShowPurchaseEmailModal] = useState(false)
  const [pendingPurchasePlan, setPendingPurchasePlan] = useState<LicensePlanId | null>(null)
  const [showAdminIssuePanel, setShowAdminIssuePanel] = useState(false)
  const [adminBuyerEmail, setAdminBuyerEmail] = useState('')
  const [adminPlan, setAdminPlan] = useState<LicensePlanId>('standard')
  const [adminSecret, setAdminSecret] = useState('')
  const [issuingLicense, setIssuingLicense] = useState(false)
  const [issuedLicense, setIssuedLicense] = useState<AdminIssuedLicense | null>(null)

  const hasElectronLicense = Boolean(window.electronAPI?.license)
  const purchaseRecipient = getPurchaseRecipientState(email)
  const statusPresentation = getLicenseStatusPresentation(licenseInfo)
  const backendApiOptions = {
    protocol: typeof window !== 'undefined' ? window.location.protocol : '',
    apiUrl: viteApiUrl,
  }

  const scrollToSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const loadRememberedEmail = async (): Promise<string> => {
    try {
      const savedEmail = await window.electronAPI?.settings?.get<string>(LAST_LICENSE_EMAIL_STORAGE_KEY)
      if (typeof savedEmail === 'string') {
        return normalizeEmail(savedEmail)
      }
    } catch (error) {
      console.error('Remembered email settings load error:', error)
    }

    try {
      return normalizeEmail(window.localStorage.getItem(LAST_LICENSE_EMAIL_STORAGE_KEY) || '')
    } catch (error) {
      console.error('Remembered email localStorage load error:', error)
      return ''
    }
  }

  const rememberEmail = async (nextEmail: string) => {
    const normalizedEmail = normalizeEmail(nextEmail)
    if (!isValidEmail(normalizedEmail)) {
      return
    }

    try {
      await window.electronAPI?.settings?.set?.(LAST_LICENSE_EMAIL_STORAGE_KEY, normalizedEmail)
    } catch (error) {
      console.error('Remembered email settings save error:', error)
    }

    try {
      window.localStorage.setItem(LAST_LICENSE_EMAIL_STORAGE_KEY, normalizedEmail)
    } catch (error) {
      console.error('Remembered email localStorage save error:', error)
    }
  }

  useEffect(() => {
    let cancelled = false

    const initialize = async () => {
      let nextHwid = 'WEB-DEMO'
      const savedEmail = await loadRememberedEmail()
      let licenseEmail = ''

      if (window.electronAPI?.license?.getHWID) {
        try {
          const realHwid = await window.electronAPI.license.getHWID()
          if (realHwid) {
            nextHwid = realHwid
          }
        } catch (error) {
          console.error('HWID error:', error)
        }
      }

      if (!cancelled) {
        setHwid(nextHwid)
      }

      if (!hasElectronLicense) {
        if (!cancelled) {
          setLicenseInfo(DEMO_LICENSE_INFO)
          setActiveDevices([])
          setMaxPcs(undefined)
          const preferredEmail = pickPreferredEmail({ savedEmail })
          if (preferredEmail) {
            setEmail((currentEmail) => normalizeEmail(currentEmail) || preferredEmail)
          }
        }
        return
      }

      try {
        const info = await window.electronAPI.license.check()
        if (!cancelled) {
          setLicenseInfo({ ...DEMO_LICENSE_INFO, ...info })
          if (info.hwid) {
            setHwid(info.hwid)
          }
        }
        licenseEmail = normalizeEmail(info.email || '')
      } catch (error) {
        console.error('License check error:', error)
        if (!cancelled) {
          setLicenseInfo(DEMO_LICENSE_INFO)
        }
      }

      const preferredEmail = pickPreferredEmail({ licenseEmail, savedEmail })
      if (!cancelled && preferredEmail) {
        setEmail((currentEmail) => normalizeEmail(currentEmail) || preferredEmail)
      }

      if (!window.electronAPI?.license?.getActiveDevices) {
        if (!cancelled) {
          setActiveDevices([])
          setMaxPcs(undefined)
        }
        return
      }

      if (!cancelled) {
        setDevicesLoading(true)
      }

      try {
        const result = await window.electronAPI.license.getActiveDevices()
        if (cancelled) {
          return
        }

        if (result?.success) {
          setActiveDevices(result.active_devices || result.devices || [])
          setMaxPcs(result.max_pcs)
        } else {
          setActiveDevices([])
          setMaxPcs(undefined)
        }
      } catch (error) {
        console.error('Active devices load error:', error)
        if (!cancelled) {
          setActiveDevices([])
        }
      } finally {
        if (!cancelled) {
          setDevicesLoading(false)
        }
      }
    }

    void initialize()

    return () => {
      cancelled = true
    }
  }, [hasElectronLicense])

  useEffect(() => {
    if (!hasElectronLicense) {
      setShowAdminIssuePanel(false)
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isAdminIssueHotkey(event)) {
        return
      }

      event.preventDefault()
      setShowAdminIssuePanel((previous) => {
        const next = !previous
        toast.success(next ? 'Admin-панель лицензий открыта' : 'Admin-панель лицензий скрыта')
        if (!next) {
          setAdminSecret('')
        }
        return next
      })
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hasElectronLicense])

  const refreshLicenseState = async () => {
    await Promise.all([checkLicense(), getHWID(), loadActiveDevices()])
  }

  const getHWID = async () => {
    if (window.electronAPI?.license?.getHWID) {
      try {
        const realHwid = await window.electronAPI.license.getHWID()
        if (realHwid) {
          setHwid(realHwid)
          return
        }
      } catch (error) {
        console.error('HWID error:', error)
      }
    }

    setHwid('WEB-DEMO')
  }

  const checkLicense = async () => {
    if (!hasElectronLicense) {
      setLicenseInfo(DEMO_LICENSE_INFO)
      return
    }

    try {
      const info = await window.electronAPI.license.check()
      setLicenseInfo({ ...DEMO_LICENSE_INFO, ...info })
      if (info.hwid) {
        setHwid(info.hwid)
      }
    } catch (error) {
      console.error('License check error:', error)
      setLicenseInfo(DEMO_LICENSE_INFO)
    }
  }

  const loadActiveDevices = async () => {
    if (!window.electronAPI?.license?.getActiveDevices) {
      setActiveDevices([])
      setMaxPcs(undefined)
      return
    }

    setDevicesLoading(true)
    try {
      const result = await window.electronAPI.license.getActiveDevices()
      if (result?.success) {
        setActiveDevices(result.active_devices || result.devices || [])
        setMaxPcs(result.max_pcs)
      } else {
        setActiveDevices([])
        setMaxPcs(undefined)
      }
    } catch (error) {
      console.error('Active devices load error:', error)
      setActiveDevices([])
    } finally {
      setDevicesLoading(false)
    }
  }

  const activateLicense = async (forceDeactivatePrevious = false) => {
    if (!licenseKey.trim()) {
      toast.error('Введите лицензионный ключ')
      return
    }

    if (!hasElectronLicense) {
      toast.error('Активация доступна только в desktop-версии')
      return
    }

    setLoading(true)
    setActivationError('')

    try {
      const result = await window.electronAPI.license.activate(licenseKey.trim(), email, {
        forceDeactivatePrevious,
      })

      if (result.success) {
        toast.success(forceDeactivatePrevious ? 'Лицензия перенесена на этот ПК' : 'Лицензия активирована!')
        setActivationError('')
        setActiveDevices(result.activeDevices || [])
        await rememberEmail(email)
        await refreshLicenseState()
        return
      }

      const nextDevices = result.activeDevices || result.details?.active_devices || []
      if (nextDevices.length) {
        setActiveDevices(nextDevices)
      }
      if (result.details?.max_pcs) {
        setMaxPcs(result.details.max_pcs)
      }

      setActivationError(result.error || 'Ошибка активации')
      toast.error(result.error || 'Ошибка активации')
    } catch (error) {
      console.error('Activation error:', error)
      setActivationError('Ошибка активации')
      toast.error('Ошибка активации')
    } finally {
      setLoading(false)
    }
  }

  const handleForceActivation = async () => {
    const confirmed = window.confirm(
      'Лицензия будет перенесена на этот компьютер, а самое старое активное устройство потеряет доступ. Продолжить?',
    )

    if (confirmed) {
      await activateLicense(true)
    }
  }

  const handleDeactivateDevice = async (slotId: number) => {
    if (!window.electronAPI?.license?.deactivateDevice) {
      return
    }

    setDeactivatingSlot(slotId)
    try {
      const result = await window.electronAPI.license.deactivateDevice(slotId)
      if (result?.success) {
        toast.success('Слот деактивирован')
        await refreshLicenseState()
      } else {
        toast.error(result?.error || 'Не удалось деактивировать слот')
      }
    } catch (error) {
      console.error('Deactivate device error:', error)
      toast.error('Не удалось деактивировать слот')
    } finally {
      setDeactivatingSlot(null)
    }
  }

  const copyHWID = () => {
    navigator.clipboard.writeText(hwid)
    toast.success('HWID скопирован')
  }

  const redirectToPayment = (
    paymentUrl: string,
    method: string,
    formFields?: Record<string, string>,
  ) => {
    if (!formFields || Object.keys(formFields).length === 0 || method.toUpperCase() !== 'POST') {
      window.location.href = paymentUrl
      return
    }

    const form = document.createElement('form')
    form.method = 'POST'
    form.action = paymentUrl
    form.style.display = 'none'

    Object.entries(formFields).forEach(([key, value]) => {
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = key
      input.value = value
      form.appendChild(input)
    })

    document.body.appendChild(form)
    form.submit()
    form.remove()
  }

  const startPurchase = async (plan: LicensePlanId, buyerEmail: string) => {
    setBuyingPlan(plan)
    try {
      await rememberEmail(buyerEmail)
      const paymentCreateUrl = buildBackendApiUrl('/api/payment/create', backendApiOptions)
      const response = await fetch(paymentCreateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: buyerEmail, plan }),
      })

      const data = await response.json()
      if (!response.ok || !data?.payment_url) {
        throw new Error(data?.detail || data?.error || 'Не удалось создать платёж')
      }

      toast.success('Перенаправляем на оплату...')
      redirectToPayment(data.payment_url, data.method || 'POST', data.form_fields)
    } catch (error) {
      console.error('Create payment error:', error)
      toast.error(error instanceof Error ? error.message : 'Не удалось создать платёж')
    } finally {
      setBuyingPlan(null)
    }
  }

  const closePurchaseEmailModal = () => {
    setShowPurchaseEmailModal(false)
    setPendingPurchasePlan(null)
  }

  const openPurchaseEmailModal = (plan: LicensePlanId | null = null) => {
    setPendingPurchasePlan(plan)
    setShowPurchaseEmailModal(true)
  }

  const handleBuy = async (plan: LicensePlanId) => {
    const purchaseFlow = resolvePurchaseFlow(email, plan)

    if (purchaseFlow.kind === 'prompt') {
      openPurchaseEmailModal(plan)
      return
    }

    setEmail(purchaseFlow.email)
    await startPurchase(purchaseFlow.plan, purchaseFlow.email)
  }

  const handlePurchaseEmailContinue = async () => {
    if (!pendingPurchasePlan) {
      const validationError = getEmailValidationError(email)
      if (validationError) {
        toast.error(validationError)
        return
      }

      await rememberEmail(email)
      closePurchaseEmailModal()
      toast.success('Email для лицензии сохранён')
      return
    }

    const purchaseFlow = resolvePurchaseFlow(email, pendingPurchasePlan)
    if (purchaseFlow.kind === 'prompt') {
      toast.error(getEmailValidationError(email) || 'Введите корректный email для покупки лицензии')
      return
    }

    setEmail(purchaseFlow.email)
    closePurchaseEmailModal()
    await startPurchase(purchaseFlow.plan, purchaseFlow.email)
  }

  const copyIssuedLicenseKey = async () => {
    if (!issuedLicense) {
      return
    }

    await navigator.clipboard.writeText(issuedLicense.licenseKey)
    toast.success('Ключ лицензии скопирован')
  }

  const handleAdminIssueLicense = async () => {
    const validationError = validateAdminIssueForm({
      email: adminBuyerEmail,
      adminSecret,
    })
    if (validationError) {
      toast.error(validationError)
      return
    }

    setIssuingLicense(true)
    try {
      const adminIssueUrl = buildBackendApiUrl('/api/license/admin/issue', backendApiOptions)
      const response = await fetch(adminIssueUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': adminSecret.trim(),
        },
        body: JSON.stringify({
          email: adminBuyerEmail.trim(),
          plan: adminPlan,
        }),
      })

      const payload = await response.json()
      const result = normalizeAdminIssueResponse(payload)

      if (!response.ok) {
        throw new Error(payload?.detail || 'Не удалось выдать лицензию')
      }

      setIssuedLicense(result)
      toast.success('Лицензия выдана')
    } catch (error) {
      console.error('Admin issue license error:', error)
      const message = error instanceof Error ? error.message : 'Не удалось выдать лицензию'
      toast.error(message)
    } finally {
      setIssuingLicense(false)
    }
  }

  const hideAdminIssuePanel = () => {
    setShowAdminIssuePanel(false)
    setAdminSecret('')
  }

  const getLicenseStatusClass = () => {
    if (statusPresentation.tone === 'success') {
      return 'border-green-300 bg-green-50 dark:bg-green-900/20'
    }
    return 'border-indigo-300 bg-indigo-50 dark:bg-indigo-900/20'
  }

  const getCurrentPlanForRenewal = (): LicensePlanId => {
    const normalized = (licenseInfo.typeName || '').toLowerCase()
    if (normalized.includes('enterprise')) {
      return 'enterprise'
    }
    if (normalized.includes('double')) {
      return 'double'
    }
    return 'standard'
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      {showPurchaseEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Куда отправить лицензию?</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              {pendingPurchasePlan
                ? 'Укажите email покупателя, чтобы создать платёж и привязать покупку к правильному клиенту.'
                : 'Укажите email, который будет использоваться для покупки и активации лицензии.'}
            </p>

            <div className="mt-5">
              <label className="block text-sm font-medium mb-2">Email для покупки</label>
              <input
                type="email"
                autoFocus
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void handlePurchaseEmailContinue()
                  }
                }}
                placeholder="buyer@email.com"
                className="input"
              />
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={closePurchaseEmailModal}
                className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => void handlePurchaseEmailContinue()}
                className="btn-primary"
              >
                {pendingPurchasePlan ? 'Продолжить к оплате' : 'Сохранить email'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Key className="w-7 h-7 text-indigo-600" />
          Лицензия
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Активация и управление коммерческой лицензией SmetaAI
        </p>
      </div>

      <div className={`card border-2 ${getLicenseStatusClass()}`}>
        <div className="flex items-start gap-4">
          {statusPresentation.tone === 'success' ? (
            <CheckCircle className="w-12 h-12 text-green-500 flex-shrink-0" />
          ) : (
            <Sparkles className="w-12 h-12 text-indigo-500 flex-shrink-0" />
          )}

          <div className="flex-1">
            <h2 className="text-xl font-bold mb-2">{statusPresentation.title}</h2>
            <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
              {statusPresentation.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
        </div>
      </div>

      {licenseInfo.isValid && licenseInfo.daysLeft < 14 && (
        <div className="card bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-300">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
            <div className="flex-1">
              <p className="font-semibold text-amber-800 dark:text-amber-200">
                Лицензия скоро истекает
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Продлите лицензию заранее, чтобы не потерять доступ к PDF-экспорту и полному функционалу.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleBuy(getCurrentPlanForRenewal())}
              disabled={buyingPlan !== null}
              className="btn-primary bg-amber-600 hover:bg-amber-500 disabled:opacity-70"
            >
              Продлить
            </button>
          </div>
        </div>
      )}

      <div className="card bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
              {buyingPlan !== null ? <RefreshCw className="w-7 h-7 animate-spin" /> : <ShoppingCart className="w-7 h-7" />}
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/75">Полная версия</p>
              <h2 className="mt-1 text-3xl font-bold">Полный доступ без ограничений</h2>
              <p className="mt-2 text-xl font-semibold">от 2 500 ₽ / год</p>
              <p className="mt-2 text-white/85">Неограниченные сметы • Все документы • PDF</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
            <button
              type="button"
              onClick={() => scrollToSection('license-plans')}
              className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50"
            >
              Выбрать тариф
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('license-activation')}
              className="rounded-xl border border-white/30 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Уже есть ключ?
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm">
          {purchaseRecipient.kind === 'ready' ? (
            <p>
              Лицензия придёт на: <span className="font-semibold">{purchaseRecipient.email}</span>
            </p>
          ) : (
            <p>Укажите email перед оплатой, чтобы лицензия сразу пришла покупателю.</p>
          )}
          <button
            type="button"
            onClick={() => openPurchaseEmailModal(null)}
            className="rounded-lg border border-white/30 px-3 py-1.5 text-xs font-medium transition hover:bg-white/10"
          >
            {purchaseRecipient.kind === 'ready' ? 'Изменить email' : 'Указать email'}
          </button>
        </div>
      </div>

      <div id="license-plans" className="card">
        <h3 className="text-lg font-semibold mb-6">Тарифы</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {LICENSE_PLANS.map((plan) => {
            const badge = getPlanBadge(plan.id)

            return (
              <div key={plan.id} className={`rounded-2xl border-2 p-5 ${plan.accent}`}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      badge.tone === 'indigo'
                        ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200'
                        : badge.tone === 'emerald'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200'
                    }`}
                  >
                    {badge.label}
                  </span>
                  <span className="text-lg font-bold text-slate-900 dark:text-white">{plan.price}</span>
                </div>

                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-xl">{plan.name}</h4>
                    <p className="text-sm text-slate-500 mt-1">{plan.pcs}</p>
                  </div>
                </div>

                <ul className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                  {plan.features.map((feature) => (
                    <li key={feature}>• {feature}</li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => void handleBuy(plan.id)}
                  disabled={buyingPlan !== null}
                  className="btn-primary mt-5 inline-flex w-full justify-center disabled:opacity-70"
                >
                  {buyingPlan === plan.id ? 'Создаём платёж...' : `Купить ${plan.name}`}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <div id="license-activation" className="card">
        <div className="mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Уже есть ключ? Активируйте лицензию ниже.
          </h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Лицензия активируется на этот ПК. При смене устройства слот можно перенести.
          </p>
        </div>

        <div className="space-y-4">

          <div>
            <label className="block text-sm font-medium mb-2">Лицензионный ключ</label>
            <input
              type="text"
              value={licenseKey}
              onChange={(event) => setLicenseKey(event.target.value.toUpperCase())}
              placeholder="ZARU-XXXX-XXXX-XXXX-XXXX"
              className="input font-mono"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="your@email.com"
              className="input"
            />
          </div>

          {activationError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p className="font-semibold mb-1">Ошибка активации</p>
              <p>{activationError}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => void activateLicense(false)}
              disabled={loading}
              className="btn-primary flex items-center gap-2"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
              Активировать
            </button>

            {!!activeDevices.length && (
              <button
                type="button"
                onClick={() => void handleForceActivation()}
                disabled={loading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
              >
                Принудительный перенос
              </button>
            )}
          </div>
        </div>
      </div>

      <ActiveDevices
        devices={activeDevices}
        maxPcs={maxPcs}
        loading={devicesLoading}
        deactivatingSlot={deactivatingSlot}
        onDeactivate={(slotId) => void handleDeactivateDevice(slotId)}
      />

      <details className="card group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Hardware ID (для поддержки)</h4>
            <p className="mt-1 text-xs text-slate-500">Нужен только если поддержка попросит идентификатор устройства.</p>
          </div>
          <ChevronDown className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180" />
        </summary>

        <div className="mt-4 rounded-lg bg-slate-100 p-3 dark:bg-slate-800">
          <div className="flex items-center justify-between gap-4">
            <code className="min-w-0 break-all text-sm font-mono">{hwid}</code>
            <button onClick={copyHWID} className="rounded p-2 hover:bg-slate-200 dark:hover:bg-slate-700">
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
      </details>

      {hasElectronLicense && showAdminIssuePanel && (
        <div className="card border-2 border-indigo-200 bg-indigo-50/70 dark:bg-indigo-900/10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
                <Shield className="w-5 h-5 text-indigo-600" />
                Выдать лицензию покупателю
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Только для администратора. Ключ выпускается на backend через защищённый endpoint.
              </p>
            </div>
            <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200">
              Admin only
            </span>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={hideAdminIssuePanel}
              className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
            >
              Скрыть панель
            </button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-2">Email покупателя</label>
              <input
                type="email"
                value={adminBuyerEmail}
                onChange={(event) => setAdminBuyerEmail(event.target.value)}
                placeholder="buyer@email.com"
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Тариф</label>
              <select
                value={adminPlan}
                onChange={(event) => setAdminPlan(event.target.value as LicensePlanId)}
                className="input"
              >
                {LICENSE_PLANS.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} · {plan.pcs} · {plan.price}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium mb-2">Admin secret</label>
            <input
              type="password"
              value={adminSecret}
              onChange={(event) => setAdminSecret(event.target.value)}
              placeholder="Введите секрет администратора"
              className="input"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleAdminIssueLicense()}
              disabled={issuingLicense}
              className="btn-primary flex items-center gap-2 disabled:opacity-70"
            >
              {issuingLicense ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
              Сгенерировать лицензию
            </button>

            {issuedLicense && (
              <button
                type="button"
                onClick={() => void copyIssuedLicenseKey()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Copy className="w-4 h-4" />
                Скопировать ключ
              </button>
            )}
          </div>

          {issuedLicense && (
            <div className="mt-5 rounded-xl border border-green-200 bg-green-50 p-4 text-sm dark:bg-green-900/20">
              <p className="font-semibold text-green-800 dark:text-green-200 mb-3">
                Лицензия успешно выдана
              </p>
              <div className="space-y-2">
                <p>
                  <span className="text-slate-500">Ключ:</span>{' '}
                  <code className="font-mono text-green-700 dark:text-green-200">{issuedLicense.licenseKey}</code>
                </p>
                <p>
                  <span className="text-slate-500">Тариф:</span> {issuedLicense.plan}
                </p>
                <p>
                  <span className="text-slate-500">Слотов ПК:</span> {issuedLicense.maxPcs}
                </p>
                <p>
                  <span className="text-slate-500">Действует до:</span> {issuedLicense.expiresAt}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <details className="card group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Лицензионное соглашение</h4>
            <p className="mt-1 text-xs text-slate-500">Юридические условия использования программы.</p>
          </div>
          <ChevronDown className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180" />
        </summary>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
          <div className="space-y-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          <p>
            Программа для ЭВМ «ZaruAI Смета» (далее — Программа) является объектом
            интеллектуальной собственности ZARU Software и охраняется в соответствии
            с частью IV Гражданского кодекса Российской Федерации.
          </p>
          <p>
            <strong>Правовая охрана:</strong> ст. 1225, 1259, 1261 ГК РФ — программы для ЭВМ
            относятся к объектам авторских прав и охраняются как литературные произведения.
          </p>
          <p>
            <strong>Исключительные права:</strong> ст. 1270 ГК РФ — использование Программы
            (копирование, распространение, модификация, декомпиляция) без разрешения
            правообладателя запрещено.
          </p>
          <p>
            <strong>Ответственность:</strong> ст. 1301 ГК РФ — компенсация от 10 000 до 5 000 000 руб.
            за каждый факт нарушения. Ст. 146 УК РФ — уголовная ответственность за незаконное
            использование объектов авторского права (до 6 лет лишения свободы).
          </p>
          <p>
            Активируя Программу, вы подтверждаете согласие с условиями лицензионного
            соглашения (ст. 1286.1 ГК РФ — открытая лицензия).
          </p>
          <p className="text-slate-400">&copy; 2024–2026 ZARU Software. Все права защищены.</p>
        </div>
        </div>
      </details>
    </div>
  )
}
