import { useState, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  History,
  X,
  Loader2,
  Search,
  ChevronDown,
  BarChart3,
  Lightbulb,
  FileText,
  Trash2,
  Download,
  Clock,
} from 'lucide-react'
import { apiUpload, apiGet, apiDelete } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'

// ======================== TYPES ========================

interface AnalysisItem {
  name: string
  expected_price: number
  actual_price: number
  delta_percent: number
  verdict: 'ok' | 'warning' | 'overpriced'
  reason: string
}

interface AnalysisResult {
  id: string
  file_name: string
  total_overcharge: number
  flagged_count: number
  total_items: number
  items: AnalysisItem[]
  summary: string
  created_at: string
}

const DELTA_THRESHOLD_WARNING = 10
const DELTA_THRESHOLD_OVERPRICED = 15

// ======================== HELPERS ========================

function getVerdiceConfig(verdict: AnalysisItem['verdict'], deltaPercent: number) {
  switch (verdict) {
    case 'ok':
      return {
        label: 'OK',
        icon: CheckCircle,
        textColor: 'text-emerald-600 dark:text-emerald-400',
        bgColor: 'bg-emerald-50 dark:bg-emerald-950/40',
        rowClass: '',
        badgeClass: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400',
      }
    case 'warning':
      return {
        label: 'Внимание',
        icon: AlertTriangle,
        textColor: 'text-amber-600 dark:text-amber-400',
        bgColor: 'bg-amber-50 dark:bg-amber-950/40',
        rowClass: 'bg-amber-50/40 dark:bg-amber-950/20',
        badgeClass: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400',
      }
    case 'overpriced':
      return {
        label: 'Завышение',
        icon: TrendingUp,
        textColor: 'text-rose-600 dark:text-rose-400',
        bgColor: 'bg-rose-50 dark:bg-rose-950/40',
        rowClass: 'bg-rose-50/40 dark:bg-rose-950/20',
        badgeClass: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400',
      }
  }
}

// ======================== COMPONENT ========================

