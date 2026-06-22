import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Edit2, FolderOpen, Check, X, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'

interface Section {
  id: number
  name: string
  code?: string
  level: number
  sort_order: number
}

interface Props {
  estimateId: number
  onSelectSection?: (sectionId: number | null) => void
  selectedSectionId?: number | null
}

// Предустановленные разделы (комнаты)
const PRESET_SECTIONS = [
  { name: 'Прихожая', code: 'ПРИХ' },
  { name: 'Коридор', code: 'КОР' },
  { name: 'Гостиная', code: 'ГОСТ' },
  { name: 'Зал', code: 'ЗАЛ' },
  { name: 'Спальня', code: 'СПАЛ' },
  { name: 'Спальня 2', code: 'СПАЛ2' },
  { name: 'Детская', code: 'ДЕТ' },
  { name: 'Кухня', code: 'КУХ' },
  { name: 'Кухня-гостиная', code: 'КУХ-ГОСТ' },
  { name: 'Санузел', code: 'СУ' },
  { name: 'Ванная', code: 'ВАНН' },
  { name: 'Туалет', code: 'ТУА' },
  { name: 'Совмещённый санузел', code: 'СУ-СОВ' },
  { name: 'Балкон', code: 'БАЛК' },
  { name: 'Лоджия', code: 'ЛОДЖ' },
  { name: 'Терраса', code: 'ТЕРР' },
  { name: 'Кладовая', code: 'КЛАД' },
  { name: 'Гардеробная', code: 'ГАРД' },
  { name: 'Кабинет', code: 'КАБ' },
  { name: 'Общие работы', code: 'ОБЩ' },
]

export default function SectionsManager({ estimateId, onSelectSection, selectedSectionId }: Props) {
  const queryClient = useQueryClient()
  const [newSectionName, setNewSectionName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [showPresets, setShowPresets] = useState(false)
  const [sectionsExpanded, setSectionsExpanded] = useState(true)

  // Загрузка разделов
  const { data: sections = [] } = useQuery({
    queryKey: ['estimate-sections', estimateId],
    queryFn: async () => {
      if (window.electronAPI?.estimateSections) {
        return await window.electronAPI.estimateSections.getAll(estimateId)
      }
      return []
    },
    enabled: !!estimateId,
  })

  // Создание раздела
  const createMutation = useMutation({
    mutationFn: async (data: { name: string; code?: string }) => {
      if (window.electronAPI?.estimateSections) {
        return await window.electronAPI.estimateSections.create({
          estimate_id: estimateId,
          name: data.name,
          code: data.code || '',
          level: 1,
          sort_order: sections.length
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate-sections', estimateId] })
      setNewSectionName('')
      toast.success('Раздел добавлен')
    }
  })

  // Удаление раздела
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      if (window.electronAPI?.estimateSections) {
        return await window.electronAPI.estimateSections.delete(id)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate-sections', estimateId] })
      queryClient.invalidateQueries({ queryKey: ['estimate-items', estimateId] })
      toast.success('Раздел удалён')
    }
  })

  const handleAddSection = () => {
    if (newSectionName.trim()) {
      createMutation.mutate({ name: newSectionName.trim() })
    }
  }

  const handleAddPreset = (preset: { name: string; code: string }) => {
    // Проверяем, нет ли уже такого раздела
    const exists = sections.some((s: Section) => s.name === preset.name)
    if (exists) {
      toast.error('Раздел уже существует')
      return
    }
    createMutation.mutate(preset)
  }

  const handleDeleteSection = (id: number) => {
    if (window.confirm('Удалить раздел? Позиции раздела останутся в смете.')) {
      deleteMutation.mutate(id)
    }
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-indigo-500" />
          Разделы (комнаты)
        </h3>
        <button
          onClick={() => setShowPresets(!showPresets)}
          className="text-sm text-indigo-600 hover:text-indigo-500"
        >
          {showPresets ? 'Скрыть шаблоны' : 'Добавить из шаблона'}
        </button>
      </div>

      {/* Предустановленные разделы */}
      {showPresets && (
        <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
          <p className="text-xs text-slate-500 mb-2">Выберите комнату:</p>
          <div className="flex flex-wrap gap-1">
            {PRESET_SECTIONS.map((preset) => {
              const exists = sections.some((s: Section) => s.name === preset.name)
              return (
                <button
                  key={preset.code}
                  onClick={() => handleAddPreset(preset)}
                  disabled={exists}
                  className={`px-2 py-1 text-xs rounded ${
                    exists
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                  }`}
                >
                  {preset.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Добавление нового раздела вручную */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={newSectionName}
          onChange={(e) => setNewSectionName(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleAddSection()}
          placeholder="Название раздела..."
          className="input flex-1 text-sm"
        />
        <button
          onClick={handleAddSection}
          disabled={!newSectionName.trim()}
          className="btn-primary px-3"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Список разделов */}
      <div className="space-y-1">
        {/* Все позиции (без раздела) */}
        <button
          onClick={() => onSelectSection?.(null)}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
            selectedSectionId === null
              ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
              : 'hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          <span>📋 Все позиции</span>
        </button>

        <button
          onClick={() => setSectionsExpanded(!sectionsExpanded)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <span className="flex items-center gap-2">
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${sectionsExpanded ? 'rotate-0' : '-rotate-90'}`} />
            📁 Разделы
          </span>
          <span className="text-xs text-slate-400">{sections.length}</span>
        </button>

        {sectionsExpanded && sections.map((section: Section) => (
          <div
            key={section.id}
            className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
              selectedSectionId === section.id
                ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                : 'hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            {editingId === section.id ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  className="input text-sm flex-1"
                  autoFocus
                />
                <button
                  onClick={() => {
                    // TODO: обновление раздела
                    setEditingId(null)
                  }}
                  className="text-green-600 hover:text-green-500"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="text-slate-400 hover:text-slate-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => onSelectSection?.(section.id)}
                  className="flex-1 text-left"
                >
                  📁 {section.name}
                </button>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditingId(section.id)
                      setEditingName(section.name)
                    }}
                    className="p-1 text-slate-400 hover:text-slate-600"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleDeleteSection(section.id)}
                    className="p-1 text-red-400 hover:text-red-600"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {sections.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-4">
          Разделы не созданы. Добавьте комнаты для группировки работ.
        </p>
      )}
    </div>
  )
}
