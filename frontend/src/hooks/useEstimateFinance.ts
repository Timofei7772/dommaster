import { useMemo } from 'react'

export type PricingMode = 'fixed' | 'by_margin' | 'by_profit'
export type CalculationSource = 'estimate' | 'items_fallback'
export type ConfidenceLevel = 'high' | 'medium' | 'low'
export type ItemsDeltaLevel = 'ok' | 'warning' | 'error'

export interface FinanceParams {
  items: any[]
  baseWorksCost?: number | null
  baseMaterialsCost?: number | null
  baseMachinesCost?: number | null
  fotPercent: number
  marginPercent: number
  discount: number
  pricingMode: PricingMode
  targetProfit: number
  roundAmounts: boolean
  strictMode?: boolean
  minFotAbsolute?: number
  minFotPercent?: number
}

export interface PricePreset {
  label: string
  marginPercent: number
  clientPrice: number
  profit: number
}

export interface FinanceMeta {
  source: CalculationSource
  confidence: ConfidenceLevel
  strictMode: boolean
  itemsDeltaPercent: number
  itemsDeltaLevel: ItemsDeltaLevel
  warnings: string[]
}

export interface DiscountZone {
  maxSafeAmount: number
  maxSafePercent: number
  recommendedAmount: number
  recommendedPercent: number
}

export interface FotControl {
  fotAmount: number
  fotPercent: number
  minFotAbsolute: number
  minFotPercent: number
  fotShare: number
  status: 'low' | 'ok' | 'high'
}

export interface PriceShares {
  fot: number
  materials: number
  machines: number
  profit: number
}

export interface PriceBreakdown {
  fot: number
  materials: number
  machines: number
  profit: number
}

export interface FinanceResult {
  workItems: any[]
  materialItems: any[]
  mechanismItems: any[]

  worksTotal: number
  materialsTotal: number
  machinesTotal: number
  baseCost: number

  selfCost: number
  fot: FotControl

  clientPrice: number
  discount: number
  discountAmount: number
  finalTotal: number

  plannedProfit: number
  actualProfit: number
  rentability: number

  isLoss: boolean

  discountZone: DiscountZone
  shares: PriceShares
  breakdown: PriceBreakdown
  meta: FinanceMeta

  // UI compatibility fields
  grandTotal: number
  healthColor: 'red' | 'yellow' | 'green'
  healthLabel: string
  maxSafeDiscount: number
  isDiscountDangerous: boolean
  fotPerWorkPercent: number
  fotWarning: string | null
  fotHealthColor: 'red' | 'yellow' | 'green'
  priceBreakdown: {
    fot: number
    materials: number
    machines: number
    margin: number
    total: number
  }
  calculationSource: CalculationSource
  sourceWarning: string | null
  itemsBaseTotal: number
  hasItemsBaseMismatch: boolean
  itemsBaseDelta: number
  itemsBaseDeltaPercent: number
  itemsBaseWarning: string | null
  presets: PricePreset[]
}

const NON_WORK_TYPES = ['material', 'mat', 'mechanism', 'meh', 'comment', 'spr', 'empt']

export function isWorkItem(item: any): boolean {
  const rt = (item.row_type || 'rascenka').toLowerCase()
  if (NON_WORK_TYPES.includes(rt)) return false
  if (rt.startsWith('irazd') || rt.startsWith('itog') || rt.startsWith('lz_')) return false
  return true
}

export function isMaterialItem(item: any): boolean {
  const rt = (item.row_type || '').toLowerCase()
  return rt === 'material' || rt === 'mat'
}

export function isMechanismItem(item: any): boolean {
  const rt = (item.row_type || '').toLowerCase()
  return rt === 'mechanism' || rt === 'meh'
}

export function getItemTotal(item: any): number {
  return Number(item.sum_smeta || item.total || 0)
}

export function getItemPrice(item: any): number {
  const qty = Number(item.quantity || 0)
  const total = getItemTotal(item)
  return qty > 0 ? total / qty : total
}

export function r(val: number, round: boolean): number {
  return round ? Math.round(val) : Math.round(val * 100) / 100
}

