import { useState, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  X,
  FileDown,
  FileSpreadsheet,
  Printer,
  Palette,
  Image,
  Trash2,
  Download,
  CheckCircle,
  Sparkles,
  EyeOff,
  Lock,
  User,
  MapPin,
  Phone,
  Mail,
  Building2,
  FileText,
  AlertTriangle,
  TrendingUp,
  Target,
  DollarSign,
  Settings2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { formatCurrency } from '@/lib/utils'
import type { AppSettings } from '@/hooks/useSettings'
import { useLicense } from '@/hooks/useLicense'
import {
  useEstimateFinance,
  isWorkItem,
  isMaterialItem,
  getItemTotal,
  getItemPrice,
  r,
  type PricingMode,
} from '@/hooks/useEstimateFinance'
import { getMarginPercentForTargetPrice, getSmartPrice } from '@/lib/smartPricing'
import { exportKPtoPDF, exportKPtoExcel, type KPExportData } from '@/lib/kpPdf'

// ─── Типы ────────────────────────────────────────────

interface KPPreviewModalProps {
  estimateId: number
  estimate: any
  items: any[]
  settings: AppSettings
  onClose: () => void
}

interface Template {
  id: string
  name: string
  primaryColor: string
  accentColor: string
  style: 'classic' | 'modern' | 'minimal'
}

interface KPDisplayOptions {
  hideFot: boolean
  showMaterialsSeparately: boolean
  showOnlyTotal: boolean
  roundAmounts: boolean
}

// ─── Шаблоны ─────────────────────────────────────────

const templates: Template[] = [
  { id: 'classic', name: 'Классический', primaryColor: '#1E40AF', accentColor: '#3B82F6', style: 'classic' },
  { id: 'modern', name: 'Современный', primaryColor: '#059669', accentColor: '#10B981', style: 'modern' },
  { id: 'minimal', name: 'Минималистичный', primaryColor: '#374151', accentColor: '#6B7280', style: 'minimal' },
  { id: 'premium', name: 'Премиум', primaryColor: '#7C3AED', accentColor: '#A78BFA', style: 'modern' },
  { id: 'corporate', name: 'Корпоративный', primaryColor: '#DC2626', accentColor: '#EF4444', style: 'classic' },
]

// ═══════════════════════════════════════════════════════
// KPSidebar — левая панель настроек
// ═══════════════════════════════════════════════════════

interface KPSidebarProps {
  selectedTemplate: Template
  onSelectTemplate: (t: Template) => void
  logo: string | undefined
  onLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  onLogoRemove: () => void
  logoInputRef: React.RefObject<HTMLInputElement>
  discount: number
  onDiscountChange: (v: number) => void
  fotPercent: number
  onFotChange: (v: number) => void
  marginPercent: number
  onMarginChange: (v: number) => void
  pricingMode: PricingMode
  onPricingModeChange: (m: PricingMode) => void
  targetProfit: number
  onTargetProfitChange: (v: number) => void
  options: KPDisplayOptions
  onOptionsChange: (o: KPDisplayOptions) => void
  kpNumber: string
  validUntil: string
  finance: ReturnType<typeof useEstimateFinance>
  onClose: () => void
}

function KPSidebar(props: KPSidebarProps) {
  const {
    selectedTemplate, onSelectTemplate,
    logo, onLogoUpload, onLogoRemove, logoInputRef,
    discount, onDiscountChange,
    fotPercent, onFotChange,
    marginPercent, onMarginChange,
    pricingMode, onPricingModeChange,
    targetProfit, onTargetProfitChange,
    options, onOptionsChange,
    kpNumber, validUntil,
    finance, onClose,
  } = props

  const rv = (v: number) => r(v, options.roundAmounts)

  // Цвет индикатора здоровья
  const healthBg = finance.healthColor === 'red' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
    : finance.healthColor === 'yellow' ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
    : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
  const healthTextClass = finance.healthColor === 'red' ? 'text-red-700 dark:text-red-300'
    : finance.healthColor === 'yellow' ? 'text-amber-700 dark:text-amber-300'
    : 'text-green-700 dark:text-green-300'
  const metaTextClass = finance.meta.itemsDeltaLevel === 'error'
    ? 'text-red-700 dark:text-red-300'
    : finance.meta.itemsDeltaLevel === 'warning'
      ? 'text-amber-700 dark:text-amber-300'
      : 'text-green-700 dark:text-green-300'
  const smart = useMemo(() => getSmartPrice(finance), [finance])
  const smartStatusTextClass = smartStatusText(smart.status)
  const canApplySmart = smart.recommendedPrice > 0 && finance.selfCost > 0

  const applyTargetPrice = (targetPrice: number) => {
    const nextMargin = getMarginPercentForTargetPrice(finance.selfCost, targetPrice)
    if (nextMargin <= 0) {
      return
    }

    onPricingModeChange('by_margin')
    onMarginChange(Math.min(80, Math.max(0, Math.round(nextMargin * 10) / 10)))
  }

  return (
    <div className="w-72 xl:w-80 shrink-0 border-r border-slate-200 dark:border-slate-700 overflow-y-auto bg-slate-50 dark:bg-slate-800/50 print:hidden">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">Настройки КП</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Индикатор здоровья ── */}
        <div className={`rounded-xl p-3 border ${healthBg}`}>
          <div className="flex items-center gap-2">
            {finance.isLoss ? <AlertTriangle className="w-5 h-5 text-red-500" /> : <TrendingUp className={`w-5 h-5 ${healthTextClass}`} />}
            <span className={`font-semibold text-sm ${healthTextClass}`}>{finance.healthLabel}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-slate-500">Прибыль:</span><br /><span className={`font-bold ${finance.actualProfit < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(rv(finance.actualProfit))}</span></div>
            <div><span className="text-slate-500">Рентабельность:</span><br /><span className={`font-bold ${healthTextClass}`}>{rv(finance.rentability).toFixed(1)}%</span></div>
          </div>
        </div>

        <div className="rounded-xl p-3 border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/40">
          <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Контроль данных
          </h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-slate-500">Источник:</span><br /><span className="font-semibold">{finance.meta.source === 'estimate' ? 'estimate' : 'items_fallback'}</span></div>
            <div><span className="text-slate-500">Надежность:</span><br /><span className="font-semibold">{confidenceLabel(finance.meta.confidence)}</span></div>
            <div className="col-span-2"><span className="text-slate-500">Рассинхрон:</span><br /><span className={`font-semibold ${metaTextClass}`}>{rv(finance.meta.itemsDeltaPercent).toFixed(1)}% ({deltaLevelLabel(finance.meta.itemsDeltaLevel)})</span></div>
          </div>
          {finance.meta.warnings.length > 0 && (
            <div className="mt-2 space-y-1">
              {finance.meta.warnings.map((warning) => (
                <p key={warning} className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{warning}</span>
                </p>
              ))}
            </div>
          )}
        </div>

        {/* ── Шаблоны ── */}
        <div>
          <h4 className="font-semibold text-sm mb-2 flex items-center gap-2"><Palette className="w-4 h-4" />Шаблон</h4>
          <div className="space-y-1">
            {templates.map(t => (
              <button key={t.id} onClick={() => onSelectTemplate(t)}
                className={`w-full flex items-center gap-3 p-2 rounded-lg border transition-all text-sm ${selectedTemplate.id === t.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-transparent hover:bg-white dark:hover:bg-slate-700'}`}>
                <div className="w-5 h-5 rounded" style={{ background: `linear-gradient(135deg, ${t.primaryColor}, ${t.accentColor})` }} />
                <span>{t.name}</span>
                {selectedTemplate.id === t.id && <CheckCircle className="w-4 h-4 text-blue-600 ml-auto" />}
              </button>
            ))}
          </div>
        </div>

        {/* ── Логотип ── */}
        <div>
          <h4 className="font-semibold text-sm mb-2 flex items-center gap-2"><Image className="w-4 h-4" />Логотип</h4>
          <input type="file" ref={logoInputRef} className="hidden" accept="image/*" onChange={onLogoUpload} />
          {logo ? (
            <div className="relative">
              <img src={logo} alt="Logo" className="w-full h-16 object-contain bg-white rounded-lg border" />
              <button onClick={onLogoRemove} className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button onClick={() => logoInputRef.current?.click()}
              className="w-full p-4 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-slate-400 hover:border-blue-500 hover:text-blue-500 flex flex-col items-center gap-1 text-xs">
              <Download className="w-5 h-5" />Загрузить
            </button>
          )}
        </div>

        {/* ── Ценообразование ── */}
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 border border-blue-200 dark:border-blue-800">
          <h4 className="font-semibold text-sm mb-2 flex items-center gap-2 text-blue-800 dark:text-blue-300">
            <Target className="w-4 h-4" />Ценообразование
          </h4>
          <div className="space-y-2">
            {/* Режим */}
            <div className="space-y-1">
              {[
                { value: 'fixed' as PricingMode, label: 'Фикс цена', icon: DollarSign },
                { value: 'by_margin' as PricingMode, label: 'По марже', icon: TrendingUp },
                { value: 'by_profit' as PricingMode, label: 'По прибыли', icon: Target },
              ].map(mode => (
                <label key={mode.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="pricing" checked={pricingMode === mode.value}
                    onChange={() => onPricingModeChange(mode.value)}
                    className="accent-blue-600" />
                  <mode.icon className="w-3.5 h-3.5 text-blue-500" />
                  <span>{mode.label}</span>
                </label>
              ))}
            </div>

            {/* Маржа (для by_margin) */}
            {pricingMode === 'by_margin' && (
              <div className="pt-2 border-t border-blue-200 dark:border-blue-700">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-600">Целевая маржа</span>
                  <div className="flex items-center gap-1">
                    <input type="number" value={marginPercent} onChange={e => onMarginChange(Math.max(0, Math.min(80, Number(e.target.value))))}
                      className="w-14 text-center rounded border border-slate-300 bg-white px-1 py-0.5 text-xs" />
                    <span className="text-xs text-slate-500">%</span>
                  </div>
                </div>
                <input type="range" min={0} max={60} value={marginPercent}
                  onChange={e => onMarginChange(Number(e.target.value))}
                  className="w-full h-1.5 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                {/* Быстрые кнопки */}
                <div className="flex gap-1 mt-1">
                  {[15, 20, 25, 30].map(v => (
                    <button key={v} onClick={() => onMarginChange(v)}
                      className={`flex-1 py-1 text-xs rounded border transition-colors ${marginPercent === v ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-300 hover:bg-blue-50'}`}>
                      {v}%
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Целевая прибыль (для by_profit) */}
            {pricingMode === 'by_profit' && (
              <div className="pt-2 border-t border-blue-200 dark:border-blue-700">
                <label className="text-xs text-slate-600">Целевая прибыль, руб.</label>
                <input type="number" value={targetProfit} onChange={e => onTargetProfitChange(Math.max(0, Number(e.target.value)))}
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm mt-1" />
              </div>
            )}

            {/* Итоговая цена */}
            <div className="pt-2 border-t border-blue-200 dark:border-blue-700 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Себестоимость:</span><span className="font-medium">{formatCurrency(rv(finance.selfCost))}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Цена клиенту:</span><span className="font-bold text-blue-700">{formatCurrency(rv(finance.clientPrice))}</span></div>
            </div>
          </div>
        </div>

        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 border border-emerald-200 dark:border-emerald-800">
          <h4 className="font-semibold text-sm mb-2 flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
            <Target className="w-4 h-4" />Умная цена
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-slate-500">Рекомендуемая цена</p>
                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                  {formatCurrency(rv(smart.recommendedPrice))}
                </p>
              </div>
              <span className={`text-xs font-semibold px-2 py-1 rounded-full bg-white/70 dark:bg-slate-900/40 ${smartStatusTextClass}`}>
                {smartStatusLabel(smart.status)}
              </span>
            </div>
            <div className="rounded-lg bg-white/70 dark:bg-slate-900/30 p-2 text-xs">
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Диапазон:</span>
                <span className="font-medium text-right">
                  {formatCurrency(rv(smart.minPrice))} - {formatCurrency(rv(smart.maxPrice))}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-white/70 dark:bg-slate-900/30 p-2">
                <span className="text-slate-500">Теряете:</span><br />
                <span className={`font-semibold ${smart.lostProfit > 0 ? 'text-red-600' : 'text-slate-700 dark:text-slate-200'}`}>
                  {formatCurrency(rv(smart.lostProfit))}
                </span>
              </div>
              <div className="rounded-lg bg-white/70 dark:bg-slate-900/30 p-2">
                <span className="text-slate-500">Можно добрать:</span><br />
                <span className={`font-semibold ${smart.extraProfit > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-200'}`}>
                  {formatCurrency(rv(smart.extraProfit))}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => applyTargetPrice(smart.recommendedPrice)}
                disabled={!canApplySmart}
                className="rounded-lg bg-emerald-600 text-white px-3 py-2 text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Применить
              </button>
              <button
                type="button"
                onClick={() => applyTargetPrice(smart.maxPrice)}
                disabled={!canApplySmart}
                className="rounded-lg border border-emerald-300 text-emerald-800 dark:text-emerald-300 px-3 py-2 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Поставить максимум
              </button>
            </div>
          </div>
        </div>

        {/* ── Скидка + защита ── */}
        <div>
          <h4 className="font-semibold text-sm mb-2 flex items-center gap-2"><Sparkles className="w-4 h-4" />Скидка</h4>
          <div className="flex items-center gap-2">
            <input type="number" value={discount} onChange={e => onDiscountChange(Math.max(0, Math.min(100, Number(e.target.value))))}
              className={`w-20 text-center rounded-lg border px-2 py-1.5 text-sm ${finance.isDiscountDangerous ? 'border-red-400 bg-red-50 dark:bg-red-900/30' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'}`} min={0} max={100} />
            <span className="text-slate-500 text-sm">%</span>
            {discount > 0 && <span className={`text-sm ml-auto ${finance.isDiscountDangerous ? 'text-red-600 font-bold' : 'text-green-600'}`}>-{formatCurrency(rv(finance.discountAmount))}</span>}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-slate-100 dark:bg-slate-800 p-2">
              <span className="text-slate-500">Макс:</span><br />
              <span className="font-semibold">{formatCurrency(rv(finance.discountZone.maxSafeAmount))}</span><br />
              <span className="text-slate-500">{rv(finance.discountZone.maxSafePercent).toFixed(1)}%</span>
            </div>
            <div className="rounded-lg bg-slate-100 dark:bg-slate-800 p-2">
              <span className="text-slate-500">Рекомендуем:</span><br />
              <span className="font-semibold">{formatCurrency(rv(finance.discountZone.recommendedAmount))}</span><br />
              <span className="text-slate-500">{rv(finance.discountZone.recommendedPercent).toFixed(1)}%</span>
            </div>
          </div>
          {finance.isDiscountDangerous && (
            <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Скидка делает проект убыточным! Макс: {rv(finance.discountZone.maxSafePercent).toFixed(1)}%
            </p>
          )}
          {!finance.isDiscountDangerous && discount > 0 && finance.discountZone.maxSafePercent > 0 && (
            <p className="text-xs text-slate-400 mt-1">Макс. безопасная: {rv(finance.discountZone.maxSafePercent).toFixed(1)}%</p>
          )}
        </div>

        {/* ── Финансовый блок (внутренний) ── */}
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 border border-amber-200 dark:border-amber-800">
          <h4 className="font-semibold text-sm mb-2 flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <Lock className="w-4 h-4" />Только для вас
          </h4>
          <div className="space-y-3 text-sm">
            {/* ФОТ + контроль */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-slate-600 dark:text-slate-300">ФОТ</span>
                <div className="flex items-center gap-1">
                  <input type="number" value={fotPercent} onChange={e => onFotChange(Math.max(0, Math.min(100, Number(e.target.value))))}
                    className={`w-14 text-center rounded border px-1 py-0.5 text-xs ${finance.fotHealthColor === 'red' ? 'border-red-400 bg-red-50' : finance.fotHealthColor === 'yellow' ? 'border-amber-400 bg-amber-50' : 'border-slate-300 bg-white dark:bg-slate-800 dark:border-slate-600'}`} min={0} max={100} />
                  <span className="text-xs text-slate-500">%</span>
                </div>
              </div>
              <input type="range" min={0} max={80} value={fotPercent}
                onChange={e => onFotChange(Number(e.target.value))}
                className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer ${finance.fotHealthColor === 'red' ? 'accent-red-500 bg-red-200' : finance.fotHealthColor === 'yellow' ? 'accent-amber-500 bg-amber-200' : 'accent-amber-500 bg-slate-200'}`} />
              <p className="text-xs text-slate-500 mt-0.5">
                {formatCurrency(rv(finance.fot.fotAmount))} ({(finance.fot.fotShare * 100).toFixed(1)}% цены)
              </p>
              {finance.fotWarning && (
                <p className={`text-xs mt-1 flex items-center gap-1 ${finance.fotHealthColor === 'red' ? 'text-red-600' : 'text-amber-600'}`}>
                  <AlertTriangle className="w-3 h-3 shrink-0" />{finance.fotWarning}
                </p>
              )}
            </div>

            {/* Структура цены */}
            <div className="pt-2 border-t border-amber-200 dark:border-amber-700 space-y-1">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">Структура цены:</p>
              <div className="flex justify-between"><span className="text-slate-500">ФОТ:</span><span className="font-medium">{formatCurrency(rv(finance.breakdown.fot))}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Материалы:</span><span className="font-medium">{formatCurrency(rv(finance.breakdown.materials))}</span></div>
              {finance.breakdown.machines > 0 && (
                <div className="flex justify-between"><span className="text-slate-500">Механизмы:</span><span className="font-medium">{formatCurrency(rv(finance.breakdown.machines))}</span></div>
              )}
              <div className="flex justify-between"><span className="text-slate-500">Прибыль:</span><span className={`font-medium ${finance.breakdown.profit < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(rv(finance.breakdown.profit))}</span></div>
              <div className="flex justify-between border-t border-amber-200 dark:border-amber-700 pt-1"><span className="text-slate-600 font-semibold">Цена:</span><span className="font-bold">{formatCurrency(rv(finance.clientPrice))}</span></div>
            </div>

            {/* Итоги прибыли */}
            <div className="pt-2 border-t border-amber-200 dark:border-amber-700 space-y-1">
              <div className="flex justify-between"><span className="text-slate-500">Прибыль (план):</span><span className="font-medium text-slate-600">{formatCurrency(rv(finance.plannedProfit))}</span></div>
              <div className="flex justify-between">
                <span className="text-slate-500">Прибыль (факт):</span>
                <span className={`font-bold ${finance.actualProfit < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(rv(finance.actualProfit))}</span>
              </div>
              <div className="flex justify-between"><span className="text-slate-500">Рентабельность:</span><span className={`font-medium ${healthText(finance.healthColor)}`}>{rv(finance.rentability).toFixed(1)}%</span></div>
            </div>

            {/* Доли цены */}
            <div className="pt-2 border-t border-amber-200 dark:border-amber-700 space-y-1">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">Доли цены:</p>
              <div className="flex justify-between"><span className="text-slate-500">ФОТ:</span><span className="font-medium">{(finance.shares.fot * 100).toFixed(1)}%</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Материалы:</span><span className="font-medium">{(finance.shares.materials * 100).toFixed(1)}%</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Механизмы:</span><span className="font-medium">{(finance.shares.machines * 100).toFixed(1)}%</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Прибыль:</span><span className="font-medium">{(finance.shares.profit * 100).toFixed(1)}%</span></div>
            </div>

            {/* Рекомендуемые цены */}
            <div className="pt-2 border-t border-amber-200 dark:border-amber-700">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2">Рекомендуемые цены:</p>
              <div className="space-y-1.5">
                {finance.presets.map(p => (
                  <button key={p.label} onClick={() => { onMarginChange(p.marginPercent); onPricingModeChange('by_margin') }}
                    className="w-full flex items-center justify-between p-1.5 rounded-lg border border-amber-200 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors text-xs">
                    <span className="font-medium">{p.label} (+{p.marginPercent}%)</span>
                    <span className="font-bold">{formatCurrency(p.clientPrice)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Переключатели ── */}
        <div>
          <h4 className="font-semibold text-sm mb-2 flex items-center gap-2"><Settings2 className="w-4 h-4" />Отображение</h4>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={options.hideFot}
                onChange={e => onOptionsChange({ ...options, hideFot: e.target.checked })}
                className="rounded border-slate-300" />
              <EyeOff className="w-3.5 h-3.5 text-slate-400" />Скрыть ФОТ в PDF
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={options.showMaterialsSeparately}
                onChange={e => onOptionsChange({ ...options, showMaterialsSeparately: e.target.checked })}
                className="rounded border-slate-300" />
              Показывать материалы отдельно
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={options.showOnlyTotal}
                onChange={e => onOptionsChange({ ...options, showOnlyTotal: e.target.checked })}
                className="rounded border-slate-300" />
              Показать только итог
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={options.roundAmounts}
                onChange={e => onOptionsChange({ ...options, roundAmounts: e.target.checked })}
                className="rounded border-slate-300" />
              Округлить суммы
            </label>
          </div>
        </div>

        {/* ── Номер КП ── */}
        <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-3 text-sm">
          <p className="text-slate-500">Номер КП</p>
          <p className="font-bold text-lg">{kpNumber}</p>
          <p className="text-slate-500 mt-1">Действителен до: <span className="font-medium text-slate-700 dark:text-slate-200">{validUntil}</span></p>
        </div>
      </div>
    </div>
  )
}

function healthText(color: 'red' | 'yellow' | 'green') {
  return color === 'red' ? 'text-red-600' : color === 'yellow' ? 'text-amber-600' : 'text-green-600'
}

function confidenceLabel(confidence: 'high' | 'medium' | 'low') {
  return confidence === 'high' ? 'Высокая' : confidence === 'medium' ? 'Средняя' : 'Низкая'
}

function deltaLevelLabel(level: 'ok' | 'warning' | 'error') {
  return level === 'ok' ? 'ok' : level === 'warning' ? 'warning' : 'error'
}

function smartStatusLabel(status: 'loss' | 'low' | 'optimal' | 'high') {
  if (status === 'loss') return 'Ниже минимума'
  if (status === 'low') return 'Можно поднять'
  if (status === 'high') return 'Риск отказа'
  return 'Оптимально'
}

function smartStatusText(status: 'loss' | 'low' | 'optimal' | 'high') {
  if (status === 'loss') return 'text-red-700 dark:text-red-300'
  if (status === 'low') return 'text-amber-700 dark:text-amber-300'
  if (status === 'high') return 'text-violet-700 dark:text-violet-300'
  return 'text-emerald-700 dark:text-emerald-300'
}

// ═══════════════════════════════════════════════════════
// KPDocument — предпросмотр документа
// ═══════════════════════════════════════════════════════

interface KPDocumentProps {
  company: { name: string; inn: string; kpp: string; address: string; phone: string; email: string; director: string; directorPosition: string }
  client: { name: string; phone: string; email: string; address: string }
  onClientChange: (c: { name: string; phone: string; email: string; address: string }) => void
  displayItems: any[]
  finance: ReturnType<typeof useEstimateFinance>
  discount: number
  options: KPDisplayOptions
  kpNumber: string
  kpDate: string
  validUntil: string
  selectedTemplate: Template
  logo?: string
  notes: string
  onNotesChange: (v: string) => void
  companyMissing: boolean
  onOpenSettings: () => void
}

function KPDocument(props: KPDocumentProps) {
  const { company, client, onClientChange, displayItems, finance, discount, options, kpNumber, kpDate, validUntil, selectedTemplate, logo, notes, onNotesChange, companyMissing, onOpenSettings } = props
  const rv = (v: number) => r(v, options.roundAmounts)

  return (
    <div className="max-w-[800px] mx-auto bg-white dark:bg-slate-900 shadow-xl rounded-xl p-6 lg:p-10 print:shadow-none print:p-0 print:max-w-none" style={{ fontFamily: "'Segoe UI', Arial, sans-serif" }}>

      {/* Предупреждение о пустых настройках */}
      {companyMissing && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-center gap-2 text-sm text-amber-800">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>
            Заполните реквизиты компании в{' '}
            <button
              type="button"
              onClick={onOpenSettings}
              className="underline font-medium hover:text-amber-900"
            >
              Настройках
            </button>
          </span>
        </div>
      )}

      {/* ── Шапка компании ── */}
      <div className="flex justify-between items-start border-b-2 pb-5 mb-6" style={{ borderColor: selectedTemplate.primaryColor + '30' }}>
        <div className="flex items-start gap-4">
          {logo && <img src={logo} alt="Logo" className="w-20 h-20 object-contain rounded-lg shadow-sm" />}
          <div>
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: selectedTemplate.primaryColor }}>{company.name}</h2>
            <div className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-400">
              {company.address && <p className="flex items-center gap-2"><MapPin className="w-4 h-4 text-slate-400" />{company.address}</p>}
              <p className="flex items-center gap-2">
                {company.phone && <><Phone className="w-4 h-4 text-slate-400" />{company.phone}</>}
                {company.phone && company.email && <span className="text-slate-300">|</span>}
                {company.email && <><Mail className="w-4 h-4 text-slate-400" />{company.email}</>}
              </p>
              {company.inn && <p className="text-slate-500">ИНН: {company.inn}{company.kpp ? ` / КПП: ${company.kpp}` : ''}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* ── Заголовок КП ── */}
      <div className="text-center mb-8 py-4">
        <h1 className="text-2xl lg:text-3xl font-bold tracking-wide" style={{ color: selectedTemplate.primaryColor }}>
          КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ № {kpNumber}
        </h1>
        <p className="mt-3 text-slate-600 dark:text-slate-400">от {kpDate}</p>
        <p className="text-sm text-slate-500 mt-1">Действительно до: <span className="font-semibold">{validUntil}</span></p>
      </div>

      {/* ── Клиент (редактируемый) ── */}
      <div className="bg-gradient-to-r from-slate-50 to-slate-100/50 dark:from-slate-800/50 dark:to-slate-800/30 rounded-xl p-5 mb-8 border border-slate-200/50 dark:border-slate-700/50">
        <h3 className="font-semibold mb-3 flex items-center gap-2 text-slate-700 dark:text-slate-300">
          <Building2 className="w-5 h-5" style={{ color: selectedTemplate.primaryColor }} />Заказчик:
        </h3>
        <div className="grid md:grid-cols-2 gap-3 text-sm">
          <div><span className="text-slate-500">ФИО / Компания:</span>
            <input value={client.name} onChange={e => onClientChange({ ...client, name: e.target.value })}
              className="bg-transparent border-b border-dashed border-slate-300 focus:border-blue-500 outline-none ml-1 w-48" placeholder="Не заполнено" />
          </div>
          <div><span className="text-slate-500">Телефон:</span>
            <input value={client.phone} onChange={e => onClientChange({ ...client, phone: e.target.value })}
              className="bg-transparent border-b border-dashed border-slate-300 focus:border-blue-500 outline-none ml-1 w-40" placeholder="+7..." />
          </div>
          <div><span className="text-slate-500">Email:</span>
            <input value={client.email} onChange={e => onClientChange({ ...client, email: e.target.value })}
              className="bg-transparent border-b border-dashed border-slate-300 focus:border-blue-500 outline-none ml-1 w-48" placeholder="email@..." />
          </div>
          <div><span className="text-slate-500">Адрес:</span>
            <input value={client.address} onChange={e => onClientChange({ ...client, address: e.target.value })}
              className="bg-transparent border-b border-dashed border-slate-300 focus:border-blue-500 outline-none ml-1 w-48" placeholder="г. Москва..." />
          </div>
        </div>
      </div>

      {/* ── Таблица работ ── */}
      {!options.showOnlyTotal && displayItems.length > 0 && (
        <div className="overflow-x-auto mb-8 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <table className="w-full text-sm" style={{ fontFamily: "'Segoe UI', Arial, sans-serif" }}>
            <thead>
              <tr style={{ backgroundColor: selectedTemplate.primaryColor }} className="text-white">
                <th className="p-3 text-center w-12 font-semibold">№</th>
                <th className="p-3 text-left font-semibold">Наименование работ</th>
                <th className="p-3 text-center w-16 font-semibold">Ед.</th>
                <th className="p-3 text-center w-20 font-semibold">Кол-во</th>
                <th className="p-3 text-right w-28 font-semibold">Цена</th>
                <th className="p-3 text-right w-32 font-semibold">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {displayItems.map((item, i) => {
                const total = rv(getItemTotal(item))
                const price = rv(getItemPrice(item))
                return (
                  <tr key={item.id || i} className={`border-b border-slate-100 dark:border-slate-800 ${i % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/50 dark:bg-slate-800/30'}`}>
                    <td className="p-3 text-center text-slate-500">{i + 1}</td>
                    <td className="p-3">{item.name}</td>
                    <td className="p-3 text-center text-slate-600">{item.unit || 'шт'}</td>
                    <td className="p-3 text-center">{item.quantity || 0}</td>
                    <td className="p-3 text-right">{formatCurrency(price)}</td>
                    <td className="p-3 text-right font-semibold">{formatCurrency(total)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Итоги ── */}
      <div className="flex justify-end mb-8">
        <div className="w-80 space-y-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-5">
          {options.showMaterialsSeparately && (
            <>
              <div className="flex justify-between text-slate-600 dark:text-slate-400 text-sm">
                <span>Работы:</span><span className="font-medium">{formatCurrency(rv(finance.worksTotal))}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400 text-sm">
                <span>Материалы:</span><span className="font-medium">{formatCurrency(rv(finance.materialsTotal))}</span>
              </div>
              {finance.machinesTotal > 0 && (
                <div className="flex justify-between text-slate-600 dark:text-slate-400 text-sm">
                  <span>Механизмы:</span><span className="font-medium">{formatCurrency(rv(finance.machinesTotal))}</span>
                </div>
              )}
            </>
          )}
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>Подытог:</span><span className="font-medium">{formatCurrency(rv(finance.clientPrice))}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Скидка {discount}%:</span><span className="font-medium">-{formatCurrency(rv(finance.discountAmount))}</span>
            </div>
          )}
          <div className="flex justify-between text-xl font-bold pt-3 border-t-2" style={{ borderColor: selectedTemplate.primaryColor }}>
            <span>ИТОГО:</span>
            <span style={{ color: selectedTemplate.primaryColor }}>{formatCurrency(rv(finance.finalTotal))}</span>
          </div>
        </div>
      </div>

      {/* ── Примечания ── */}
      <div className="mb-6">
        <h3 className="font-semibold mb-2">Примечания:</h3>
        <textarea value={notes} onChange={e => onNotesChange(e.target.value)} rows={3}
          className="w-full text-sm bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-200 dark:border-slate-700 focus:border-blue-500 outline-none print:bg-transparent print:border-none" />
      </div>

      {/* ── Подпись ── */}
      <div className="flex justify-between items-end pt-6 border-t border-slate-200 dark:border-slate-700">
        <div>
          <p className="text-sm text-slate-500">{company.directorPosition}</p>
          <p className="font-medium flex items-center gap-1"><User className="w-4 h-4" />{company.director || 'Не заполнено'}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-500 mb-6">Подпись / Печать</p>
          <div className="w-48 border-b border-slate-300"></div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// KPPreviewModal — главный компонент
// ═══════════════════════════════════════════════════════

export default function KPPreviewModal({ estimateId, estimate, items, settings, onClose }: KPPreviewModalProps) {
  const logoInputRef = useRef<HTMLInputElement>(null)
  const license = useLicense()
  const navigate = useNavigate()

  // State
  const [selectedTemplate, setSelectedTemplate] = useState<Template>(templates[0])
  const [logo, setLogo] = useState<string | undefined>(undefined)
  const [client, setClient] = useState({
    name: estimate?.client_name || '',
    phone: '',
    email: '',
    address: estimate?.address || '',
  })
  const [fotPercent, setFotPercent] = useState(40)
  const [marginPercent, setMarginPercent] = useState(20)
  const [discount, setDiscount] = useState(0)
  const [pricingMode, setPricingMode] = useState<PricingMode>('fixed')
  const [targetProfit, setTargetProfit] = useState(200000)
  const [options, setOptions] = useState<KPDisplayOptions>({
    hideFot: true,
    showMaterialsSeparately: true,
    showOnlyTotal: false,
    roundAmounts: false,
  })
  const [notes, setNotes] = useState('Гарантия на выполненные работы — 24 месяца.\nОплата: 50% предоплата, 50% по завершении.')

  // Финансы через хук
  const finance = useEstimateFinance({
    items,
    baseWorksCost: estimate?.labor_cost,
    baseMaterialsCost: estimate?.materials_cost,
    baseMachinesCost: estimate?.machines_cost,
    fotPercent,
    marginPercent,
    discount,
    pricingMode,
    targetProfit,
    roundAmounts: options.roundAmounts,
  })

  // Компания из settings
  const company = useMemo(() => {
    const c = settings?.company
    return {
      name: c?.name || 'Не заполнено',
      inn: c?.inn || '',
      kpp: c?.kpp || '',
      address: c?.address || '',
      phone: c?.phone || '',
      email: c?.email || '',
      director: c?.director || '',
      directorPosition: c?.directorPosition || 'Директор',
    }
  }, [settings])

  const companyMissing = !settings?.company?.name || !settings?.company?.inn

  // Номер КП и даты
  const kpNumber = `KP-${new Date().getFullYear()}-${estimateId}`
  const kpDate = new Date().toLocaleDateString('ru-RU')
  const validUntil = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 14)
    return d.toLocaleDateString('ru-RU')
  }, [])

  // Отображаемые элементы
  const displayItems = useMemo(() => {
    if (options.showOnlyTotal) return []
    if (options.showMaterialsSeparately) return [...finance.workItems, ...finance.materialItems]
    return items.filter(i => isWorkItem(i) || isMaterialItem(i))
  }, [items, finance.workItems, finance.materialItems, options.showOnlyTotal, options.showMaterialsSeparately])

  // Логотип
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = () => setLogo(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  // Собрать данные для экспорта
  const getExportData = (): KPExportData => ({
    kpNumber, kpDate, validUntil,
    company,
    client,
    displayItems,
    worksTotal: finance.worksTotal,
    materialsTotal: finance.materialsTotal,
    clientPrice: finance.clientPrice,
    discountAmount: finance.discountAmount,
    discount,
    finalTotal: finance.finalTotal,
    template: { primaryColor: selectedTemplate.primaryColor, style: selectedTemplate.style },
    options: {
      showMaterialsSeparately: options.showMaterialsSeparately,
      showOnlyTotal: options.showOnlyTotal,
      roundAmounts: options.roundAmounts,
    },
    notes,
    logo,
  })

  const handleExportPDF = () => {
    if (license.loading) {
      toast.error('Проверяем лицензию, попробуйте ещё раз через секунду')
      return
    }

    void license.requireLicense(async () => {
      exportKPtoPDF(getExportData())
      toast.success('PDF документ создан!')
    })
  }

  const handleExportExcel = () => {
    if (license.loading) {
      toast.error('Проверяем лицензию, попробуйте ещё раз через секунду')
      return
    }

    void license.requireLicense(async () => {
      exportKPtoExcel(getExportData())
      toast.success('Экспорт в Excel выполнен')
    })
  }

  const handleOpenSettings = () => {
    onClose()
    navigate('/settings')
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative flex w-full h-full bg-white dark:bg-slate-900 m-2 lg:m-4 rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
        {/* SIDEBAR */}
        <KPSidebar
          selectedTemplate={selectedTemplate}
          onSelectTemplate={setSelectedTemplate}
          logo={logo}
          onLogoUpload={handleLogoUpload}
          onLogoRemove={() => setLogo(undefined)}
          logoInputRef={logoInputRef}
          discount={discount}
          onDiscountChange={setDiscount}
          fotPercent={fotPercent}
          onFotChange={setFotPercent}
          marginPercent={marginPercent}
          onMarginChange={setMarginPercent}
          pricingMode={pricingMode}
          onPricingModeChange={setPricingMode}
          targetProfit={targetProfit}
          onTargetProfitChange={setTargetProfit}
          options={options}
          onOptionsChange={setOptions}
          kpNumber={kpNumber}
          validUntil={validUntil}
          finance={finance}
          onClose={onClose}
        />

        {/* MAIN */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 print:hidden">
            <h2 className="font-bold flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              Предпросмотр КП
              {finance.isLoss && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Убыток!</span>}
            </h2>
            <div className="flex items-center gap-2">
              {!license.loading && !license.isActive && (
                <span className="hidden xl:inline-flex items-center gap-1 text-xs rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 px-2 py-1">
                  <Lock className="w-3.5 h-3.5" />
                  PDF/Excel доступны в PRO
                </span>
              )}
              <button onClick={() => window.print()} className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm flex items-center gap-2">
                <Printer className="w-4 h-4" />Печать
              </button>
              <button
                onClick={handleExportExcel}
                className={`px-3 py-1.5 rounded-lg border text-sm flex items-center gap-2 transition-colors ${
                  !license.loading && !license.isActive
                    ? 'border-amber-300 text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30'
                    : 'border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {!license.loading && !license.isActive ? <Lock className="w-4 h-4" /> : <FileSpreadsheet className="w-4 h-4 text-green-600" />}
                Excel
              </button>
              <button
                onClick={handleExportPDF}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
                  !license.loading && !license.isActive
                    ? 'bg-amber-500 text-white hover:bg-amber-600'
                    : 'bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700'
                }`}
              >
                {!license.loading && !license.isActive ? <Lock className="w-4 h-4" /> : <FileDown className="w-4 h-4" />}
                PDF
              </button>
              <button onClick={onClose} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg ml-2">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Document preview */}
          <div className="flex-1 overflow-y-auto bg-slate-100 dark:bg-slate-950 p-4 lg:p-8">
            <KPDocument
              company={company}
              client={client}
              onClientChange={setClient}
              displayItems={displayItems}
              finance={finance}
              discount={discount}
              options={options}
              kpNumber={kpNumber}
              kpDate={kpDate}
              validUntil={validUntil}
              selectedTemplate={selectedTemplate}
              logo={logo}
              notes={notes}
              onNotesChange={setNotes}
              companyMissing={companyMissing}
              onOpenSettings={handleOpenSettings}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
