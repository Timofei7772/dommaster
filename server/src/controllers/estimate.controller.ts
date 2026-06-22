import { Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { AuthenticatedRequest } from '../middleware/auth.middleware.js'
import XLSX from 'xlsx'
import PdfPrinter from 'pdfmake'

const fonts = {
  Roboto: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique'
  }
}
const printer = new PdfPrinter(fonts)

export const getEstimateItems = async (req: AuthenticatedRequest, res: Response) => {
  const { estimateId } = req.params

  try {
    const estimate = await prisma.estimate.findUnique({
      where: { id: Number(estimateId) },
      include: { project: true }
    })

    if (!estimate || estimate.project?.companyId !== req.user?.companyId) {
      return res.status(404).json({ message: 'Смета не найдена' })
    }

    const items = await prisma.estimateItem.findMany({
      where: { estimateId: Number(estimateId) },
      include: {
        executor: { select: { id: true, fullName: true, role: true } }
      },
      orderBy: { id: 'asc' }
    })

    // Приведение к формату, ожидаемому фронтендом (snake_case)
    const formatted = items.map(i => ({
      id: i.id,
      estimate_id: i.estimateId,
      item_number: i.itemNumber,
      name: i.name,
      unit: i.unit,
      quantity: i.quantity,
      materials_price: i.materialsPrice,
      labor_price: i.laborPrice,
      total: i.total,
      row_type: i.rowType,
      is_work: i.isWork,
      executor_id: i.executorId,
      done_at: i.doneAt ? i.doneAt.toISOString().split('T')[0] : null,
      executor_name: i.executor ? i.executor.fullName : null
    }))

    return res.json(formatted)
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка получения позиций сметы: ' + err.message })
  }
}

export const assignItemExecutor = async (req: AuthenticatedRequest, res: Response) => {
  const { itemId } = req.params
  const { executor_id } = req.body

  try {
    const item = await prisma.estimateItem.findUnique({
      where: { id: Number(itemId) },
      include: { estimate: { include: { project: true } } }
    })

    if (!item || item.estimate.project?.companyId !== req.user?.companyId) {
      return res.status(404).json({ message: 'Сметная позиция не найдена' })
    }

    if (executor_id) {
      // Проверяем, что мастер из той же компании
      const worker = await prisma.user.findFirst({
        where: { id: Number(executor_id), companyId: req.user?.companyId }
      })
      if (!worker) {
        return res.status(400).json({ message: 'Мастер не найден в вашей компании' })
      }
    }

    const updated = await prisma.estimateItem.update({
      where: { id: Number(itemId) },
      data: { executorId: executor_id ? Number(executor_id) : null },
      include: { executor: { select: { id: true, fullName: true } } }
    })

    return res.json({
      id: updated.id,
      estimate_id: updated.estimateId,
      item_number: updated.itemNumber,
      name: updated.name,
      unit: updated.unit,
      quantity: updated.quantity,
      materials_price: updated.materialsPrice,
      labor_price: updated.laborPrice,
      total: updated.total,
      row_type: updated.rowType,
      is_work: updated.isWork,
      executor_id: updated.executorId,
      done_at: updated.doneAt ? updated.doneAt.toISOString() : null,
      executor_name: updated.executor ? updated.executor.fullName : null
    })
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка назначения исполнителя: ' + err.message })
  }
}

export const completeItem = async (req: AuthenticatedRequest, res: Response) => {
  const { itemId } = req.params
  const { is_completed } = req.body

  try {
    const item = await prisma.estimateItem.findUnique({
      where: { id: Number(itemId) },
      include: { estimate: { include: { project: true } } }
    })

    if (!item || item.estimate.project?.companyId !== req.user?.companyId) {
      return res.status(404).json({ message: 'Сметная позиция не найдена' })
    }

    const updated = await prisma.estimateItem.update({
      where: { id: Number(itemId) },
      data: { doneAt: is_completed ? new Date() : null },
      include: { executor: { select: { id: true, fullName: true } } }
    })

    return res.json({
      id: updated.id,
      estimate_id: updated.estimateId,
      item_number: updated.itemNumber,
      name: updated.name,
      unit: updated.unit,
      quantity: updated.quantity,
      materials_price: updated.materialsPrice,
      labor_price: updated.laborPrice,
      total: updated.total,
      row_type: updated.rowType,
      is_work: updated.isWork,
      executor_id: updated.executorId,
      done_at: updated.doneAt ? updated.doneAt.toISOString() : null,
      executor_name: updated.executor ? updated.executor.fullName : null
    })
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка отметки выполнения: ' + err.message })
  }
}

