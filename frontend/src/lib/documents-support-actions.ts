import { normalizeError } from './error-normalizer.ts'

type PackageGenerationResult = {
  folder: string
  generated: Array<{ type: string; path: string }>
  errors: string[]
}

type DocumentPackageApi = {
  generatePackage: (estimateId: number) => Promise<PackageGenerationResult>
}

type DiagnosticsApi = {
  openLogsFolder: () => Promise<{ path?: string } | void>
  exportBundle: () => Promise<{ path: string }>
}

type ShellApi = {
  openPath: (path: string) => Promise<void>
  showItemInFolder: (path: string) => Promise<void>
}

type GeneratePackageArgs = {
  estimateId: number
  docs: DocumentPackageApi
  shell: ShellApi
  notifySuccess: (message: string) => void
  notifyInfo: (message: string) => void
}

type DiagnosticsOpenArgs = {
  diagnostics: DiagnosticsApi
}

type DiagnosticsExportArgs = {
  diagnostics: DiagnosticsApi
  notifySuccess: (message: string) => void
}

async function openGeneratedPackageFolder(
  folderPath: string,
  generated: Array<{ type: string; path: string }>,
  shell: ShellApi,
  notifyInfo: (message: string) => void
) {
  try {
    await shell.openPath(folderPath)
  } catch {
    notifyInfo('Пакет создан, но Windows не смог открыть папку автоматически')
    const fallbackPath = generated[0]?.path || folderPath
    try {
      await shell.showItemInFolder(fallbackPath)
    } catch {
      // Если и Проводник не открылся, оставляем уже показанное уведомление.
    }
  }
}

export async function generatePackageForDocuments({
  estimateId,
  docs,
  shell,
  notifySuccess,
  notifyInfo,
}: GeneratePackageArgs) {
  let result: PackageGenerationResult

  try {
    result = await docs.generatePackage(estimateId)
  } catch (error) {
    throw new Error(
      normalizeError(error, 'Не удалось сформировать пакет документов')
    )
  }

  if (!result?.generated?.length) {
    const message = result?.errors?.length
      ? result.errors.join('; ')
      : 'Не удалось сформировать пакет документов'
    throw new Error(
      normalizeError(message, 'Не удалось сформировать пакет документов')
    )
  }

  if (result.errors.length > 0) {
    notifyInfo(`Пакет сформирован частично: ${result.generated.length} файлов, ошибок: ${result.errors.length}`)
  } else {
    notifySuccess('Пакет документов сформирован!')
  }

  await openGeneratedPackageFolder(result.folder, result.generated, shell, notifyInfo)
  return result
}

export async function openDiagnosticsLogsForDocuments({ diagnostics }: DiagnosticsOpenArgs) {
  try {
    return await diagnostics.openLogsFolder()
  } catch (error) {
    throw new Error(normalizeError(error, 'Не удалось открыть папку логов'))
  }
}

export async function exportDiagnosticsBundleForDocuments({
  diagnostics,
  notifySuccess,
}: DiagnosticsExportArgs) {
  let result: { path: string }

  try {
    result = await diagnostics.exportBundle()
  } catch (error) {
    throw new Error(normalizeError(error, 'Не удалось экспортировать диагностику'))
  }

  if (!result?.path) {
    throw new Error('Не удалось экспортировать диагностику')
  }

  notifySuccess('Диагностика экспортирована')
  return result
}
