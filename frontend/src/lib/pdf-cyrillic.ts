/**
 * PDF генерация с поддержкой кириллицы
 * Использует HTML-to-Print подход для надежной работы с кириллицей
 */

interface PDFOptions {
  title?: string
  filename?: string
  orientation?: 'portrait' | 'landscape'
}

interface TableColumn {
  header: string
  key: string
  width?: number
  align?: 'left' | 'center' | 'right'
}

interface DocumentData {
  title?: string
  subtitle?: string
  header?: string
  sections?: Array<{
    title?: string
    content?: string
    table?: {
      columns: TableColumn[]
      rows: any[]
      showTotal?: boolean
      totalLabel?: string
      totalValue?: string | number
    }
  }>
  signatures?: Array<{
    title: string
    name?: string
  }>
  footer?: string
}

// Генерация HTML документа
function generateHTMLDocument(data: DocumentData): string {
  let html = ''

  if (data.header) {
    html += `<div class="header">${data.header}</div>`
  }

  if (data.title) {
    html += `<h1>${data.title}</h1>`
  }

  if (data.subtitle) {
    html += `<h2>${data.subtitle}</h2>`
  }

  if (data.sections) {
    for (const section of data.sections) {
      if (section.title) {
        html += `<h3>${section.title}</h3>`
      }

      if (section.content) {
        html += `<p>${section.content}</p>`
      }

      if (section.table) {
        html += '<table>'
        html += '<thead><tr>'
        for (const col of section.table.columns) {
          const width = col.width ? `width="${col.width}%"` : ''
          html += `<th ${width}>${col.header}</th>`
        }
        html += '</tr></thead>'
        html += '<tbody>'
        for (const row of section.table.rows) {
          html += '<tr>'
          for (const col of section.table.columns) {
            const align = col.align || 'left'
            const value = row[col.key] !== undefined ? row[col.key] : ''
            html += `<td style="text-align:${align}">${value}</td>`
          }
          html += '</tr>'
        }
        html += '</tbody>'
        html += '</table>'

        if (section.table.showTotal) {
          html += `<div class="total">${section.table.totalLabel || 'Итого:'} ${section.table.totalValue}</div>`
        }
      }
    }
  }

  if (data.signatures && data.signatures.length > 0) {
    html += '<div class="signatures">'
    for (const sig of data.signatures) {
      html += `<div class="signature-block">
        <p>${sig.title}</p>
        <p>_________________ / ${sig.name || '_____________'} /</p>
      </div>`
    }
    html += '</div>'
  }

  if (data.footer) {
    html += `<div class="footer">${data.footer}</div>`
  }

  return html
}

// Открытие окна печати с PDF (работает в Electron через iframe)
export async function printDocument(data: DocumentData, options: PDFOptions = {}): Promise<void> {
  const htmlContent = generateHTMLDocument(data)
  const title = options.title || data.title || 'Document'
  const orientation = options.orientation || 'portrait'

  const fullHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        @page { 
          size: A4 ${orientation}; 
          margin: 15mm; 
        }
        * { box-sizing: border-box; }
        body {
          font-family: 'Times New Roman', Times, serif;
          font-size: 11pt;
          line-height: 1.4;
          color: #000;
          margin: 0;
          padding: 0;
        }
        table { 
          border-collapse: collapse; 
          width: 100%; 
          margin: 10px 0;
          page-break-inside: auto;
        }
        tr { page-break-inside: avoid; page-break-after: auto; }
        th, td { 
          border: 1px solid #333; 
          padding: 4px 6px; 
          text-align: left;
          font-size: 10pt;
        }
        th { 
          background: #f5f5f5; 
          font-weight: bold;
          text-align: center;
        }
        h1 { 
          text-align: center; 
          font-size: 14pt; 
          margin: 20px 0 15px;
          font-weight: bold;
        }
        h2 { 
          text-align: center; 
          font-size: 12pt;
          margin: 10px 0;
        }
        h3 {
          font-size: 11pt;
          margin: 15px 0 10px;
          font-weight: bold;
        }
        .header { 
          text-align: right; 
          margin-bottom: 20px;
          font-size: 10pt;
        }
        .signatures { 
          margin-top: 40px; 
          display: flex; 
          justify-content: space-between;
          page-break-inside: avoid;
        }
        .signature-block { 
          text-align: center;
          min-width: 200px;
        }
        .signature-block p {
          margin: 5px 0;
        }
        .total { 
          font-weight: bold; 
          text-align: right; 
          margin-top: 10px;
          font-size: 12pt;
        }
        .footer {
          margin-top: 30px;
          text-align: center;
          font-size: 9pt;
          color: #666;
        }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      ${htmlContent}
    </body>
    </html>
  `

  // Создаём скрытый iframe для печати (работает в Electron)
  const iframe = document.createElement('iframe')
  iframe.style.position = 'absolute'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = 'none'
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (doc) {
    doc.open()
    doc.write(fullHTML)
    doc.close()

    setTimeout(() => {
      iframe.contentWindow?.print()
      setTimeout(() => document.body.removeChild(iframe), 1000)
    }, 500)
  } else {
    throw new Error('Cannot open print window. Please allow popups.')
  }
}

// Сохранение как HTML файл (можно потом открыть в браузере)
export function downloadHTML(data: DocumentData, filename: string = 'document.html'): void {
  const htmlContent = generateHTMLDocument(data)
  const fullHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${data.title || 'Document'}</title>
      <style>
        body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; max-width: 210mm; margin: 20mm auto; padding: 0 15mm; }
        table { border-collapse: collapse; width: 100%; margin: 10px 0; }
        th, td { border: 1px solid #333; padding: 5px 8px; }
        th { background: #f0f0f0; font-weight: bold; }
        h1 { text-align: center; }
        .header { text-align: right; margin-bottom: 30px; }
        .signatures { margin-top: 40px; display: flex; justify-content: space-between; }
        .signature-block { text-align: center; }
        .total { font-weight: bold; text-align: right; margin-top: 15px; }
      </style>
    </head>
    <body>${htmlContent}</body>
    </html>
  `

  const blob = new Blob([fullHTML], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Форматирование валюты для отчетов
export function formatRubles(amount: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount) + ' руб.'
}

// Форматирование даты
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}
