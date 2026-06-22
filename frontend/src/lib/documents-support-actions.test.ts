import assert from 'node:assert/strict'
import test from 'node:test'

import {
  exportDiagnosticsBundleForDocuments,
  generatePackageForDocuments,
  openDiagnosticsLogsForDocuments,
} from './documents-support-actions.ts'

test('documents package generation opens the package folder and shows success for a full package', async () => {
  const calls: string[] = []
  const notifications = {
    success: [] as string[],
    info: [] as string[],
  }

  const docs = {
    async generatePackage(estimateId: number) {
      calls.push(`package:${estimateId}`)
      return {
        folder: 'C:/tmp/project-documents',
        generated: [
          { type: 'Смета', path: 'C:/tmp/project-documents/estimate.pdf' },
          { type: 'Договор', path: 'C:/tmp/project-documents/contract.docx' },
        ],
        errors: [],
      }
    },
  }

  const shell = {
    async openPath(target: string) {
      calls.push(`open:${target}`)
    },
    async showItemInFolder(target: string) {
      calls.push(`show:${target}`)
    },
  }

  const result = await generatePackageForDocuments({
    estimateId: 17,
    docs,
    shell,
    notifySuccess: (message) => notifications.success.push(message),
    notifyInfo: (message) => notifications.info.push(message),
  })

  assert.equal(result.generated.length, 2)
  assert.deepEqual(calls, ['package:17', 'open:C:/tmp/project-documents'])
  assert.deepEqual(notifications.success, ['Пакет документов сформирован!'])
  assert.deepEqual(notifications.info, [])
})

test('documents package generation keeps partial success visible and opens the folder', async () => {
  const calls: string[] = []
  const notifications = {
    success: [] as string[],
    info: [] as string[],
  }

  const docs = {
    async generatePackage() {
      return {
        folder: 'C:/tmp/project-documents',
        generated: [
          { type: 'Смета', path: 'C:/tmp/project-documents/estimate.pdf' },
          { type: 'Договор', path: 'C:/tmp/project-documents/contract.docx' },
        ],
        errors: ['КС-3: test failure'],
      }
    },
  }

  const shell = {
    async openPath(target: string) {
      calls.push(`open:${target}`)
    },
    async showItemInFolder(target: string) {
      calls.push(`show:${target}`)
    },
  }

  await generatePackageForDocuments({
    estimateId: 17,
    docs,
    shell,
    notifySuccess: (message) => notifications.success.push(message),
    notifyInfo: (message) => notifications.info.push(message),
  })

  assert.deepEqual(calls, ['open:C:/tmp/project-documents'])
  assert.deepEqual(notifications.success, [])
  assert.deepEqual(notifications.info, ['Пакет сформирован частично: 2 файлов, ошибок: 1'])
})

test('documents package generation throws when no files were created', async () => {
  const docs = {
    async generatePackage() {
      return {
        folder: 'C:/tmp/project-documents',
        generated: [],
        errors: ['Смета: failed', 'Договор: failed'],
      }
    },
  }

  const shell = {
    async openPath() {},
    async showItemInFolder() {},
  }

  await assert.rejects(async () => {
    await generatePackageForDocuments({
      estimateId: 17,
      docs,
      shell,
      notifySuccess: () => {},
      notifyInfo: () => {},
    })
  }, /Смета: failed; Договор: failed/)
})

test('documents support helpers normalize raw Electron invoke errors', async () => {
  await assert.rejects(async () => {
    await generatePackageForDocuments({
      estimateId: 17,
      docs: {
        async generatePackage() {
          throw new Error(
            "Error invoking remote method 'docs:generatePackage': Error: PDF_LICENSE_REQUIRED"
          )
        },
      },
      shell: {
        async openPath() {},
        async showItemInFolder() {},
      },
      notifySuccess: () => {},
      notifyInfo: () => {},
    })
  }, /Экспорт PDF доступен только в полной версии/)

  await assert.rejects(async () => {
    await exportDiagnosticsBundleForDocuments({
      diagnostics: {
        async openLogsFolder() {
          return undefined
        },
        async exportBundle() {
          throw new Error(
            "Error invoking remote method 'diagnostics:exportBundle': Error: NO_DATA"
          )
        },
      },
      notifySuccess: () => {},
    })
  }, /Нет данных для формирования документа/)
})

test('documents diagnostics actions proxy to diagnostics api and keep user messages simple', async () => {
  const calls: string[] = []
  const notifications = {
    success: [] as string[],
  }

  const diagnostics = {
    async openLogsFolder() {
      calls.push('open-logs')
      return { path: 'C:/Users/User/AppData/Roaming/SmetaAI/logs' }
    },
    async exportBundle() {
      calls.push('export-bundle')
      return { path: 'C:/Users/User/AppData/Roaming/SmetaAI/diagnostics/diagnostics.zip' }
    },
  }

  await openDiagnosticsLogsForDocuments({ diagnostics })
  const bundle = await exportDiagnosticsBundleForDocuments({
    diagnostics,
    notifySuccess: (message) => notifications.success.push(message),
  })

  assert.equal(bundle.path.endsWith('diagnostics.zip'), true)
  assert.deepEqual(calls, ['open-logs', 'export-bundle'])
  assert.deepEqual(notifications.success, ['Диагностика экспортирована'])
})
