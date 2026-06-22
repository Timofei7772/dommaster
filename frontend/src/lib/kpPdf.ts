import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import { RobotoFont } from '@/lib/fonts/roboto'
import { formatCurrency } from '@/lib/utils'
import { getItemTotal, getItemPrice, r } from '@/hooks/useEstimateFinance'

// ─── Типы ────────────────────────────────────────────

export interface KPExportData {
  kpNumber: string
  kpDate: string
  validUntil: string

  company: {
    name: string
    inn: string
    kpp: string
    address: string
    phone: string
    email: string
    director: string
    directorPosition: string
  }

  client: {
    name: string
    phone: string
    email: string
    address: string
  }

  displayItems: any[]
  worksTotal: number
  materialsTotal: number
  clientPrice: number
  discountAmount: number
  discount: number
  finalTotal: number

  template: {
    primaryColor: string
    style: 'classic' | 'modern' | 'minimal'
  }

  options: {
    showMaterialsSeparately: boolean
    showOnlyTotal: boolean
    roundAmounts: boolean
  }

  notes: string
  logo?: string
}

// ─── PDF генерация ───────────────────────────────────

export function exportKPtoPDF(data: KPExportData) {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.width
  const rv = (v: number) => r(v, data.options.roundAmounts)

  // Шрифт Roboto для кириллицы
  doc.addFileToVFS('Roboto-Regular.ttf', RobotoFont)
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal')
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'bold')
  doc.setFont('Roboto')

  // ── Шапка компании ──
  doc.setFontSize(18)
  doc.setTextColor(data.template.primaryColor)
  doc.text(data.company.name, 14, 20)

  doc.setFontSize(10)
  doc.setTextColor(100)
  if (data.company.address) doc.text(data.company.address, 14, 28)
  const contactLine = [
    data.company.phone && `Тел: ${data.company.phone}`,
    data.company.email && `Email: ${data.company.email}`,
  ].filter(Boolean).join(' | ')
  if (contactLine) doc.text(contactLine, 14, 34)
  if (data.company.inn) doc.text(`ИНН: ${data.company.inn}`, 14, 40)

  // ── Заголовок КП ──
  doc.setFontSize(16)
  doc.setTextColor(0)
  doc.text(`КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ № ${data.kpNumber}`, pageWidth / 2, 55, { align: 'center' })

  doc.setFontSize(10)
  doc.text(`от ${data.kpDate}`, pageWidth / 2, 62, { align: 'center' })
  doc.text(`Действительно до: ${data.validUntil}`, pageWidth / 2, 68, { align: 'center' })

  // ── Заказчик ──
  doc.setFontSize(11)
  doc.setTextColor(50)
  doc.text('Заказчик:', 14, 80)
  doc.setTextColor(0)
  if (data.client.name) doc.text(data.client.name, 14, 86)
  const clientContact = [data.client.phone, data.client.email].filter(Boolean).join(', ')
  if (clientContact) doc.text(`Контакт: ${clientContact}`, 14, 92)
  if (data.client.address) doc.text(`Адрес: ${data.client.address}`, 14, clientContact ? 98 : 92)

  let currentY = 106

  // ── Таблица работ ──
  if (!data.options.showOnlyTotal && data.displayItems.length > 0) {
    const tableData = data.displayItems.map((item, i) => {
      const total = rv(getItemTotal(item))
      const price = rv(getItemPrice(item))
      return [
        i + 1,
        item.name || '',
        item.unit || 'шт',
        Number(item.quantity || 0),
        formatCurrency(price),
        formatCurrency(total),
      ]
    })

    autoTable(doc, {
      startY: currentY,
      head: [['№', 'Наименование работ', 'Ед.изм.', 'Кол-во', 'Цена', 'Сумма']],
      body: tableData,
      theme: data.template.style === 'minimal' ? 'plain' : 'striped',
      headStyles: {
        fillColor: data.template.primaryColor,
        textColor: '#ffffff',
        fontStyle: 'bold',
        font: 'Roboto',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 12 },
        2: { halign: 'center', cellWidth: 18 },
        3: { halign: 'center', cellWidth: 18 },
        4: { halign: 'right', cellWidth: 28 },
        5: { halign: 'right', cellWidth: 32 },
      },
      styles: { fontSize: 9, font: 'Roboto' },
    })

    currentY = (doc as any).lastAutoTable.finalY + 10
  }

  // ── Итоги ──
  doc.setFontSize(10)
  doc.setFont('Roboto', 'normal')

  if (data.options.showMaterialsSeparately && !data.options.showOnlyTotal) {
    doc.text(`Работы: ${formatCurrency(rv(data.worksTotal))}`, pageWidth - 14, currentY, { align: 'right' })
    currentY += 6
    doc.text(`Материалы: ${formatCurrency(rv(data.materialsTotal))}`, pageWidth - 14, currentY, { align: 'right' })
    currentY += 6
  }

  doc.text(`Подытог: ${formatCurrency(rv(data.clientPrice))}`, pageWidth - 14, currentY, { align: 'right' })
  currentY += 6

  if (data.discount > 0) {
    doc.setTextColor(34, 197, 94)
    doc.text(`Скидка ${data.discount}%: -${formatCurrency(rv(data.discountAmount))}`, pageWidth - 14, currentY, { align: 'right' })
    currentY += 6
  }

  doc.setFontSize(12)
  doc.setTextColor(0)
  doc.setFont('Roboto', 'normal')
  doc.text(`ИТОГО: ${formatCurrency(rv(data.finalTotal))}`, pageWidth - 14, currentY + 2, { align: 'right' })
  currentY += 12

  // ── Примечания ──
  if (data.notes) {
    doc.setFont('Roboto', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text('Примечания:', 14, currentY)
    const splitNotes = doc.splitTextToSize(data.notes, pageWidth - 28)
    doc.text(splitNotes, 14, currentY + 5)
    currentY += 5 + splitNotes.length * 4
  }

  // ── Подпись ──
  doc.setFontSize(10)
  doc.setTextColor(0)
  doc.setFont('Roboto', 'normal')
  const sigY = Math.min(280, currentY + 20)
  doc.text(`${data.company.directorPosition}: ${data.company.director}`, 14, sigY)
  doc.text('___________________ / ___________________', pageWidth - 14, sigY, { align: 'right' })

  doc.save(`${data.kpNumber}.pdf`)
}

// ─── Excel генерация ─────────────────────────────────

export function exportKPtoExcel(data: KPExportData) {
  const rv = (v: number) => r(v, data.options.roundAmounts)

  const rows = data.displayItems.map((item, i) => ({
    '№': i + 1,
    'Наименование': item.name || '',
    'Ед.': item.unit || 'шт',
    'Кол-во': Number(item.quantity || 0),
    'Цена': rv(getItemPrice(item)),
    'Сумма': rv(getItemTotal(item)),
  }))

  if (data.discount > 0) {
    rows.push({
      '№': '' as any,
      'Наименование': `Скидка ${data.discount}%`,
      'Ед.': '',
      'Кол-во': '' as any,
      'Цена': '' as any,
      'Сумма': -rv(data.discountAmount),
    })
  }

  rows.push({
    '№': '' as any,
    'Наименование': 'ИТОГО:',
    'Ед.': '',
    'Кол-во': '' as any,
    'Цена': '' as any,
    'Сумма': rv(data.finalTotal),
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'КП')
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  saveAs(new Blob([buf]), `${data.kpNumber}.xlsx`)
}
