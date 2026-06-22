import { useState, useRef, useCallback } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Upload, Camera, Copy, FileText, Check, Loader2, Image as ImageIcon,
  History, Trash2, Pen, X, Clock, ChevronRight, FilePlus, List,
  AlertCircle, Maximize2
} from 'lucide-react'
import { apiUpload } from '@/lib/api-client'
import { estimatesApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Button from '@/components/ui/Button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'

// --------------- Types ---------------

interface OCRResult {
  id: string
  recognized_text: string
  corrected_text: string
  confidence: number
  photo_url: string
  created_at: string
}

interface ScanHistoryItem {
  id: string
  recognized_text: string
  confidence: number
  photo_url: string
  created_at: string
  thumbnail?: string
}

interface EstimateOption {
  id: number
  name: string
  number: string
}

const HISTORY_KEY = 'zaru_handwriting_ocr_history'
const MAX_HISTORY = 20

// --------------- Helpers ---------------

function loadHistory(): ScanHistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
  } catch {
    return []
  }
}

function saveHistory(items: ScanHistoryItem[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)))
}

function addToHistory(result: OCRResult, thumbnail?: string) {
  const history = loadHistory()
  history.unshift({
    id: result.id,
    recognized_text: result.corrected_text || result.recognized_text,
    confidence: result.confidence,
    photo_url: result.photo_url,
    created_at: result.created_at,
    thumbnail,
  })
  saveHistory(history)
}

// --------------- Component ---------------

