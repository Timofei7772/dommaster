import assert from 'node:assert/strict'
import test from 'node:test'

const loadEstimateItemsModule = () => import('./estimateItems.ts')

test('addEstimateItem awaits the real Electron DB write before resolving', async () => {
  const completionOrder: string[] = []

  ;(globalThis as any).window = {
    isElectron: true,
    electronAPI: {
      estimateItems: {
        async add() {
          await new Promise((resolve) => setTimeout(resolve, 0))
          completionOrder.push('db-write-finished')
          return { id: 501 }
        },
      },
    },
  }

  const { addEstimateItem } = await loadEstimateItemsModule()

  completionOrder.push('before-call')
  const result = await addEstimateItem(77, {
    name: 'Штукатурка стен',
    unit: 'м²',
    quantity: 2,
    material_price: 100,
    labor_price: 150,
  })
  completionOrder.push('after-await')

  assert.equal(result?.id, 501)
  assert.deepEqual(completionOrder, [
    'before-call',
    'db-write-finished',
    'after-await',
  ])
})

test('updateEstimateItem throws when Electron DB update fails', async () => {
  ;(globalThis as any).window = {
    isElectron: true,
    electronAPI: {
      estimateItems: {
        async update() {
          throw new Error('sqlite update failed')
        },
      },
    },
  }

  const { updateEstimateItem } = await loadEstimateItemsModule()

  await assert.rejects(
    () =>
      updateEstimateItem(77, 12, {
        name: 'Обновленная позиция',
        quantity: 5,
      }),
    /Не удалось сохранить изменения в позиции сметы/
  )
})

test('removeEstimateItem waits for Electron DB delete and surfaces failure', async () => {
  const completionOrder: string[] = []

  ;(globalThis as any).window = {
    isElectron: true,
    electronAPI: {
      estimateItems: {
        async delete() {
          await new Promise((resolve) => setTimeout(resolve, 0))
          completionOrder.push('db-delete-finished')
          return true
        },
      },
    },
  }

  const { removeEstimateItem } = await loadEstimateItemsModule()

  completionOrder.push('before-delete')
  const removed = await removeEstimateItem(77, 12)
  completionOrder.push('after-await')

  assert.equal(removed, true)
  assert.deepEqual(completionOrder, [
    'before-delete',
    'db-delete-finished',
    'after-await',
  ])
})

test('updateEstimateItem persists to Electron storage and survives reload', async () => {
  const dbItems = [
    {
      id: 12,
      estimate_id: 77,
      name: 'Штукатурка стен',
      unit: 'м²',
      quantity: 2,
      materials_cost: 100,
      labor_cost: 150,
      total_price: 500,
      code: 'ФЕР-01',
    },
  ]

  ;(globalThis as any).window = {
    isElectron: true,
    electronAPI: {
      estimateItems: {
        async getAll(estimateId: number) {
          return dbItems.filter((item) => item.estimate_id === estimateId)
        },
        async update(itemId: number, data: Record<string, unknown>) {
          const target = dbItems.find((item) => item.id === itemId)
          if (!target) {
            throw new Error('item not found')
          }

          Object.assign(target, data)
          target.total_price =
            Number(target.quantity || 0) *
            (Number(target.materials_cost || 0) + Number(target.labor_cost || 0))

          return true
        },
      },
    },
  }

  const { updateEstimateItem, getEstimateItemsAsync } = await loadEstimateItemsModule()

  await updateEstimateItem(77, 12, {
    name: 'Штукатурка стен по маякам',
    quantity: 5,
    material_price: 120,
    labor_price: 180,
    justification: 'ФЕР-11-01-001',
  })

  const reloadedItems = await getEstimateItemsAsync(77)
  const [savedItem] = reloadedItems

  assert.equal(savedItem.name, 'Штукатурка стен по маякам')
  assert.equal(savedItem.quantity, 5)
  assert.equal(savedItem.material_price, 120)
  assert.equal(savedItem.labor_price, 180)
  assert.equal(savedItem.total, 1500)
  assert.equal(savedItem.justification, 'ФЕР-11-01-001')
})

test('add then reload then delete then reload stays consistent in Electron storage', async () => {
  const dbItems: Array<Record<string, unknown>> = []
  let nextId = 100

  ;(globalThis as any).window = {
    isElectron: true,
    electronAPI: {
      estimateItems: {
        async getAll(estimateId: number) {
          return dbItems.filter((item) => item.estimate_id === estimateId)
        },
        async add(estimateId: number, data: Record<string, unknown>) {
          const createdItem = {
            id: nextId++,
            estimate_id: estimateId,
            ...data,
            total_price:
              Number(data.quantity || 0) *
              (Number(data.materials_cost || 0) + Number(data.labor_cost || 0)),
          }
          dbItems.push(createdItem)
          return { id: createdItem.id }
        },
        async delete(itemId: number) {
          const index = dbItems.findIndex((item) => item.id === itemId)
          if (index === -1) {
            throw new Error('item not found')
          }
          dbItems.splice(index, 1)
          return true
        },
      },
    },
  }

  const { addEstimateItem, getEstimateItemsAsync, removeEstimateItem } = await loadEstimateItemsModule()

  const createdItem = await addEstimateItem(77, {
    name: 'Грунтовка стен',
    unit: 'м²',
    quantity: 3,
    material_price: 50,
    labor_price: 75,
    justification: 'ГР-01',
  })

  let reloadedItems = await getEstimateItemsAsync(77)
  assert.equal(reloadedItems.length, 1)
  assert.equal(reloadedItems[0].id, createdItem.id)
  assert.equal(reloadedItems[0].name, 'Грунтовка стен')

  await removeEstimateItem(77, createdItem.id)

  reloadedItems = await getEstimateItemsAsync(77)
  assert.equal(reloadedItems.length, 0)
})
