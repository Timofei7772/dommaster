import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { 
  Upload, 
  FileSpreadsheet, 
  CheckCircle, 
  Package,
  Hammer,
  FileText,
  Download,
  Trash2,
  Eye,
  Plus,
  ClipboardList,
  AlertCircle
} from 'lucide-react'
import toast from 'react-hot-toast'
import { estimatesApi, api } from '@/lib/api'

interface ImportedWork {
  id: number
  code: string
  name: string
  unit: string
  price: number
  category?: string
}

interface ImportedMaterial {
  id: number
  code: string
  name: string
  unit: string
  price: number
  supplier?: string
}

interface DefektovkaItem {
  id: number
  num: string
  name: string
  unit: string
  quantity: number
  price: number
  total: number
  type: 'work' | 'material' | 'section'
  section?: string
}

interface DefektovkaData {
  name: string
  workCoef: number
  materialCoef: number
  items: DefektovkaItem[]
  totalWorks: number
  totalMaterials: number
}

export default function ImportData() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'works' | 'materials' | 'defektovka' | 'templates'>('defektovka')
  const [importedWorks, setImportedWorks] = useState<ImportedWork[]>([])
  const [importedMaterials, setImportedMaterials] = useState<ImportedMaterial[]>([])
  const [defektovkaData, setDefektovkaData] = useState<DefektovkaData | null>(null)
  const [importing, setImporting] = useState(false)
  const [estimateName, setEstimateName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const defektovkaInputRef = useRef<HTMLInputElement>(null)

  // Парсинг файла дефектовки формата ZARU AI смета
  const parseDefektovka = async (file: File): Promise<DefektovkaData> => {
    const data = await file.arrayBuffer()
    const workbook = XLSX.read(data)
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    
    // Преобразуем в массив массивов для удобного парсинга
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    
    // Ищем коэффициенты в первых строках
    let workCoef = 1.8
    let materialCoef = 1.04
    let objectName = ''
    
    // Парсим шапку (первые 10 строк)
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const row = rows[i]
      if (!row) continue
      
      const rowStr = row.join(' ').toLowerCase()
      
      // Ищем коэффициент работ
      if (rowStr.includes('коэфф') && rowStr.includes('работ')) {
        const numMatch = row[0]
        if (typeof numMatch === 'number') workCoef = numMatch
      }
      // Ищем коэффициент материалов
      if (rowStr.includes('коэфф') && rowStr.includes('материал')) {
        const numMatch = row[0]
        if (typeof numMatch === 'number') materialCoef = numMatch
      }
      // Ищем название объекта (обычно длинная строка без чисел)
      const cellA = row[0]
      const cellB = row[1]
      if (typeof cellA === 'string' && cellA.length > 20 && !cellA.match(/коэфф|№|наименование|ед.*изм/i)) {
        objectName = cellA
      } else if (typeof cellB === 'string' && cellB.length > 20 && !cellB.match(/коэфф|№|наименование|ед.*изм/i)) {
        objectName = cellB
      }
    }
    
    // Ищем заголовок таблицы (№ п/п, Наименование, ед.изм, Кол-во, Цена, Стоимость)
    let headerRow = -1
    for (let i = 0; i < Math.min(15, rows.length); i++) {
      const row = rows[i]
      if (!row) continue
      const rowStr = row.join(' ').toLowerCase()
      if ((rowStr.includes('наименование') || rowStr.includes('название')) && 
          (rowStr.includes('ед') || rowStr.includes('кол'))) {
        headerRow = i
        break
      }
    }
    
    if (headerRow === -1) {
      // Пробуем найти по первой строке с числовыми данными
      for (let i = 5; i < rows.length; i++) {
        const row = rows[i]
        if (row && row[0] && (row[0] === 1 || row[0] === '1' || String(row[0]).match(/^\d+$/))) {
          headerRow = i - 1
          break
        }
      }
    }
    
    const items: DefektovkaItem[] = []
    let currentSection = ''
    let totalWorks = 0
    let totalMaterials = 0
    let itemId = 1
    
    // Парсим данные начиная после заголовка
    const startRow = headerRow >= 0 ? headerRow + 2 : 8 // +2 чтобы пропустить заголовок и номера колонок
    
    for (let i = startRow; i < rows.length; i++) {
      const row = rows[i]
      if (!row || row.length < 2) continue
      
      const numCell = row[0]
      const nameCell = row[1]
      const unitCell = row[2]
      const qtyCell = row[3]
      const priceCell = row[4]
      const totalCell = row[5]
      const typeCell = row[6] || row[7] // k или тип (р/м)
      
      // Пропускаем пустые строки и итоги
      if (!nameCell) continue
      const nameLower = String(nameCell).toLowerCase()
      if (nameLower.includes('итого') || nameLower.includes('всего') || nameLower.includes('в том числе')) continue
      
      // Проверяем, это раздел?
      if (nameLower.startsWith('раздел') || (numCell && !qtyCell && !priceCell && String(nameCell).length > 5)) {
        currentSection = String(nameCell).replace(/^раздел[:\s]*/i, '')
        continue
      }
      
      // Определяем тип: работа или материал
      let itemType: 'work' | 'material' = 'work'
      if (typeCell) {
        const typeStr = String(typeCell).toLowerCase()
        if (typeStr === 'м' || typeStr === 'm' || typeStr.includes('мат')) {
          itemType = 'material'
        }
      }
      
      // Парсим числа
      const quantity = parseFloat(String(qtyCell || 0).replace(',', '.').replace(/[^\d.-]/g, '')) || 0
      const price = parseFloat(String(priceCell || 0).replace(',', '.').replace(/[^\d.-]/g, '')) || 0
      const total = parseFloat(String(totalCell || 0).replace(',', '.').replace(/[^\d.-]/g, '')) || (quantity * price)
      
      if (!quantity && !price && !total) continue // Пропускаем пустые позиции
      
      items.push({
        id: itemId++,
        num: String(numCell || itemId),
        name: String(nameCell),
        unit: String(unitCell || 'шт'),
        quantity,
        price,
        total,
        type: itemType,
        section: currentSection
      })
      
      if (itemType === 'work') {
        totalWorks += total
      } else {
        totalMaterials += total
      }
    }
    
    return {
      name: objectName || file.name.replace(/\.(xlsx?|xls)$/i, ''),
      workCoef,
      materialCoef,
      items,
      totalWorks,
      totalMaterials
    }
  }

  // Загрузка дефектовки
  const handleDefektovkaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    
    try {
      const data = await parseDefektovka(file)
      setDefektovkaData(data)
      setEstimateName(data.name)
      toast.success(`Загружено ${data.items.length} позиций`)
    } catch (error) {
      console.error('Error parsing defektovka:', error)
      toast.error('Ошибка при чтении файла. Проверьте формат.')
    } finally {
      setImporting(false)
      if (defektovkaInputRef.current) {
        defektovkaInputRef.current.value = ''
      }
    }
  }

  // Создание сметы из дефектовки
  const createEstimateFromDefektovka = async () => {
    if (!defektovkaData || !estimateName) {
      toast.error('Введите название сметы')
      return
    }

    setImporting(true)
    
    try {
      // Создаём смету
      const estimateData = {
        name: estimateName,
        number: `ИМП-${Date.now().toString().slice(-6)}`,
        status: 'draft',
      }
      
      console.log('Creating estimate with data:', estimateData)
      const result = await estimatesApi.create(estimateData)
      console.log('Estimate create result:', result)
      
      const estimateId = result.data?.id
      
      if (!estimateId) {
        console.error('No estimate ID in result:', result)
        throw new Error('Не удалось создать смету')
      }

      console.log('Created estimate with ID:', estimateId)
      
      // Создаём разделы
      const sectionMap = new Map<string, number>()
      const uniqueSections = [...new Set(defektovkaData.items.map(i => i.section).filter(Boolean))]
      
      for (const sectionName of uniqueSections) {
        if (sectionName && window.electronAPI?.estimateSections) {
          try {
            const sectionResult = await window.electronAPI.estimateSections.create({ 
              estimate_id: estimateId, 
              name: sectionName 
            })
            if (sectionResult?.id) {
              sectionMap.set(sectionName, sectionResult.id)
            }
          } catch (e) {
            console.error('Error creating section:', e)
          }
        }
      }
      
      // Добавляем позиции
      for (const item of defektovkaData.items) {
        const sectionId = item.section ? sectionMap.get(item.section) : null
        
        const itemData = {
          name: item.name,
          unit: item.unit,
          quantity: item.quantity,
          materials_cost: item.type === 'material' ? item.price : 0,
          labor_cost: item.type === 'work' ? item.price : 0,
          code: item.num,
          section_id: sectionId
        }
        
        try {
          await api.estimateItems.add(estimateId, itemData)
        } catch (e) {
          console.error('Error adding item:', e)
        }
      }
      
      toast.success(`Смета создана с ${defektovkaData.items.length} позициями!`)
      setDefektovkaData(null)
      setEstimateName('')
      
      // Переходим к созданной смете
      navigate(`/estimates/${estimateId}`)
      
    } catch (error) {
      console.error('Error creating estimate:', error)
      toast.error('Ошибка при создании сметы')
    } finally {
      setImporting(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'works' | 'materials') => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    
    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data)
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(worksheet)

      if (type === 'works') {
        const works: ImportedWork[] = jsonData.map((row: any, index: number) => ({
          id: index + 1,
          code: row['Код'] || row['код'] || row['Code'] || `РБ-${String(index + 1).padStart(3, '0')}`,
          name: row['Наименование'] || row['наименование'] || row['Name'] || row['Название'] || '',
          unit: row['Ед.изм'] || row['Единица'] || row['Unit'] || 'шт',
          price: parseFloat(row['Цена'] || row['цена'] || row['Price'] || row['Стоимость'] || 0),
          category: row['Категория'] || row['категория'] || row['Category'] || 'other',
        })).filter(w => w.name)

        setImportedWorks(works)
        toast.success(`Импортировано ${works.length} работ`)
      } else {
        const materials: ImportedMaterial[] = jsonData.map((row: any, index: number) => ({
          id: index + 1,
          code: row['Код'] || row['код'] || row['Code'] || `МАТ-${String(index + 1).padStart(3, '0')}`,
          name: row['Наименование'] || row['наименование'] || row['Name'] || row['Название'] || '',
          unit: row['Ед.изм'] || row['Единица'] || row['Unit'] || 'шт',
          price: parseFloat(row['Цена'] || row['цена'] || row['Price'] || row['Стоимость'] || 0),
          supplier: row['Поставщик'] || row['поставщик'] || row['Supplier'] || '',
        })).filter(m => m.name)

        setImportedMaterials(materials)
        toast.success(`Импортировано ${materials.length} материалов`)
      }
    } catch (error) {
      console.error('Error importing file:', error)
      toast.error('Ошибка при импорте файла')
    } finally {
      setImporting(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const downloadTemplate = (type: 'works' | 'materials') => {
    let data: any[]
    let filename: string

    if (type === 'works') {
      data = [
        { 'Код': 'ШТ-001', 'Наименование': 'Штукатурка стен по маякам', 'Ед.изм': 'м²', 'Цена': 450, 'Категория': 'plaster' },
        { 'Код': 'МАЛ-001', 'Наименование': 'Покраска стен', 'Ед.изм': 'м²', 'Цена': 200, 'Категория': 'paint' },
        { 'Код': 'ПЛ-001', 'Наименование': 'Укладка плитки', 'Ед.изм': 'м²', 'Цена': 1500, 'Категория': 'tile' },
      ]
      filename = 'шаблон_работы.xlsx'
    } else {
      data = [
        { 'Код': 'ЦЕМ-001', 'Наименование': 'Цемент М500', 'Ед.изм': 'мешок 50кг', 'Цена': 450, 'Поставщик': 'ЦементОпт' },
        { 'Код': 'ПЕС-001', 'Наименование': 'Песок строительный', 'Ед.изм': 'м³', 'Цена': 1200, 'Поставщик': 'СтройПесок' },
        { 'Код': 'КИР-001', 'Наименование': 'Кирпич красный М150', 'Ед.изм': 'шт', 'Цена': 18, 'Поставщик': 'КирпичЗавод' },
      ]
      filename = 'шаблон_материалы.xlsx'
    }

    const worksheet = XLSX.utils.json_to_sheet(data)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Данные')
    XLSX.writeFile(workbook, filename)
    toast.success('Шаблон скачан')
  }

  const saveToDatabase = async (type: 'works' | 'materials') => {
    const items = type === 'works' ? importedWorks : importedMaterials
    
    // Сохраняем в localStorage для демо
    const key = type === 'works' ? 'zaru_works' : 'zaru_materials'
    const existing = JSON.parse(localStorage.getItem(key) || '[]')
    const merged = [...existing, ...items]
    localStorage.setItem(key, JSON.stringify(merged))
    
    toast.success(`${items.length} записей сохранено в базу данных`)
    
    if (type === 'works') {
      setImportedWorks([])
    } else {
      setImportedMaterials([])
    }
  }

  const tabs = [
    { id: 'defektovka', label: 'Дефектовки', icon: ClipboardList },
    { id: 'works', label: 'Работы', icon: Hammer },
    { id: 'materials', label: 'Материалы', icon: Package },
    { id: 'templates', label: 'Шаблоны документов', icon: FileText },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Заголовок */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Upload className="w-7 h-7 text-green-600" />
          Импорт данных
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Загрузка дефектовок и справочников из Excel файлов
        </p>
      </div>

      {/* Вкладки */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <tab.icon className="w-5 h-5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Вкладка Дефектовки */}
      {activeTab === 'defektovka' && (
        <div className="space-y-6">
          {/* Зона загрузки */}
          <div className="card p-8">
            <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center">
              <input
                ref={defektovkaInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleDefektovkaUpload}
                className="hidden"
                id="defektovka-upload"
              />
              <ClipboardList className="w-12 h-12 mx-auto text-slate-400 mb-4" />
              <label
                htmlFor="defektovka-upload"
                className="cursor-pointer"
              >
                <span className="text-lg font-medium text-slate-900 dark:text-white">
                  {importing ? 'Загрузка...' : 'Загрузить дефектовку из Excel'}
                </span>
                <p className="text-sm text-slate-500 mt-2">
                  Дефектовка/смета из Excel (.xlsx, .xls)
                </p>
              </label>
              <div className="flex justify-center gap-4 mt-6">
                <label
                  htmlFor="defektovka-upload"
                  className="btn-primary cursor-pointer flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Выбрать файл
                </label>
              </div>
            </div>
          </div>

          {/* Информация о формате */}
          <div className="card p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-1">
                  Поддерживаемые форматы:
                </h3>
                <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                  <li>• Дефектовка/смета из любой программы</li>
                  <li>• Excel с колонками: №, Наименование, Ед.изм, Кол-во, Цена, Стоимость</li>
                  <li>• Коэффициенты работ/материалов будут прочитаны из шапки</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Предпросмотр загруженной дефектовки */}
          {defektovkaData && (
            <div className="card">
              <div className="card-header flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h3 className="font-semibold flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    Дефектовка загружена ({defektovkaData.items.length} позиций)
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Коэф. работ: {defektovkaData.workCoef} | Коэф. материалов: {defektovkaData.materialCoef}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDefektovkaData(null)}
                    className="btn-secondary flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Очистить
                  </button>
                </div>
              </div>
              
              {/* Форма создания сметы */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                <div className="flex flex-wrap gap-4 items-end">
                  <div className="flex-1 min-w-[250px]">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Название новой сметы
                    </label>
                    <input
                      type="text"
                      value={estimateName}
                      onChange={(e) => setEstimateName(e.target.value)}
                      placeholder="Введите название..."
                      className="input w-full"
                    />
                  </div>
                  <button
                    onClick={createEstimateFromDefektovka}
                    disabled={importing || !estimateName}
                    className="btn-primary flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    {importing ? 'Создание...' : 'Создать смету'}
                  </button>
                </div>
              </div>
              
              {/* Итоги */}
              <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 dark:bg-slate-800/50">
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {defektovkaData.items.filter(i => i.type === 'work').length}
                  </p>
                  <p className="text-sm text-slate-500">Работ</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {defektovkaData.items.filter(i => i.type === 'material').length}
                  </p>
                  <p className="text-sm text-slate-500">Материалов</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">
                    {defektovkaData.totalWorks.toLocaleString('ru-RU')} ₽
                  </p>
                  <p className="text-sm text-slate-500">Стоимость работ</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-600">
                    {defektovkaData.totalMaterials.toLocaleString('ru-RU')} ₽
                  </p>
                  <p className="text-sm text-slate-500">Стоимость материалов</p>
                </div>
              </div>
              
              {/* Таблица позиций */}
              <div className="overflow-x-auto max-h-96">
                <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">№</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Наименование</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">Ед.изм</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Кол-во</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Цена</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Сумма</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">Тип</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {defektovkaData.items.slice(0, 100).map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3 text-sm font-mono text-slate-500">{item.num}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900 dark:text-white">{item.name}</p>
                          {item.section && (
                            <p className="text-xs text-slate-500">{item.section}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-slate-500">{item.unit}</td>
                        <td className="px-4 py-3 text-right text-sm text-slate-900 dark:text-white">{item.quantity}</td>
                        <td className="px-4 py-3 text-right text-sm text-slate-900 dark:text-white">
                          {item.price.toLocaleString('ru-RU')} ₽
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">
                          {item.total.toLocaleString('ru-RU')} ₽
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            item.type === 'work' 
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                          }`}>
                            {item.type === 'work' ? 'Работа' : 'Материал'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {defektovkaData.items.length > 100 && (
                  <p className="text-center text-sm text-slate-500 py-4">
                    Показано 100 из {defektovkaData.items.length} позиций
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Контент вкладок работ/материалов */}
      {(activeTab === 'works' || activeTab === 'materials') && (
        <div className="space-y-6">
          {/* Зона загрузки */}
          <div className="card p-8">
            <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => handleFileUpload(e, activeTab)}
                className="hidden"
                id="file-upload"
              />
              <FileSpreadsheet className="w-12 h-12 mx-auto text-slate-400 mb-4" />
              <label
                htmlFor="file-upload"
                className="cursor-pointer"
              >
                <span className="text-lg font-medium text-slate-900 dark:text-white">
                  {importing ? 'Загрузка...' : 'Перетащите файл сюда или нажмите для выбора'}
                </span>
                <p className="text-sm text-slate-500 mt-2">
                  Поддерживаются форматы: .xlsx, .xls, .csv
                </p>
              </label>
              <div className="flex justify-center gap-4 mt-6">
                <label
                  htmlFor="file-upload"
                  className="btn-primary cursor-pointer flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Выбрать файл
                </label>
                <button
                  onClick={() => downloadTemplate(activeTab)}
                  className="btn-secondary flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Скачать шаблон
                </button>
              </div>
            </div>
          </div>

          {/* Информация о формате */}
          <div className="card p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
              Формат Excel файла:
            </h3>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              {activeTab === 'works' 
                ? 'Колонки: Код, Наименование, Ед.изм, Цена, Категория (опционально)'
                : 'Колонки: Код, Наименование, Ед.изм, Цена, Поставщик (опционально)'
              }
            </p>
          </div>

          {/* Предпросмотр импортированных данных */}
          {((activeTab === 'works' && importedWorks.length > 0) || 
            (activeTab === 'materials' && importedMaterials.length > 0)) && (
            <div className="card">
              <div className="card-header flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  Предпросмотр ({activeTab === 'works' ? importedWorks.length : importedMaterials.length} записей)
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => activeTab === 'works' ? setImportedWorks([]) : setImportedMaterials([])}
                    className="btn-secondary flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Очистить
                  </button>
                  <button
                    onClick={() => saveToDatabase(activeTab)}
                    className="btn-primary flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Сохранить в базу
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Код</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Наименование</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">Ед.изм</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Цена</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                        {activeTab === 'works' ? 'Категория' : 'Поставщик'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {(activeTab === 'works' ? importedWorks : importedMaterials).slice(0, 50).map((item: any) => (
                      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3 text-sm font-mono text-slate-500">{item.code}</td>
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{item.name}</td>
                        <td className="px-4 py-3 text-center text-sm text-slate-500">{item.unit}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">
                          {item.price.toLocaleString('ru-RU')} ₽
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500">
                          {activeTab === 'works' ? item.category : item.supplier}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Вкладка шаблонов документов */}
      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { name: 'Коммерческое предложение', desc: 'Шаблон КП с шапкой компании', icon: FileText },
            { name: 'Договор подряда', desc: 'Типовой договор на работы', icon: FileText },
            { name: 'Акт КС-2', desc: 'Акт выполненных работ', icon: FileText },
            { name: 'Справка КС-3', desc: 'Справка о стоимости работ', icon: FileText },
            { name: 'Акт приёмки', desc: 'Акт приёмки-передачи', icon: FileText },
            { name: 'Счёт на оплату', desc: 'Счёт для оплаты работ', icon: FileText },
          ].map((template) => (
            <div key={template.name} className="card p-4 hover:border-primary-300 dark:hover:border-primary-700 transition-colors cursor-pointer">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                  <template.icon className="w-5 h-5 text-primary-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-slate-900 dark:text-white">{template.name}</h3>
                  <p className="text-sm text-slate-500">{template.desc}</p>
                </div>
                <button className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                  <Eye className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
