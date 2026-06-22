import assert from 'node:assert/strict'
import test from 'node:test'

const loadFinanceModule = () => import('./useEstimateFinance.ts')

function assertClose(actual: number, expected: number, epsilon = 0.0001) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `Expected ${actual} to be within ${epsilon} of ${expected}`
  )
}

test('calculateEstimateFinance returns FinanceResult v2 from canonical estimate base', async () => {
  const { calculateEstimateFinance } = await loadFinanceModule()

  const result = calculateEstimateFinance({
    items: [
      { id: 1, name: 'Работа из строк', row_type: 'rascenka', quantity: 1, sum_smeta: 10000 },
      { id: 2, name: 'Материал из строк', row_type: 'material', quantity: 1, sum_smeta: 5000 },
    ],
    baseWorksCost: 300,
    baseMaterialsCost: 200,
    baseMachinesCost: 100,
    fotPercent: 40,
    marginPercent: 25,
    discount: 10,
    pricingMode: 'by_margin',
    targetProfit: 0,
    roundAmounts: false,
    strictMode: false,
  })

  assert.equal(result.worksTotal, 300)
  assert.equal(result.materialsTotal, 200)
  assert.equal(result.machinesTotal, 100)
  assert.equal(result.baseCost, 600)
  assert.equal(result.selfCost, 420)
  assert.equal(result.clientPrice, 560)
  assert.equal(result.discountAmount, 56)
  assert.equal(result.finalTotal, 504)
  assert.equal(result.plannedProfit, 140)
  assert.equal(result.actualProfit, 84)
  assert.equal(result.isLoss, false)

  assert.equal(result.discountZone.maxSafeAmount, 140)
  assert.equal(result.discountZone.maxSafePercent, 25)
  assert.equal(result.discountZone.recommendedAmount, 70)
  assert.equal(result.discountZone.recommendedPercent, 12.5)

  assert.equal(result.fot.fotAmount, 120)
  assert.equal(result.fot.fotPercent, 40)
  assert.equal(result.fot.minFotAbsolute, 100000)
  assert.equal(result.fot.minFotPercent, 30)
  assertClose(result.fot.fotShare, 120 / 560)
  assert.equal(result.fot.status, 'low')

  assertClose(result.shares.fot, 120 / 560)
  assertClose(result.shares.materials, 200 / 560)
  assertClose(result.shares.machines, 100 / 560)
  assertClose(result.shares.profit, 140 / 560)

  assert.deepEqual(result.breakdown, {
    fot: 120,
    materials: 200,
    machines: 100,
    profit: 140,
  })

  assert.equal(result.meta.source, 'estimate')
  assert.equal(result.meta.confidence, 'low')
  assert.equal(result.meta.strictMode, false)
  assert.equal(result.meta.itemsDeltaPercent, 2400)
  assert.equal(result.meta.itemsDeltaLevel, 'error')
  assert.ok(result.meta.warnings.some((warning) => /Несоответствие сметы и позиций/i.test(warning)))
})

test('calculateEstimateFinance throws in strict mode when canonical estimate base is missing', async () => {
  const { calculateEstimateFinance } = await loadFinanceModule()

  assert.throws(
    () =>
      calculateEstimateFinance({
        items: [
          { id: 1, name: 'Штукатурка', row_type: 'rascenka', quantity: 1, sum_smeta: 1000 },
        ],
        fotPercent: 30,
        marginPercent: 20,
        discount: 0,
        pricingMode: 'fixed',
        targetProfit: 0,
        roundAmounts: false,
        strictMode: true,
      }),
    /Estimate base required/
  )
})

test('calculateEstimateFinance throws in strict mode on estimate and items mismatch', async () => {
  const { calculateEstimateFinance } = await loadFinanceModule()

  assert.throws(
    () =>
      calculateEstimateFinance({
        items: [
          { id: 1, name: 'Работа из строк', row_type: 'rascenka', quantity: 1, sum_smeta: 10000 },
          { id: 2, name: 'Материал из строк', row_type: 'material', quantity: 1, sum_smeta: 5000 },
        ],
        baseWorksCost: 300,
        baseMaterialsCost: 200,
        baseMachinesCost: 100,
        fotPercent: 40,
        marginPercent: 25,
        discount: 0,
        pricingMode: 'fixed',
        targetProfit: 0,
        roundAmounts: false,
        strictMode: true,
      }),
    /Estimate\/items mismatch/
  )
})

test('calculateEstimateFinance falls back to items with low confidence when estimate base is unavailable', async () => {
  const { calculateEstimateFinance } = await loadFinanceModule()

  const result = calculateEstimateFinance({
    items: [
      { id: 1, name: 'Штукатурка', row_type: 'rascenka', quantity: 1, sum_smeta: 1000 },
      { id: 2, name: 'Шпаклевка', row_type: 'rascenka', quantity: 1, sum_smeta: 500 },
      { id: 3, name: 'Грунтовка', row_type: 'material', quantity: 1, sum_smeta: 250 },
    ],
    fotPercent: 30,
    marginPercent: 20,
    discount: 0,
    pricingMode: 'fixed',
    targetProfit: 0,
    roundAmounts: false,
    strictMode: false,
  })

  assert.equal(result.worksTotal, 1500)
  assert.equal(result.materialsTotal, 250)
  assert.equal(result.machinesTotal, 0)
  assert.equal(result.baseCost, 1750)
  assert.equal(result.meta.source, 'items_fallback')
  assert.equal(result.meta.confidence, 'low')
  assert.equal(result.meta.itemsDeltaLevel, 'warning')
  assert.ok(result.meta.warnings.some((warning) => /fallback/i.test(warning)))
})

test('calculateEstimateFinance keeps zero base safe and avoids NaN shares', async () => {
  const { calculateEstimateFinance } = await loadFinanceModule()

  const result = calculateEstimateFinance({
    items: [],
    baseWorksCost: 0,
    baseMaterialsCost: 0,
    baseMachinesCost: 0,
    fotPercent: 40,
    marginPercent: 25,
    discount: 10,
    pricingMode: 'fixed',
    targetProfit: 0,
    roundAmounts: false,
    strictMode: true,
  })

  assert.equal(result.baseCost, 0)
  assert.equal(result.selfCost, 0)
  assert.equal(result.clientPrice, 0)
  assert.equal(result.finalTotal, 0)
  assert.equal(result.discountZone.maxSafeAmount, 0)
  assert.equal(result.shares.fot, 0)
  assert.equal(result.shares.materials, 0)
  assert.equal(result.shares.machines, 0)
  assert.equal(result.shares.profit, 0)
  assert.equal(result.meta.itemsDeltaPercent, 0)
  assert.equal(result.meta.itemsDeltaLevel, 'ok')
})

test('calculateEstimateFinance marks loss scenarios when final total drops below self cost', async () => {
  const { calculateEstimateFinance } = await loadFinanceModule()

  const result = calculateEstimateFinance({
    items: [],
    baseWorksCost: 1000,
    baseMaterialsCost: 200,
    baseMachinesCost: 0,
    fotPercent: 20,
    marginPercent: 0,
    discount: 90,
    pricingMode: 'fixed',
    targetProfit: 0,
    roundAmounts: false,
    strictMode: false,
  })

  assert.equal(result.clientPrice, 1200)
  assert.equal(result.finalTotal, 120)
  assert.equal(result.selfCost, 400)
  assert.equal(result.isLoss, true)
  assert.ok(result.actualProfit < 0)
})