export const exportToExcel = async (req: AuthenticatedRequest, res: Response) => {
  const { estimateId } = req.params

  try {
    const estimate = await prisma.estimate.findUnique({
      where: { id: Number(estimateId) },
      include: { project: true }
    })

    if (!estimate || estimate.project?.companyId !== req.user?.companyId) {
      return res.status(404).json({ message: 'Смета не найдена' })
    }

    const items = await prisma.estimateItem.findMany({
      where: { estimateId: Number(estimateId) },
      orderBy: { id: 'asc' }
    })

    const data = items.map((i, index) => ({
      '№': index + 1,
      'Номер расценки': i.itemNumber || '',
      'Наименование работ/материалов': i.name,
      'Ед. изм.': i.unit,
      'Количество': i.quantity,
      'Цена мат. (руб)': i.materialsPrice,
      'Цена раб. (руб)': i.laborPrice,
      'Всего по позиции (руб)': i.total
    }))

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(data)
    XLSX.utils.book_append_sheet(wb, ws, 'Смета')

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename=estimate-${estimateId}.xlsx`)
    return res.send(buffer)
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка экспорта Excel: ' + err.message })
  }
}

export const exportToPDF = async (req: AuthenticatedRequest, res: Response) => {
  const { estimateId } = req.params

  try {
    const estimate = await prisma.estimate.findUnique({
      where: { id: Number(estimateId) },
      include: { project: true }
    })

    if (!estimate || estimate.project?.companyId !== req.user?.companyId) {
      return res.status(404).json({ message: 'Смета не найдена' })
    }

    const items = await prisma.estimateItem.findMany({
      where: { estimateId: Number(estimateId) },
      orderBy: { id: 'asc' }
    })

    const tableRows = items.map((i, index) => [
      index + 1,
      i.itemNumber || '',
      i.name,
      i.unit,
      i.quantity,
      (i.materialsPrice + i.laborPrice).toLocaleString() + ' руб',
      i.total.toLocaleString() + ' руб'
    ])

    const docDefinition: any = {
      content: [
        { text: 'СМЕТНЫЙ РАСЧЕТ СТОИМОСТИ', style: 'header', alignment: 'center' },
        { text: `Смета №: ${estimate.number || estimate.id} - ${estimate.name}`, style: 'subheader' },
        { text: `Проект: ${estimate.project?.name || 'Вне проекта'}`, style: 'subheader' },
        { text: `Дата создания: ${estimate.createdAt.toLocaleDateString('ru-RU')}`, margin: [0, 0, 0, 15] },
        {
          table: {
            headerRows: 1,
            widths: [20, 60, '*', 30, 45, 75, 80],
            body: [
              ['№', 'Шифр', 'Описание', 'Ед.', 'Кол-во', 'Цена/ед', 'Всего'],
              ...tableRows
            ]
          }
        },
        { text: `\nИТОГО ПО СМЕТЕ (БЕЗ НДС): ${estimate.totalCost.toLocaleString()} руб`, style: 'totalText', alignment: 'right' },
        { text: `НДС (${estimate.vatPercent}%): ${estimate.vatCost.toLocaleString()} руб`, style: 'totalText', alignment: 'right' },
        { text: `ИТОГО С НДС: ${estimate.totalWithVat.toLocaleString()} руб`, style: 'total', alignment: 'right' }
      ],
      styles: {
        header: { fontSize: 16, bold: true, margin: [0, 0, 0, 10] },
        subheader: { fontSize: 12, bold: true, margin: [0, 0, 0, 5] },
        totalText: { fontSize: 11, bold: false, margin: [0, 2, 0, 0] },
        total: { fontSize: 14, bold: true, margin: [0, 10, 0, 0] }
      }
    }

    const pdfDoc = printer.createPdfKitDocument(docDefinition)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename=estimate-${estimateId}.pdf`)
    pdfDoc.pipe(res)
    pdfDoc.end()
  } catch (err: any) {
    return res.status(500).json({ message: 'Ошибка экспорта PDF: ' + err.message })
  }
}
