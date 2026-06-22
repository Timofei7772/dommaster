import assert from 'node:assert/strict'
import test from 'node:test'

import {
  exportEstimatePdfForDocuments,
  formatEstimatePdfActionError,
} from './document-estimate-actions.ts'

test('documents estimate export uses generateEstimatePDF and opens the created file', async () => {
  const calls: string[] = []

  const docs = {
    async generateEstimatePDF(estimateId: number) {
      calls.push(`pdf:${estimateId}`)
      return { path: 'C:/tmp/estimate.pdf' }
    },
  }

  const shell = {
    async openPath(filePath: string) {
      calls.push(`open:${filePath}`)
    },
    async showItemInFolder(filePath: string) {
      calls.push(`show:${filePath}`)
    },
  }

  const notifications = {
    success: [] as string[],
    info: [] as string[],
  }

  await exportEstimatePdfForDocuments({
    estimateId: 42,
    docs,
    shell,
    notifySuccess: (message) => notifications.success.push(message),
    notifyInfo: (message) => notifications.info.push(message),
  })

  assert.deepEqual(calls, ['pdf:42', 'open:C:/tmp/estimate.pdf'])
  assert.deepEqual(notifications.success, ['Смета экспортирована в PDF!'])
  assert.deepEqual(notifications.info, [])
})

test('documents estimate export falls back to showItemInFolder when Windows cannot auto-open the pdf', async () => {
  const calls: string[] = []

  const docs = {
    async generateEstimatePDF(estimateId: number) {
      calls.push(`pdf:${estimateId}`)
      return { path: 'C:/tmp/estimate.pdf' }
    },
  }

  const shell = {
    async openPath(filePath: string) {
      calls.push(`open:${filePath}`)
      throw new Error('shell open failed')
    },
    async showItemInFolder(filePath: string) {
      calls.push(`show:${filePath}`)
    },
  }

  const notifications = {
    success: [] as string[],
    info: [] as string[],
  }

  await exportEstimatePdfForDocuments({
    estimateId: 7,
    docs,
    shell,
    notifySuccess: (message) => notifications.success.push(message),
    notifyInfo: (message) => notifications.info.push(message),
  })

  assert.deepEqual(calls, [
    'pdf:7',
    'open:C:/tmp/estimate.pdf',
    'show:C:/tmp/estimate.pdf',
  ])
  assert.deepEqual(notifications.success, ['Смета экспортирована в PDF!'])
  assert.deepEqual(notifications.info, [
    'PDF создан, но Windows не смог открыть его автоматически',
  ])
})

test('documents estimate export supports a custom success message for print flows', async () => {
  const notifications = {
    success: [] as string[],
    info: [] as string[],
  }

  await exportEstimatePdfForDocuments({
    estimateId: 8,
    docs: {
      async generateEstimatePDF() {
        return { path: 'C:/tmp/estimate.pdf' }
      },
    },
    shell: {
      async openPath() {},
      async showItemInFolder() {},
    },
    notifySuccess: (message) => notifications.success.push(message),
    notifyInfo: (message) => notifications.info.push(message),
    successMessage: 'PDF для печати создан',
  })

  assert.deepEqual(notifications.success, ['PDF для печати создан'])
  assert.deepEqual(notifications.info, [])
})

test('formatEstimatePdfActionError preserves the real backend message when available', () => {
  assert.equal(
    formatEstimatePdfActionError(new Error('Экспорт PDF доступен только в полной версии'), 'Ошибка экспорта в PDF'),
    'Экспорт PDF доступен только в полной версии'
  )

  assert.equal(
    formatEstimatePdfActionError(
      new Error("Error invoking remote method 'docs:generateEstimatePDF': Error: Экспорт PDF доступен только в полной версии"),
      'Ошибка экспорта в PDF'
    ),
    'Экспорт PDF доступен только в полной версии'
  )

  assert.equal(
    formatEstimatePdfActionError('string failure', 'Ошибка экспорта в PDF'),
    'string failure'
  )

  assert.equal(
    formatEstimatePdfActionError(null, 'Ошибка экспорта в PDF'),
    'Ошибка экспорта в PDF'
  )
})
