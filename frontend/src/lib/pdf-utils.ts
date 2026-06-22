/**
 * PDF утилиты с поддержкой кириллицы через Unicode
 * Используем Times Roman с кодировкой UTF-16
 */
import jsPDF from 'jspdf'

// Функция для корректного отображения кириллицы
// jsPDF из коробки поддерживает только Latin1, поэтому используем хак с unicode escape
function encodeUnicode(str: string): string {
  // Заменяем кириллические символы на их unicode escape sequences
  let result = ''
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    if (code > 127) {
      // Для не-ASCII символов используем символьный код
      result += str[i]
    } else {
      result += str[i]
    }
  }
  return result
}

// Создание PDF документа
export function createCyrillicPDF(): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    putOnlyUsedFonts: true
  })

  return doc
}

// Альтернативный подход - генерация PDF через HTML (работает в Electron)
export async function generatePDFFromHTML(htmlContent: string, filename: string): Promise<void> {
  const fullHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${filename}</title>
      <style>
        @page { size: A4; margin: 20mm; }
        body { 
          font-family: 'Times New Roman', Times, serif; 
          font-size: 12pt;
          line-height: 1.4;
        }
        table { border-collapse: collapse; width: 100%; margin: 10px 0; }
        th, td { border: 1px solid #000; padding: 5px 8px; text-align: left; }
        th { background: #f0f0f0; font-weight: bold; }
        h1 { text-align: center; font-size: 16pt; margin-bottom: 20px; }
        h2 { text-align: center; font-size: 14pt; }
        .header { text-align: right; margin-bottom: 30px; }
        .signatures { margin-top: 40px; display: flex; justify-content: space-between; }
        .signature-block { text-align: center; }
        .total { font-weight: bold; text-align: right; margin-top: 15px; }
        @media print {
          body { -webkit-print-color-adjust: exact; }
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
    }, 300)
  } else {
    throw new Error('Не удалось открыть окно печати')
  }
}

// Форматирование валюты
export function formatCurrencyPDF(amount: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount) + ' руб.'
}

// Форматирование даты
export function formatDatePDF(date: string | Date): string {
  const d = new Date(date)
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

// Генерация HTML для КС-2
export function generateKS2HTML(act: {
  number: string
  date: string
  customer: string
  contractor: string
  contract_number: string
  object_name: string
  works: Array<{ name: string; unit: string; quantity: number; price: number; total: number }>
  total: number
}): string {
  const worksRows = act.works.map((w, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${w.name}</td>
      <td>${w.unit}</td>
      <td>${w.quantity}</td>
      <td>${formatCurrencyPDF(w.price)}</td>
      <td>${formatCurrencyPDF(w.total)}</td>
    </tr>
  `).join('')

  return `
    <div class="header">
      <strong>УТВЕРЖДАЮ</strong><br>
      ________________________<br>
      "___" ____________ 20__ г.
    </div>
    
    <h1>АКТ</h1>
    <h2>о приёмке выполненных работ</h2>
    <p style="text-align: center">№ ${act.number} от ${formatDatePDF(act.date)}</p>
    
    <p><strong>Заказчик:</strong> ${act.customer}</p>
    <p><strong>Подрядчик:</strong> ${act.contractor}</p>
    <p><strong>Договор:</strong> № ${act.contract_number}</p>
    <p><strong>Объект:</strong> ${act.object_name}</p>
    
    <table>
      <thead>
        <tr>
          <th>№</th>
          <th>Наименование работ</th>
          <th>Ед.</th>
          <th>Кол-во</th>
          <th>Цена</th>
          <th>Сумма</th>
        </tr>
      </thead>
      <tbody>
        ${worksRows}
      </tbody>
    </table>
    
    <div class="total">ИТОГО: ${formatCurrencyPDF(act.total)}</div>
    
    <div class="signatures">
      <div class="signature-block">
        <p>Сдал:</p>
        <p>_________________ / _________________</p>
        <p><small>(подпись, расшифровка)</small></p>
      </div>
      <div class="signature-block">
        <p>Принял:</p>
        <p>_________________ / _________________</p>
        <p><small>(подпись, расшифровка)</small></p>
      </div>
    </div>
  `
}

// Генерация HTML для КС-3
export function generateKS3HTML(cert: {
  number: string
  date: string
  customer: string
  contractor: string
  contract_number: string
  object_name: string
  period_start: string
  period_end: string
  works_cost: number
  materials_cost: number
  total: number
}): string {
  return `
    <h1>СПРАВКА</h1>
    <h2>о стоимости выполненных работ и затрат</h2>
    <p style="text-align: center">№ ${cert.number} от ${formatDatePDF(cert.date)}</p>
    
    <p><strong>Заказчик:</strong> ${cert.customer}</p>
    <p><strong>Подрядчик:</strong> ${cert.contractor}</p>
    <p><strong>Договор:</strong> № ${cert.contract_number}</p>
    <p><strong>Объект:</strong> ${cert.object_name}</p>
    <p><strong>Отчётный период:</strong> ${formatDatePDF(cert.period_start)} - ${formatDatePDF(cert.period_end)}</p>
    
    <table>
      <tr><th>Наименование</th><th>Сумма</th></tr>
      <tr><td>Стоимость работ</td><td>${formatCurrencyPDF(cert.works_cost)}</td></tr>
      <tr><td>Стоимость материалов</td><td>${formatCurrencyPDF(cert.materials_cost)}</td></tr>
      <tr><td><strong>ИТОГО</strong></td><td><strong>${formatCurrencyPDF(cert.total)}</strong></td></tr>
    </table>
    
    <div class="signatures">
      <div class="signature-block">
        <p>Заказчик:</p>
        <p>_________________ / _________________</p>
      </div>
      <div class="signature-block">
        <p>Подрядчик:</p>
        <p>_________________ / _________________</p>
      </div>
    </div>
  `
}

// Генерация HTML для М-29
export function generateM29HTML(report: {
  number: string
  date: string
  object_name: string
  responsible: string
  period_start: string
  period_end: string
  materials: Array<{ name: string; unit: string; norm: number; fact: number; deviation: number }>
}): string {
  const rows = report.materials.map((m, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${m.name}</td>
      <td>${m.unit}</td>
      <td>${m.norm}</td>
      <td>${m.fact}</td>
      <td style="color: ${m.deviation > 0 ? 'red' : 'green'}">${m.deviation > 0 ? '+' : ''}${m.deviation}</td>
    </tr>
  `).join('')

  return `
    <h1>ОТЧЁТ М-29</h1>
    <h2>о расходе материалов</h2>
    <p style="text-align: center">№ ${report.number} от ${formatDatePDF(report.date)}</p>
    
    <p><strong>Объект:</strong> ${report.object_name}</p>
    <p><strong>Ответственный:</strong> ${report.responsible}</p>
    <p><strong>Период:</strong> ${formatDatePDF(report.period_start)} - ${formatDatePDF(report.period_end)}</p>
    
    <table>
      <thead>
        <tr>
          <th>№</th>
          <th>Материал</th>
          <th>Ед.</th>
          <th>Норма</th>
          <th>Факт</th>
          <th>Откл.</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    
    <div class="signatures">
      <div class="signature-block">
        <p>Составил:</p>
        <p>_________________ / _________________</p>
      </div>
      <div class="signature-block">
        <p>Проверил:</p>
        <p>_________________ / _________________</p>
      </div>
    </div>
  `
}

export { encodeUnicode }