export default function HandwritingOCR() {
  const navigate = useNavigate()

  // Upload & Result state
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<OCRResult | null>(null)
  const [editableText, setEditableText] = useState('')
  const [copied, setCopied] = useState(false)
  const [showResultImage, setShowResultImage] = useState(false)

  // History state
  const [history, setHistory] = useState<ScanHistoryItem[]>(loadHistory)

  // Dialog state
  const [showSendDialog, setShowSendDialog] = useState(false)
  const [sendLoading, setSendLoading] = useState(false)

  // Drag state
  const [isDragOver, setIsDragOver] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // --------------- API calls ---------------

  const recognizeMutation = useMutation({
    mutationFn: async (file: File): Promise<OCRResult> => {
      const formData = new FormData()
      formData.append('image', file)
      return apiUpload<OCRResult>('/ocr/recognize', formData)
    },
    onSuccess: (data, file) => {
      setResult(data)
      const text = data.corrected_text || data.recognized_text
      setEditableText(text)

      // Generate thumbnail for history
      const reader = new FileReader()
      reader.onloadend = () => {
        addToHistory(data, reader.result as string)
        setHistory(loadHistory())
      }
      reader.readAsDataURL(file)

      toast.success('Текст успешно распознан')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка распознавания. Попробуйте другое изображение.')
    },
  })

  // Estimate list for the send dialog
  const { data: estimatesData } = useQuery({
    queryKey: ['estimates', 'list'],
    queryFn: () => estimatesApi.list({ page: 1 }),
    enabled: showSendDialog,
  })

  const estimateOptions: EstimateOption[] = estimatesData?.data?.items || []

  // --------------- Handlers ---------------

  const handleFile = useCallback((file: File) => {
    // Validation
    const MAX_SIZE = 15 * 1024 * 1024 // 15 MB
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp']

    if (!allowedTypes.includes(file.type) && !file.type.startsWith('image/')) {
      toast.error('Пожалуйста, выберите изображение (JPG, PNG, WEBP)')
      return
    }
    if (file.size > MAX_SIZE) {
      toast.error('Файл слишком большой. Максимум 15 МБ.')
      return
    }

    setSelectedImage(file)
    setPreview(URL.createObjectURL(file))
    setResult(null)
    setEditableText('')
    setShowResultImage(false)

    recognizeMutation.mutate(file)
  }, [recognizeMutation])

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // Reset input so selecting the same file re-fires the change
    e.target.value = ''
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const handleCopy = () => {
    if (!editableText) return
    navigator.clipboard.writeText(editableText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Текст скопирован в буфер обмена')
  }

  const handleReset = () => {
    setSelectedImage(null)
    setPreview(null)
    setResult(null)
    setEditableText('')
    setShowResultImage(false)
  }

  const handleHistorySelect = (item: ScanHistoryItem) => {
    setResult({
      id: item.id,
      recognized_text: item.recognized_text,
      corrected_text: item.recognized_text,
      confidence: item.confidence,
      photo_url: item.photo_url,
      created_at: item.created_at,
    })
    setEditableText(item.recognized_text)
    setPreview(item.thumbnail || null)
    setSelectedImage(null)

    toast.success('Восстановлено из истории')
  }

  const handleHistoryDelete = (id: string) => {
    const updated = history.filter(h => h.id !== id)
    setHistory(updated)
    saveHistory(updated)
    toast.success('Удалено из истории')
  }

  const handleClearHistory = () => {
    setHistory([])
    saveHistory([])
    toast.success('История очищена')
  }

  const handleSendToEstimate = () => {
    if (!editableText.trim()) {
      toast.error('Нет текста для отправки')
      return
    }
    setShowSendDialog(true)
  }

  const handleCreateNewEstimate = async () => {
    if (!editableText.trim()) return
    setSendLoading(true)
    try {
      const res = await estimatesApi.create({
        name: `Смета по распознанному тексту от ${new Date().toLocaleDateString('ru-RU')}`,
        estimate_type: 'local',
      })
      const estimateId = res.data.id
      await estimatesApi.addItem(estimateId, {
        name: editableText.trim(),
        unit: 'шт',
        quantity: 1,
        labor_cost: 0,
        materials_cost: 0,
        description: 'Распознано с рукописного текста',
      })
      toast.success('Новая смета создана! Переход...')
      setShowSendDialog(false)
      setSendLoading(false)
      navigate(`/estimates/${estimateId}`)
    } catch {
      setSendLoading(false)
      toast.error('Не удалось создать смету')
    }
  }

  const handleAddToExistingEstimate = async (estimateId: number) => {
    if (!editableText.trim()) return
    setSendLoading(true)
    try {
      await estimatesApi.addItem(estimateId, {
        name: editableText.trim(),
        unit: 'шт',
        quantity: 1,
        labor_cost: 0,
        materials_cost: 0,
        description: 'Распознано с рукописного текста',
      })
      toast.success('Позиция добавлена в смету!')
      setShowSendDialog(false)
      setSendLoading(false)
    } catch {
      setSendLoading(false)
      toast.error('Не удалось добавить позицию')
    }
  }

  // --------------- Derived state ---------------

  const isLoading = recognizeMutation.isPending
  const confidenceColor = result
    ? result.confidence > 0.8
      ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800'
      : result.confidence > 0.6
        ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800'
        : 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 border-rose-200 dark:border-rose-800'
    : ''

  // --------------- Render ---------------

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/30 dark:from-slate-900 dark:to-slate-800 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30">
              <Pen className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-white">
                Распознавание рукописного текста
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Сфотографируйте записи от руки — AI превратит их в цифровой текст
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* ---- MAIN COLUMN ---- */}
          <div className="lg:col-span-3 space-y-6">
            {/* Upload zone */}
            <Card>
              <CardContent className="p-0">
                {!preview || (!result && !isLoading) ? (
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      'relative flex flex-col items-center justify-center p-10 md:p-16 cursor-pointer rounded-xl transition-all border-2 border-dashed',
                      isDragOver
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 scale-[1.01]'
                        : 'border-slate-300 dark:border-slate-600 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-slate-50/50 dark:hover:bg-slate-800/50'
                    )}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleImageSelect}
                      className="hidden"
                    />

                    {isDragOver ? (
                      <>
                        <div className="w-20 h-20 rounded-2xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center mb-5">
                          <Upload className="w-10 h-10 text-indigo-500" />
                        </div>
                        <p className="text-xl font-semibold text-indigo-600 dark:text-indigo-400 mb-1">
                          Отпустите файл здесь
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 dark:from-indigo-900/40 dark:to-violet-900/40 flex items-center justify-center mb-5">
                          <Camera className="w-10 h-10 text-indigo-500" />
                        </div>
                        <p className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Загрузите изображение
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                          Перетащите файл или нажмите для выбора
                        </p>
                        <div className="flex flex-wrap gap-2 text-xs text-slate-400 dark:text-slate-500">
                          <span className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg">JPG, PNG, WEBP</span>
                          <span className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg">до 15 MB</span>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  /* ---- Preview state ---- */
                  <div className="p-6">
                    <div className="flex flex-col md:flex-row gap-6">
                      {/* Left: Thumbnail */}
                      <div className="w-full md:w-56 shrink-0">
                        <div className="relative rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                          <img
                            src={preview!}
                            alt="Uploaded"
                            className="w-full h-40 object-cover cursor-pointer"
                            onClick={() => setShowResultImage(true)}
                          />
                          {isLoading && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
                              <div className="text-center text-white">
                                <Loader2 className="w-10 h-10 animate-spin mx-auto mb-2" />
                                <p className="text-sm font-medium">Распознавание...</p>
                              </div>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={handleReset}
                          className="w-full mt-2 flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-rose-500 dark:text-slate-400 dark:hover:text-rose-400 py-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Удалить и загрузить новое
                        </button>
                      </div>

                      {/* Right: Result */}
                      <div className="flex-1 min-w-0">
                        {/* Confidence badge */}
                        {result && !isLoading && (
                          <div className="flex flex-wrap items-center gap-3 mb-3">
                            <span className={cn('inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border', confidenceColor)}>
                              <AlertCircle className="w-3.5 h-3.5" />
                              {Math.round(result.confidence * 100)}% уверенность
                            </span>
                            <span className="text-xs text-slate-400">
                              <Clock className="w-3.5 h-3.5 inline mr-1" />
                              {new Date(result.created_at).toLocaleString('ru-RU')}
                            </span>
                          </div>
                        )}

                        {/* Loading skeleton */}
                        {isLoading ? (
                          <div className="space-y-3 animate-pulse">
                            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
                            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
                            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-5/6" />
                            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
                          </div>
                        ) : result ? (
                          <>
                            {/* Editable text */}
                            <textarea
                              value={editableText}
                              onChange={(e) => setEditableText(e.target.value)}
                              className="w-full h-40 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-4 text-sm text-slate-800 dark:text-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 transition-all font-mono leading-relaxed"
                              placeholder="Отредактируйте при необходимости..."
                            />

                            {/* Action buttons */}
                            <div className="flex flex-wrap gap-2 mt-4">
                              <Button onClick={handleCopy} variant="secondary">
                                {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                                {copied ? 'Скопировано' : 'Копировать текст'}
                              </Button>
                              <Button onClick={handleSendToEstimate}>
                                <FileText className="w-4 h-4 mr-2" />
                                Отправить в смету
                              </Button>
                              <Button onClick={() => setShowResultImage(true)} variant="outline">
                                <Maximize2 className="w-4 h-4 mr-2" />
                                Просмотр фото
                              </Button>
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Results history visualization (empty state) */}
            {!result && !isLoading && !preview && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-slate-800/60 rounded-xl p-5 border border-slate-200 dark:border-slate-700 text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                    <Camera className="w-6 h-6 text-indigo-500" />
                  </div>
                  <h4 className="font-medium text-slate-700 dark:text-slate-300 text-sm mb-1">Фото</h4>
                  <p className="text-xs text-slate-400">Загрузите фотографию рукописного текста</p>
                </div>
                <div className="bg-white dark:bg-slate-800/60 rounded-xl p-5 border border-slate-200 dark:border-slate-700 text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
                    <Pen className="w-6 h-6 text-violet-500" />
                  </div>
                  <h4 className="font-medium text-slate-700 dark:text-slate-300 text-sm mb-1">Распознавание</h4>
                  <p className="text-xs text-slate-400">AI превратит рукописный текст в цифровой</p>
                </div>
                <div className="bg-white dark:bg-slate-800/60 rounded-xl p-5 border border-slate-200 dark:border-slate-700 text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-emerald-500" />
                  </div>
                  <h4 className="font-medium text-slate-700 dark:text-slate-300 text-sm mb-1">Смета</h4>
                  <p className="text-xs text-slate-400">Отправьте текст в смету одним нажатием</p>
                </div>
              </div>
            )}
          </div>

          {/* ---- RIGHT SIDEBAR: History ---- */}
          <div className="lg:col-span-1">
            <Card className="lg:sticky lg:top-6">
              <CardHeader>
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-indigo-500" />
                    <CardTitle className="text-sm">История сканирований</CardTitle>
                  </div>
                  {history.length > 0 && (
                    <button
                      onClick={handleClearHistory}
                      className="text-xs text-slate-400 hover:text-rose-500 transition-colors"
                      title="Очистить историю"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <div className="text-center py-8 px-2">
                    <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                      <Clock className="w-6 h-6 text-slate-400" />
                    </div>
                    <p className="text-xs text-slate-400">
                      История сканирований пуста
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1 -mr-1">
                    {history.map((item) => (
                      <div
                        key={item.id}
                        className="group relative flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 cursor-pointer transition-all hover:shadow-sm"
                        onClick={() => handleHistorySelect(item)}
                      >
                        {/* Thumbnail */}
                        <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-slate-200 dark:bg-slate-600">
                          {item.thumbnail ? (
                            <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ImageIcon className="w-5 h-5 text-slate-400" />
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                            {item.recognized_text}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-slate-400">
                              {new Date(item.created_at).toLocaleString('ru-RU', {
                                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                              })}
                            </span>
                            <span className={cn(
                              'text-[10px] font-medium px-1.5 py-0.5 rounded',
                              item.confidence > 0.8
                                ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30'
                                : item.confidence > 0.6
                                  ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30'
                                  : 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30'
                            )}>
                              {Math.round(item.confidence * 100)}%
                            </span>
                          </div>
                        </div>

                        {/* Actions on hover */}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleHistoryDelete(item.id) }}
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded-md bg-white dark:bg-slate-600 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-all shadow-sm border border-slate-200 dark:border-slate-600"
                        >
                          <X className="w-3 h-3" />
                        </button>

                        <ChevronRight className="absolute bottom-2 right-2 w-3 h-3 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* ---- Full image preview overlay ---- */}
      {showResultImage && preview && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setShowResultImage(false)}
        >
          <div className="relative max-w-3xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img src={preview} alt="Full preview" className="max-w-full max-h-[85vh] rounded-xl shadow-2xl" />
            <button
              onClick={() => setShowResultImage(false)}
              className="absolute -top-3 -right-3 w-9 h-9 bg-white dark:bg-slate-800 rounded-full shadow-lg flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <X className="w-4 h-4 text-slate-600 dark:text-slate-300" />
            </button>
            <p className="text-center text-white/60 text-xs mt-2">Нажмите в любом месте, чтобы закрыть</p>
          </div>
        </div>
      )}

      {/* ---- Send to Estimate Dialog ---- */}
      <Dialog open={showSendDialog} onClose={() => !sendLoading && setShowSendDialog(false)} title="Отправить в смету">
        <DialogContent>
          <div className="space-y-4">
            {/* Preview text */}
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                Распознанный текст
              </label>
              <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-300 max-h-32 overflow-y-auto whitespace-pre-wrap">
                {editableText}
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                Выберите действие:
              </p>

              <div className="space-y-2">
                {/* Create new estimate */}
                <button
                  onClick={handleCreateNewEstimate}
                  disabled={sendLoading}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-800 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <FilePlus className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Создать новую смету</p>
                    <p className="text-xs text-slate-500">Будет создана смета с этой позицией</p>
                  </div>
                </button>

                {/* Existing estimates */}
                <div className="relative">
                  <p className="text-xs text-slate-400 mb-2 flex items-center gap-1.5">
                    <List className="w-3.5 h-3.5" />
                    Или добавьте в существующую:
                  </p>
                  {estimateOptions.length === 0 ? (
                    <div className="text-xs text-slate-400 text-center py-3 bg-slate-50 dark:bg-slate-700/30 rounded-lg">
                      {sendLoading ? 'Загрузка...' : 'Нет доступных смет'}
                    </div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                      {estimateOptions.map((est) => (
                        <button
                          key={est.id}
                          onClick={() => handleAddToExistingEstimate(est.id)}
                          disabled={sendLoading}
                          className="w-full flex items-center gap-2 p-2.5 rounded-lg text-left hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-600"
                        >
                          <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm text-slate-700 dark:text-slate-300 truncate">{est.name}</p>
                            <p className="text-xs text-slate-400">{est.number}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowSendDialog(false)} disabled={sendLoading}>
            Отмена
          </Button>
          <Button onClick={handleCreateNewEstimate} loading={sendLoading}>
            <FilePlus className="w-4 h-4 mr-2" />
            Новая смета
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}