export default function CompetitorAnalysis() {
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ['competitor-history'],
    queryFn: () => apiGet<AnalysisResult[]>('/competitor/history'),
    enabled: showHistory,
  })

  const analyzeMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      return apiUpload<AnalysisResult>('/competitor/analyze', formData)
    },
    onSuccess: (data) => {
      setResult(data)
      setSelectedFile(null)
      queryClient.invalidateQueries({ queryKey: ['competitor-history'] })
      toast.success('Анализ завершён')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Ошибка при анализе файла')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/competitor/history/${id}`),
    onSuccess: () => {
      toast.success('Анализ удалён')
      queryClient.invalidateQueries({ queryKey: ['competitor-history'] })
    },
    onError: () => toast.error('Ошибка при удалении'),
  })

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.pdf') || file.name.endsWith('.xls'))) {
      setSelectedFile(file)
    } else {
      toast.error('Поддерживаются только XLSX и PDF файлы')
    }
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
    }
  }

  const handleAnalyze = () => {
    if (!selectedFile) return
    analyzeMutation.mutate(selectedFile)
  }

  const handleReset = () => {
    setResult(null)
    setSelectedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleShowResult = (h: AnalysisResult) => {
    setResult(h)
    setShowHistory(false)
  }

  const filteredHistory = history?.filter((h) =>
    h.file_name.toLowerCase().includes(historySearch.toLowerCase())
  )

  // ======================== RENDER ========================

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Анализ смет конкурентов
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Загрузите смету подрядчика для проверки на завышение цен
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowHistory(!showHistory)}
          >
            <History className="w-4 h-4 mr-2" />
            История
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Upload / Results section */}
          <Card>
            <CardContent className="p-6">
              {!result ? (
                <div>
                  {/* Dropzone */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer ${
                      dragOver
                        ? 'border-violet-500 bg-violet-50 dark:bg-violet-950'
                        : selectedFile
                        ? 'border-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/20'
                        : 'border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500'
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.pdf"
                      onChange={handleFileSelect}
                      className="hidden"
                    />

                    {selectedFile ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                          <FileSpreadsheet className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                            {selectedFile.name}
                          </p>
                          <p className="text-sm text-slate-500">
                            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <Upload className="w-14 h-14 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
                        <p className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Перетащите смету сюда
                        </p>
                        <p className="text-sm text-slate-500 mb-5">или нажмите для выбора файла</p>
                        <Button variant="outline" className="cursor-pointer pointer-events-none">
                          <FileSpreadsheet className="w-4 h-4 mr-2" />
                          Выбрать файл
                        </Button>
                        <p className="text-xs text-slate-400 mt-4">XLSX, PDF до 20 MB</p>
                      </div>
                    )}
                  </div>

                  {/* Action bar when file is selected */}
                  <AnimatePresence>
                    {selectedFile && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex items-center justify-between mt-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-slate-400" />
                          <div>
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                              {selectedFile.name}
                            </p>
                            <p className="text-xs text-slate-400">
                              {formatFileSize(selectedFile.size)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedFile(null)
                              if (fileInputRef.current) fileInputRef.current.value = ''
                            }}
                            className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                          >
                            <X className="w-4 h-4 text-slate-400" />
                          </button>
                          <Button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleAnalyze()
                            }}
                            loading={analyzeMutation.isPending}
                            disabled={analyzeMutation.isPending}
                          >
                            {analyzeMutation.isPending ? (
                              <>Анализ...</>
                            ) : (
                              <>
                                <BarChart3 className="w-4 h-4 mr-2" />
                                Анализировать
                              </>
                            )}
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Loading overlay */}
                  {analyzeMutation.isPending && (
                    <div className="mt-6 p-8 text-center">
                      <div className="animate-pulse space-y-4">
                        <div className="flex justify-center">
                          <Loader2 className="w-10 h-10 animate-spin text-violet-500" />
                        </div>
                        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                          Анализируем смету...
                        </p>
                        <p className="text-xs text-slate-400">
                          Сравниваем позиции с рыночными ценами
                        </p>
                        <div className="w-48 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto overflow-hidden">
                          <div className="w-2/3 h-full bg-violet-500 rounded-full animate-pulse" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Results */
                <div className="space-y-6">
                  {/* Summary cards */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-emerald-50 dark:bg-emerald-950 rounded-xl p-4 text-center border border-emerald-200 dark:border-emerald-900/50">
                      <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                        {result.total_items}
                      </p>
                      <p className="text-xs text-emerald-700 dark:text-emerald-500 mt-1">
                        Позиций проверено
                      </p>
                    </div>
                    <div className="bg-rose-50 dark:bg-rose-950 rounded-xl p-4 text-center border border-rose-200 dark:border-rose-900/50">
                      <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">
                        {result.flagged_count}
                      </p>
                      <p className="text-xs text-rose-700 dark:text-rose-500 mt-1">
                        С завышением
                      </p>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-950 rounded-xl p-4 text-center border border-amber-200 dark:border-amber-900/50">
                      <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                        {result.total_overcharge.toLocaleString('ru-RU')} ₽
                      </p>
                      <p className="text-xs text-amber-700 dark:text-amber-500 mt-1">
                        Общий перерасход
                      </p>
                    </div>
                  </div>

                  {/* AI Summary */}
                  {result.summary && (
                    <div className="flex items-start gap-3 p-4 bg-violet-50 dark:bg-violet-950/30 rounded-xl border border-violet-200 dark:border-violet-900/50">
                      <Lightbulb className="w-5 h-5 text-violet-500 mt-0.5 shrink-0" />
                      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                        {result.summary}
                      </p>
                    </div>
                  )}

                  {/* Results table */}
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            Позиция
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            Ожидаемая цена
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            Фактическая цена
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            Отклонение
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            Вердикт
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {result.items.map((item, i) => {
                          const vc = getVerdiceConfig(item.verdict, item.delta_percent)
                          return (
                            <motion.tr
                              key={i}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.025 }}
                              className={`${vc.rowClass} transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/60`}
                            >
                              <td className="px-4 py-3.5">
                                <p className="font-medium text-slate-800 dark:text-slate-200">
                                  {item.name}
                                </p>
                                {item.reason && (
                                  <p className="text-xs text-slate-400 mt-0.5">{item.reason}</p>
                                )}
                              </td>
                              <td className="px-4 py-3.5 text-right text-slate-600 dark:text-slate-400 font-medium">
                                {item.expected_price.toLocaleString('ru-RU')} ₽
                              </td>
                              <td className="px-4 py-3.5 text-right text-slate-600 dark:text-slate-400 font-medium">
                                {item.actual_price.toLocaleString('ru-RU')} ₽
                              </td>
                              <td className={`px-4 py-3.5 text-right font-semibold ${vc.textColor}`}>
                                <span className="flex items-center justify-end gap-1">
                                  {item.delta_percent > DELTA_THRESHOLD_OVERPRICED ? (
                                    <TrendingUp className="w-3.5 h-3.5" />
                                  ) : item.delta_percent > DELTA_THRESHOLD_WARNING ? (
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                  ) : (
                                    <TrendingDown className="w-3.5 h-3.5" />
                                  )}
                                  {item.delta_percent > 0 ? '+' : ''}
                                  {Math.round(item.delta_percent)}%
                                </span>
                              </td>
                              <td className="px-4 py-3.5 text-center">
                                <span
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${vc.badgeClass}`}
                                >
                                  <vc.icon className="w-3 h-3" />
                                  {vc.label}
                                </span>
                              </td>
                            </motion.tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Footer actions */}
                  <div className="flex items-center justify-between pt-2">
                    <Button variant="outline" onClick={handleReset}>
                      <X className="w-4 h-4 mr-2" />
                      Новый анализ
                    </Button>
                    <div className="text-xs text-slate-400 flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5" />
                      {result.file_name}
                      <span className="text-slate-300 dark:text-slate-600">|</span>
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(result.created_at).toLocaleString('ru-RU')}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* How it works (always visible when no result) */}
          {!result && !analyzeMutation.isPending && (
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-violet-500" />
                  Как это работает
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { step: '1', title: 'Загрузите смету', desc: 'XLSX или PDF до 20 MB' },
                    { step: '2', title: 'AI анализирует', desc: 'Каждую позицию построчно' },
                    { step: '3', title: 'Сравнение с рынком', desc: 'Региональные цены и база ФЕР' },
                    { step: '4', title: 'Результат', desc: 'Наглядный отчёт с подсветкой' },
                  ].map((item) => (
                    <div key={item.step} className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-violet-600 dark:text-violet-400">
                          {item.step}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {item.title}
                        </p>
                        <p className="text-xs text-slate-500">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* History panel */}
          <AnimatePresence>
            {showHistory && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between w-full">
                      <span className="flex items-center gap-2">
                        <History className="w-5 h-5 text-slate-500" />
                        История анализов
                      </span>
                      <button
                        onClick={() => setShowHistory(false)}
                        className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        <X className="w-4 h-4 text-slate-400" />
                      </button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* Search */}
                    <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Поиск..."
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                      />
                    </div>

                    {historyLoading ? (
                      <div className="text-center py-6">
                        <Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" />
                      </div>
                    ) : filteredHistory && filteredHistory.length > 0 ? (
                      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                        {filteredHistory.map((h) => (
                          <div
                            key={h.id}
                            className="group relative p-3 rounded-xl border border-slate-100 dark:border-slate-700/50 hover:border-slate-200 dark:hover:border-slate-600 transition-all cursor-pointer"
                            onClick={() => handleShowResult(h)}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                                  {h.file_name}
                                </p>
                                <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500">
                                  <span
                                    className={`inline-flex items-center gap-1 ${
                                      h.flagged_count > 0
                                        ? 'text-rose-600 dark:text-rose-400'
                                        : 'text-emerald-600 dark:text-emerald-400'
                                    }`}
                                  >
                                    <AlertTriangle className="w-3 h-3" />
                                    {h.flagged_count}
                                  </span>
                                  <span>|</span>
                                  <span>{h.total_overcharge.toLocaleString('ru-RU')} ₽</span>
                                </div>
                                <p className="text-xs text-slate-400 mt-1">
                                  {new Date(h.created_at).toLocaleDateString('ru-RU')}
                                </p>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (confirm('Удалить этот анализ?')) {
                                    deleteMutation.mutate(h.id)
                                  }
                                }}
                                className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-all"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-400 hover:text-rose-600" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <FileText className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                        <p className="text-sm text-slate-500">
                          {historySearch
                            ? 'Ничего не найдено'
                            : 'Пока нет анализов'}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {!historySearch && 'Загрузите первую смету'}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Info card (when history is not shown) */}
          {!showHistory && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-violet-500" />
                  Оценка рисков
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
                  <div className="flex items-center justify-between p-3 bg-rose-50 dark:bg-rose-950/30 rounded-lg">
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                      Завышение &gt;15%
                    </span>
                    <span className="text-rose-600 dark:text-rose-400 font-semibold">Красный</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      Превышение &gt;10%
                    </span>
                    <span className="text-amber-600 dark:text-amber-400 font-semibold">Жёлтый</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg">
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      В пределах нормы
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Зелёный</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}
