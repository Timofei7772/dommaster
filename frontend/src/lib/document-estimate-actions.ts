import { normalizeError } from './error-normalizer.ts'

type EstimatePdfDocsApi = {
  generateEstimatePDF: (estimateId: number) => Promise<{ path: string }>
}

type EstimatePdfShellApi = {
  openPath: (path: string) => Promise<void>
  showItemInFolder: (path: string) => Promise<void>
}

type ExportEstimatePdfArgs = {
  estimateId: number
  docs: EstimatePdfDocsApi
  shell: EstimatePdfShellApi
  notifySuccess: (message: string) => void
  notifyInfo: (message: string) => void
  successMessage?: string
}

export function formatEstimatePdfActionError(
  error: unknown,
  fallbackMessage: string
) {
  return normalizeError(error, fallbackMessage)
}

export async function openGeneratedEstimatePdf(
  filePath: string,
  shell: EstimatePdfShellApi,
  notifySuccess: (message: string) => void,
  notifyInfo: (message: string) => void,
  successMessage: string
) {
  notifySuccess(successMessage)

  try {
    await shell.openPath(filePath)
  } catch {
    notifyInfo('PDF создан, но Windows не смог открыть его автоматически')
    try {
      await shell.showItemInFolder(filePath)
    } catch {
      // Если Проводник тоже не открылся, оставляем уже показанное уведомление.
    }
  }
}

export async function exportEstimatePdfForDocuments({
  estimateId,
  docs,
  shell,
  notifySuccess,
  notifyInfo,
  successMessage = 'Смета экспортирована в PDF!',
}: ExportEstimatePdfArgs) {
  let result: { path: string }

  try {
    result = await docs.generateEstimatePDF(estimateId)
  } catch (error) {
    throw new Error(
      formatEstimatePdfActionError(error, 'Не удалось создать PDF сметы')
    )
  }

  if (!result?.path) {
    throw new Error('Не удалось создать PDF сметы')
  }

  await openGeneratedEstimatePdf(
    result.path,
    shell,
    notifySuccess,
    notifyInfo,
    successMessage
  )

  return result
}
