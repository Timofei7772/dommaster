import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, FileText, Loader2, Search } from 'lucide-react'
import { templatesApi } from '@/lib/api'

interface Props {
    onClose: () => void
    onSelect: (templateId: string) => void
}

export default function TemplateSelectionModal({ onClose, onSelect }: Props) {
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [search, setSearch] = useState('')

    const { data: templatesData, isLoading } = useQuery({
        queryKey: ['templates'],
        queryFn: () => templatesApi.list()
    })

    // Filter for contract templates only
    const templates = (templatesData || []).filter((t: any) =>
        t.category === 'contracts' &&
        (t.name.toLowerCase().includes(search.toLowerCase()) ||
            t.file.toLowerCase().includes(search.toLowerCase()))
    )

    const handleSelect = () => {
        if (selectedId) {
            onSelect(selectedId)
        }
    }

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="fixed inset-0 bg-black/50" onClick={onClose} />

            <div className="relative min-h-full flex items-center justify-center p-4">
                <div className="relative bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-lg">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                        <h2 className="text-lg font-semibold">Выберите шаблон договора</h2>
                        <button onClick={onClose} className="btn-ghost p-2">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-6 space-y-4">
                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Поиск шаблона..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
                            />
                        </div>

                        {/* List */}
                        <div className="space-y-2 max-h-[400px] overflow-y-auto">
                            {isLoading ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                                </div>
                            ) : templates.length === 0 ? (
                                <div className="text-center py-8 text-slate-500">
                                    Шаблоны не найдены
                                </div>
                            ) : (
                                templates.map((template: any) => (
                                    <div
                                        key={template.id}
                                        onClick={() => setSelectedId(template.id)}
                                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedId === template.id
                                                ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                                                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                                            }`}
                                    >
                                        <div className={`w-8 h-8 rounded flex items-center justify-center ${selectedId === template.id ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                                            <FileText className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <h3 className="font-medium text-sm">{template.name}</h3>
                                            <p className="text-xs text-slate-500">{template.file}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Footer */}
                        <div className="flex justify-end gap-3 pt-2">
                            <button onClick={onClose} className="px-4 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                                Отмена
                            </button>
                            <button
                                onClick={handleSelect}
                                disabled={!selectedId}
                                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Выбрать
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
