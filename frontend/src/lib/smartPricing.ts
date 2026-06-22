import type { FinanceResult } from '../hooks/useEstimateFinance'

export type FinanceResultV2 = FinanceResult
export type SmartPriceStatus = 'loss' | 'low' | 'optimal' | 'high'

export interface SmartPriceResult {
  recommendedPrice: number
  minPrice: number
  maxPrice: number
  status: SmartPriceStatus
  lostProfit: number
  extraProfit: number
}

export interface SmartPriceOptions {
  targetMargin?: number
}

function normalizeMoney(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value)
  }

  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0
}

function normalizeMargin(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0.25
  }

  return Math.min(0.95, Math.max(0, value))
}

export function getMarginPercentForTargetPrice(selfCostInput: unknown, targetPriceInput: unknown): number {
  const selfCost = normalizeMoney(selfCostInput)
  const targetPrice = normalizeMoney(targetPriceInput)

  if (selfCost <= 0 || targetPrice <= selfCost) {
    return 0
  }

  return (1 - selfCost / targetPrice) * 100
}

export function getSmartPrice(
  finance: FinanceResultV2,
  options?: SmartPriceOptions
): SmartPriceResult {
  const selfCost = normalizeMoney(finance.selfCost)
  const clientPrice = normalizeMoney(finance.clientPrice)
  const margin = normalizeMargin(options?.targetMargin)

  if (selfCost <= 0) {
    return {
      recommendedPrice: 0,
      minPrice: 0,
      maxPrice: 0,
      status: 'optimal',
      lostProfit: 0,
      extraProfit: 0,
    }
  }

  const recommendedPrice = selfCost / (1 - margin)
  const minPrice = selfCost * 1.15
  const maxPrice = selfCost * 1.5

  let status: SmartPriceStatus = 'optimal'

  if (finance.isLoss || clientPrice < minPrice) {
    status = 'loss'
  } else if (clientPrice < recommendedPrice) {
    status = 'low'
  } else if (clientPrice > maxPrice) {
    status = 'high'
  }

  return {
    recommendedPrice,
    minPrice,
    maxPrice,
    status,
    lostProfit: Math.max(0, recommendedPrice - clientPrice),
    extraProfit: Math.max(0, maxPrice - clientPrice),
  }
}