function normalizeNumber(value: unknown): number {
  return typeof value === 'number' && !Number.isNaN(value) && Number.isFinite(value)
    ? value
    : Number.isFinite(Number(value))
      ? Number(value)
      : 0
}

function normalizeMoney(value: unknown): number {
  return Math.max(0, normalizeNumber(value))
}

function clampPercent(value: unknown): number {
  return Math.min(100, Math.max(0, normalizeNumber(value)))
}

function safeDivide(a: number, b: number): number {
  return b > 0 ? a / b : 0
}

function deltaLevelFromPercent(deltaPercent: number): ItemsDeltaLevel {
  if (deltaPercent < 5) return 'ok'
  if (deltaPercent < 15) return 'warning'
  return 'error'
}

export function calculateEstimateFinance(
  params: FinanceParams,
  options?: { strictMode?: boolean }
): FinanceResult {
  const {
    items,
    baseWorksCost,
    baseMaterialsCost,
    baseMachinesCost,
    pricingMode,
    roundAmounts,
  } = params

  const strictMode = options?.strictMode ?? params.strictMode ?? false
  const normalizedFotPercent = clampPercent(params.fotPercent)
  const normalizedMarginPercent = clampPercent(params.marginPercent)
  const normalizedDiscount = clampPercent(params.discount)
  const normalizedTargetProfit = Math.max(0, normalizeMoney(params.targetProfit))
  const minFotAbsolute = normalizeMoney(params.minFotAbsolute ?? 100000)
  const minFotPercent = clampPercent(params.minFotPercent ?? 30)
  const rv = (v: number) => r(v, roundAmounts)

  const workItems = items.filter(isWorkItem)
  const materialItems = items.filter(isMaterialItem)
  const mechanismItems = items.filter(isMechanismItem)

  if (process.env.NODE_ENV === 'development') {
    items.forEach(i => {
      const rt = (i.row_type || 'rascenka').toLowerCase()
      if (
        !isWorkItem(i) &&
        !isMaterialItem(i) &&
        !isMechanismItem(i) &&
        !['comment', 'spr', 'empt'].includes(rt) &&
        !rt.startsWith('irazd') &&
        !rt.startsWith('itog') &&
        !rt.startsWith('lz_')
      ) {
        console.warn('Unknown row_type:', rt, i.name)
      }
    })
  }

  const itemsWorksTotal = rv(workItems.reduce((sum, item) => sum + getItemTotal(item), 0))
  const itemsMaterialsTotal = rv(materialItems.reduce((sum, item) => sum + getItemTotal(item), 0))
  const itemsMachinesTotal = rv(mechanismItems.reduce((sum, item) => sum + getItemTotal(item), 0))
  const itemsBaseTotal = rv(itemsWorksTotal + itemsMaterialsTotal + itemsMachinesTotal)

  const hasCanonicalBase = baseWorksCost != null && baseMaterialsCost != null
  if (!hasCanonicalBase && strictMode) {
    throw new Error('Estimate base required')
  }

  const worksTotal = hasCanonicalBase ? rv(normalizeMoney(baseWorksCost)) : itemsWorksTotal
  const materialsTotal = hasCanonicalBase ? rv(normalizeMoney(baseMaterialsCost)) : itemsMaterialsTotal
  const machinesTotal = hasCanonicalBase ? rv(normalizeMoney(baseMachinesCost)) : itemsMachinesTotal
  const baseCost = rv(worksTotal + materialsTotal + machinesTotal)

  const itemsBaseDelta = hasCanonicalBase ? rv(Math.abs(itemsBaseTotal - baseCost)) : 0
  const itemsBaseDeltaPercent = hasCanonicalBase
    ? rv(baseCost > 0 ? safeDivide(itemsBaseDelta, baseCost) * 100 : itemsBaseTotal > 0 ? 100 : 0)
    : 0
  const hasItemsBaseMismatch = hasCanonicalBase && itemsBaseDeltaPercent >= 5
  const itemsBaseDeltaLevel = hasCanonicalBase ? deltaLevelFromPercent(itemsBaseDeltaPercent) : 'warning'

  if (hasCanonicalBase && strictMode && itemsBaseDeltaLevel === 'error') {
    throw new Error('Estimate/items mismatch')
  }

  const calculationSource: CalculationSource = hasCanonicalBase ? 'estimate' : 'items_fallback'

  const warnings: string[] = []
  if (calculationSource === 'items_fallback') {
    warnings.push('Используется fallback-расчёт по позициям, потому что агрегированные поля сметы недоступны.')
  }
  if (hasCanonicalBase && itemsBaseDeltaLevel === 'warning') {
    warnings.push(`Несоответствие сметы и позиций: ${itemsBaseDeltaPercent.toFixed(1)}%`)
  }
  if (hasCanonicalBase && itemsBaseDeltaLevel === 'error') {
    warnings.push(`Критичное несоответствие сметы и позиций: ${itemsBaseDeltaPercent.toFixed(1)}%`)
  }

  let confidence: ConfidenceLevel
  if (calculationSource === 'items_fallback') {
    confidence = 'low'
  } else if (itemsBaseDeltaPercent < 5) {
    confidence = 'high'
  } else if (itemsBaseDeltaPercent < 15) {
    confidence = 'medium'
  } else {
    confidence = 'low'
  }

  const fotAmount = rv(worksTotal * normalizedFotPercent / 100)
  const selfCost = rv(fotAmount + materialsTotal + machinesTotal)

  let clientPrice: number
  switch (pricingMode) {
    case 'by_margin': {
      const divider = 1 - normalizedMarginPercent / 100
      clientPrice = divider > 0 ? rv(selfCost / divider) : selfCost
      break
    }
    case 'by_profit': {
      clientPrice = rv(selfCost + normalizedTargetProfit)
      break
    }
    case 'fixed':
    default: {
      clientPrice = baseCost
      break
    }
  }

  clientPrice = rv(Math.max(0, clientPrice))

  const discountAmount = rv(clientPrice * normalizedDiscount / 100)
  const finalTotal = rv(Math.max(0, clientPrice - discountAmount))

  const plannedProfit = rv(clientPrice - selfCost)
  const actualProfit = rv(finalTotal - selfCost)
  const rentability = selfCost > 0 ? rv(safeDivide(actualProfit, selfCost) * 100) : 0
  const isLoss = actualProfit < 0

  let healthColor: 'red' | 'yellow' | 'green'
  let healthLabel: string
  if (isLoss || rentability < 0) {
    healthColor = 'red'
    healthLabel = 'Убыток'
  } else if (rentability < 10) {
    healthColor = 'red'
    healthLabel = 'Критично низкая маржа'
  } else if (rentability < 20) {
    healthColor = 'yellow'
    healthLabel = 'Маржа ниже нормы'
  } else {
    healthColor = 'green'
    healthLabel = 'Хорошая маржа'
  }

  const maxSafeAmount = rv(Math.max(0, clientPrice - selfCost))
  const maxSafePercent = rv(clientPrice > 0 ? safeDivide(maxSafeAmount, clientPrice) * 100 : 0)
  const recommendedAmount = rv(maxSafeAmount * 0.5)
  const recommendedPercent = rv(clientPrice > 0 ? safeDivide(recommendedAmount, clientPrice) * 100 : 0)
  const isDiscountDangerous = normalizedDiscount > maxSafePercent

  const fotShare = safeDivide(fotAmount, clientPrice)
  let fotStatus: FotControl['status'] = 'ok'
  if (baseCost === 0 && clientPrice === 0) {
    fotStatus = 'ok'
  } else if (fotAmount < minFotAbsolute || fotShare * 100 < minFotPercent) {
    fotStatus = 'low'
  } else if (fotShare > 0.6) {
    fotStatus = 'high'
  }

  const fotWarning =
    fotStatus === 'low'
      ? 'ФОТ недостаточен для выполнения работ'
      : fotStatus === 'high'
        ? 'ФОТ выше нормы — проверьте расчёт'
        : null
  const fotHealthColor: 'red' | 'yellow' | 'green' =
    fotStatus === 'low' ? 'red' : fotStatus === 'high' ? 'yellow' : 'green'
  const fotPerWorkPercent = worksTotal > 0 ? rv(safeDivide(fotAmount, worksTotal) * 100) : 0

  const shares: PriceShares = {
    fot: safeDivide(fotAmount, clientPrice),
    materials: safeDivide(materialsTotal, clientPrice),
    machines: safeDivide(machinesTotal, clientPrice),
    profit: safeDivide(plannedProfit, clientPrice),
  }

  const breakdown: PriceBreakdown = {
    fot: fotAmount,
    materials: materialsTotal,
    machines: machinesTotal,
    profit: plannedProfit,
  }

  const presetMargins = [
    { label: 'Эконом', marginPercent: 15 },
    { label: 'Стандарт', marginPercent: 25 },
    { label: 'Премиум', marginPercent: 40 },
  ]
  const presets: PricePreset[] = presetMargins.map((preset) => {
    const divider = 1 - preset.marginPercent / 100
    const price = divider > 0 ? rv(selfCost / divider) : selfCost
    return {
      label: preset.label,
      marginPercent: preset.marginPercent,
      clientPrice: price,
      profit: rv(price - selfCost),
    }
  })

  const meta: FinanceMeta = {
    source: calculationSource,
    confidence,
    strictMode,
    itemsDeltaPercent: itemsBaseDeltaPercent,
    itemsDeltaLevel: itemsBaseDeltaLevel,
    warnings,
  }

  return {
    workItems,
    materialItems,
    mechanismItems,
    worksTotal,
    materialsTotal,
    machinesTotal,
    baseCost,
    selfCost,
    fot: {
      fotAmount,
      fotPercent: normalizedFotPercent,
      minFotAbsolute,
      minFotPercent,
      fotShare,
      status: fotStatus,
    },
    clientPrice,
    discount: normalizedDiscount,
    discountAmount,
    finalTotal,
    plannedProfit,
    actualProfit,
    rentability,
    isLoss,
    discountZone: {
      maxSafeAmount,
      maxSafePercent,
      recommendedAmount,
      recommendedPercent,
    },
    shares,
    breakdown,
    meta,
    grandTotal: baseCost,
    healthColor,
    healthLabel,
    maxSafeDiscount: maxSafePercent,
    isDiscountDangerous,
    fotPerWorkPercent,
    fotWarning,
    fotHealthColor,
    priceBreakdown: {
      fot: breakdown.fot,
      materials: breakdown.materials,
      machines: breakdown.machines,
      margin: breakdown.profit,
      total: clientPrice,
    },
    calculationSource,
    sourceWarning: warnings.find((warning) => /fallback/i.test(warning)) || null,
    itemsBaseTotal,
    hasItemsBaseMismatch,
    itemsBaseDelta,
    itemsBaseDeltaPercent,
    itemsBaseWarning: warnings.find((warning) => /сметы и позиций/i.test(warning)) || null,
    presets,
  }
}

export function useEstimateFinance(params: FinanceParams): FinanceResult {
  const {
    items,
    baseWorksCost,
    baseMaterialsCost,
    baseMachinesCost,
    fotPercent,
    marginPercent,
    discount,
    pricingMode,
    targetProfit,
    roundAmounts,
    strictMode,
    minFotAbsolute,
    minFotPercent,
  } = params

  return useMemo(
    () =>
      calculateEstimateFinance(
        {
          items,
          baseWorksCost,
          baseMaterialsCost,
          baseMachinesCost,
          fotPercent,
          marginPercent,
          discount,
          pricingMode,
          targetProfit,
          roundAmounts,
          strictMode,
          minFotAbsolute,
          minFotPercent,
        },
        { strictMode }
      ),
    [
      items,
      baseWorksCost,
      baseMaterialsCost,
      baseMachinesCost,
      fotPercent,
      marginPercent,
      discount,
      pricingMode,
      targetProfit,
      roundAmounts,
      strictMode,
      minFotAbsolute,
      minFotPercent,
    ]
  )
}
