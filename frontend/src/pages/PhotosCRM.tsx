import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '@/hooks/useToast'
import { apiGet, apiUpload, apiDelete } from '@/lib/api-client'
import { 
  Camera, Upload, Calendar, User, Eye, Trash2, ArrowLeft, Loader2, X, AlertCircle, ZoomIn
} from 'lucide-react'
import { staggerContainer, fadeInUp, scaleIn } from '@/lib/motion'
import { format } from 'date-fns'

interface Photo {
  id: number
  project_id: number
  stage_id?: number
  url: string
  uploaded_by?: number
  uploader_name?: string
  stage_name?: string
  created_at: string
}

interface Stage {
  id: number
  name: string
}

export default function PhotosCRM() {
  const [searchParams] = useSearchParams()
  const projectId = searchParams.get('projectId')

  const [photos, setPhotos] = useState<Photo[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)
  const [projectName, setProjectName] = useState('')
  
  // Загрузка
  const [uploadStageId, setUploadStageId] = useState<number | undefined>(undefined)
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null)
  const [uploading, setUploading] = useState(false)

  // Лайтбокс
  const [activePhoto, setActivePhoto] = useState<Photo | null>(null)

  const toast = useToast()

  useEffect(() => {
    if (projectId) {
      fetchData()
    }
  }, [projectId])

  const fetchData = async () => {
    setLoading(true)
    try {
      const project = await apiGet<any>(`/crm-projects/${projectId}`)
      setProjectName(project.name)
      
      const stagesData = await apiGet<Stage[]>(`/crm-stages/project/${projectId}`)
      setStages(stagesData)

      const photosData = await apiGet<Photo[]>(`/crm-photos/project/${projectId}`)
      setPhotos(photosData)
    } catch (err: any) {
      toast.error('Ошибка загрузки фотоотчетов: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(e.target.files)
    }
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFiles || selectedFiles.length === 0) {
      toast.error('Выберите хотя бы один файл изображения')
      return
    }

    setUploading(true)
    const formData = new FormData()
    if (uploadStageId) {
      formData.append('stage_id', uploadStageId.toString())
    }
    
    // Пакетное добавление файлов
    for (let i = 0; i < selectedFiles.length; i++) {
      formData.append('files', selectedFiles[i])
    }

    try {
      await apiUpload(`/crm-photos/project/${projectId}/upload`, formData)
      toast.success('Фотографии успешно загружены!')
      setSelectedFiles(null)
      setUploadStageId(undefined)
      // Сброс поля выбора файлов
      const fileInput = document.getElementById('photo-files') as HTMLInputElement
      if (fileInput) fileInput.value = ''
      
      fetchData()
    } catch (err: any) {
      toast.error('Ошибка загрузки файлов: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleDeletePhoto = async (photoId: number, e: React.MouseEvent) => {
    e.stopPropagation() // Предотвращаем открытие лайтбокса
    if (!confirm('Вы уверены, что хотите удалить эту фотографию с сервера?')) return

    try {
      await apiDelete(`/crm-photos/${photoId}`)
      toast.success('Фотография успешно удалена')
      // Закрываем лайтбокс, если удаляли из него
      if (activePhoto?.id === photoId) {
        setActivePhoto(null)
      }
      fetchData()
    } catch (err: any) {
      toast.error('Ошибка удаления фотографии: ' + err.message)
    }
  }

  if (!projectId) {
    return (
      <div className="p-8 text-center text-slate-500">
        Укажите идентификатор проекта (?projectId=...) для просмотра его фотогалереи
      </div>
    )
  }

  return (
    <motion.div 
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-6 text-slate-800 dark:text-slate-100"
    >
      {/* Header with back navigation */}
      <div className="flex items-center gap-4">
        <Link 
          to="/crm"
          className="p-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </Link>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Фотоотчёты по проекту</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Проект: {projectName || 'Загрузка...'}</p>
        </div>
      </div>

      {/* Upload Panel */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Загрузить новые фотографии</h3>
        
        <form onSubmit={handleUpload} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Привязать к этапу работ (опционально)</label>
            <select
              value={uploadStageId || ''}
              onChange={(e) => setUploadStageId(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-violet-500 text-slate-950 dark:text-white"
            >
              <option value="">Общий отчет по проекту</option>
              {stages.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Выбрать изображения *</label>
            <input
              id="photo-files"
              type="file"
              multiple
              required
              accept="image/png, image/jpeg, image/jpg"
              onChange={handleFileChange}
              className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100 dark:file:bg-slate-700 dark:file:text-slate-300"
            />
          </div>

          <button
            type="submit"
            disabled={uploading}
            className="w-full py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold shadow-sm flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 h-[38px]"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Загрузка...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Загрузить файлы
              </>
            )}
          </button>
        </form>
      </div>

      {/* Photo Grid Gallery */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-2">
          <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
          Загрузка галереи...
        </div>
      ) : photos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
          <Camera className="w-16 h-16 text-slate-400 dark:text-slate-500 mb-4" />
          <p className="text-lg font-semibold text-slate-900 dark:text-white">Фотоотчётов нет</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Загрузите фотографии для подтверждения факта выполненных строительных работ</p>
        </div>
      ) : (
        <motion.div 
          variants={staggerContainer}
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
        >
          {photos.map((photo) => (
            <motion.div
              key={photo.id}
              variants={fadeInUp}
              onClick={() => setActivePhoto(photo)}
              className="group relative aspect-square bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden cursor-zoom-in border border-slate-200 dark:border-slate-700/50 shadow-sm"
            >
              {/* Photo tag (stage) */}
              <span className="absolute top-2.5 left-2.5 z-10 px-2 py-0.5 text-[10px] font-semibold bg-slate-900/80 backdrop-blur-sm text-white rounded-full">
                {photo.stage_name || 'Общий'}
              </span>

              {/* Delete button (hover) */}
              <button
                onClick={(e) => handleDeletePhoto(photo.id, e)}
                className="absolute top-2.5 right-2.5 z-10 p-1.5 bg-rose-600/90 text-white rounded-xl opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-700 shadow-sm"
                title="Удалить фото"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              {/* Main Image */}
              <img 
                src={`http://localhost:8000${photo.url}`} 
                alt={photo.stage_name || 'Project report'} 
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />

              {/* Hover overlay description */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3 text-white">
                <div className="flex items-center gap-1 text-[10px] text-slate-300">
                  <User className="w-3 h-3" />
                  <span className="truncate">{photo.uploader_name || 'Прораб'}</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                  <Calendar className="w-3 h-3" />
                  <span>{format(new Date(photo.created_at), 'dd.MM.yyyy')}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* --- LIGHTBOX MODAL --- */}
      <AnimatePresence>
        {activePhoto && (
          <div 
            className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 bg-slate-950/95"
            onClick={() => setActivePhoto(null)}
          >
            <button 
              onClick={() => setActivePhoto(null)} 
              className="absolute top-6 right-6 p-2.5 bg-slate-900 text-slate-400 hover:text-white rounded-full transition-colors border border-slate-800"
            >
              <X className="w-6 h-6" />
            </button>

            {/* Lightbox image content */}
            <motion.div
              variants={scaleIn}
              initial="hidden"
              animate="visible"
              exit="hidden"
              onClick={(e) => e.stopPropagation()} // Предотвращаем закрытие
              className="w-full max-w-4xl max-h-[75vh] flex justify-center items-center rounded-2xl overflow-hidden bg-slate-900 border border-slate-850 shadow-2xl relative"
            >
              <img 
                src={`http://localhost:8000${activePhoto.url}`} 
                alt="Fullscreen report" 
                className="w-full h-full object-contain max-h-[75vh]"
              />
            </motion.div>

            {/* Description card under image */}
            <div 
              onClick={(e) => e.stopPropagation()}
              className="mt-6 bg-slate-900 border border-slate-800 rounded-2xl px-6 py-4 w-full max-w-lg text-white flex justify-between items-center shadow-lg"
            >
              <div className="space-y-1">
                <span className="px-2 py-0.5 text-xs font-semibold bg-violet-600/30 text-violet-400 border border-violet-500/20 rounded-full">
                  {activePhoto.stage_name || 'Общий отчет'}
                </span>
                <div className="flex items-center gap-4 mt-2.5 text-sm text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <User className="w-4 h-4 text-slate-500" />
                    Загрузил: {activePhoto.uploader_name || 'Прораб'}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-slate-500" />
                    Дата: {format(new Date(activePhoto.created_at), 'dd.MM.yyyy HH:mm')}
                  </span>
                </div>
              </div>

              <button
                onClick={(e) => handleDeletePhoto(activePhoto.id, e)}
                className="p-3 bg-rose-600/10 text-rose-500 hover:bg-rose-600 hover:text-white rounded-xl transition-all border border-rose-500/20"
                title="Удалить фото"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
