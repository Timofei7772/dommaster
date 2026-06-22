import assert from 'node:assert/strict'
import test from 'node:test'
import type { FinanceResultV2 } from './smartPricing.ts'

const loadSmartPricingModule = () => import('./smartPricing.ts')

function assertClose(actual: number, expected: number, epsilon = 0.0001) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `Expected ${actual} to be within ${epsilon} of ${expected}`
  )
}

function makeFinance(overrides: Partial<FinanceResultV2> = {}): FinanceResultV2 {
  return {
    selfCost: 1_000_000,
    clientPrice: 1_200_000,
    isLoss: false,
    ...overrides,
  } as FinanceResultV2
}

test('getSmartPrice returns low status when client price is below recommendation', async () => {
  const { getSmartPrice } = await loadSmartPricingModule()

  const result = getSmartPrice(makeFinance())

  assertClose(result.recommendedPrice, 1_333_333.3333333333)
  assert.equal(result.minPrice, 1_150_000)
  assert.equal(result.maxPrice, 1_500_000)
  assert.equal(result.status, 'low')
  assertClose(result.lostProfit, 133_333.33333333326)
  assert.equal(result.extraProfit, 300_000)
})

test('getSmartPrice prioritizes loss status when finance is already loss-making', async () => {
  const { getSmartPrice } = await loadSmartPricingModule()

  const result = getSmartPrice(makeFinance({
    clientPrice: 900_000,
    isLoss: true,
  }))

  assert.equal(result.status, 'loss')
  assert.equal(result.minPrice, 1_150_000)
  assert.ok(result.lostProfit > 0)
})

test('getSmartPrice returns optimal status near recommended price', async () => {
  const { getSmartPrice } = await loadSmartPricingModule()

  const result = getSmartPrice(makeFinance({
    clientPrice: 1_333_333.3333333333,
  }))

  assert.equal(result.status, 'optimal')
  assertClose(result.lostProfit, 0)
  assertClose(result.extraProfit, 166_666.66666666674)
})

test('getSmartPrice returns high status when client price exceeds max range', async () => {
  const { getSmartPrice } = await loadSmartPricingModule()

  const result = getSmartPrice(makeFinance({
    clientPrice: 1_600_000,
  }))

  assert.equal(result.status, 'high')
  assert.equal(result.lostProfit, 0)
  assert.equal(result.extraProfit, 0)
})

test('getSmartPrice returns zeroed recommendation on zero self cost', async () => {
  const { getSmartPrice } = await loadSmartPricingModule()

  const result = getSmartPrice(makeFinance({
    selfCost: 0,
    clientPrice: 0,
  }))

  assert.deepEqual(result, {
    recommendedPrice: 0,
    minPrice: 0,
    maxPrice: 0,
    status: 'optimal',
    lostProfit: 0,
    extraProfit: 0,
  })
})

test('getMarginPercentForTargetPrice converts target price into margin percent', async () => {
  const { getMarginPercentForTargetPrice } = await loadSmartPricingModule()

  const result = getMarginPercentForTargetPrice(1_000_000, 1_333_333.3333333333)

  assertClose(result, 25)
})

test('getMarginPercentForTargetPrice returns zero on invalid targets', async () => {
  const { getMarginPercentForTargetPrice } = await loadSmartPricingModule()

  assert.equal(getMarginPercentForTargetPrice(0, 100_000), 0)
  assert.equal(getMarginPercentForTargetPrice(100_000, 0), 0)
  assert.equal(getMarginPercentForTargetPrice(100_000, 100_000), 0)
})
