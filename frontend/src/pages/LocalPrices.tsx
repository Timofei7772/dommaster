import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, MapPin, ChevronLeft, ChevronRight, RotateCw } from 'lucide-react'
import { apiGet, apiPost } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import Button from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import toast from 'react-hot-toast'
import { motion } from 'framer-motion'

interface LocalPrice {
  id: string
  category: string
  name: string
  unit: string
  price: number
  region: string
  city: string
  updated_at: string
}

const CITIES = ['Все', 'Салават', 'Стерлитамак', 'Ишимбай']
const CATEGORIES = ['Все', 'Отделка', 'Сантехника', 'Электрика', 'Фундамент', 'Кровля', 'Фасад', 'Стены', 'Полы']
const ITEMS_PER_PAGE = 15

export default function LocalPrices() {
  const [city, setCity] = useState('Все')
  const [category, setCategory] = useState('Все')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const queryClient = useQueryClient()

  const { data: prices, isLoading } = useQuery({
    queryKey: ['local-prices', city, category, search],
    queryFn: () => apiGet<LocalPrice[]>(`/prices/local?city=${city}&category=${category}&search=${search}`),
  })

  // Client-side pagination
  const totalPages = useMemo(() => {
    if (!prices) return 1
    return Math.max(1, Math.ceil(prices.length / ITEMS_PER_PAGE))
  }, [prices])

  const paginatedPrices = useMemo(() => {
    if (!prices) return []
    const start = (page - 1) * ITEMS_PER_PAGE
    return prices.slice(start, start + ITEMS_PER_PAGE)
  }, [prices, page])

  // Reset to page 1 when filters change
  const handleFilterChange = (setter: (v: string) => void) => (val: string) => {
    setter(val)
    setPage(1)
  }

  const addMutation = useMutation({
    mutationFn: (data: any) => apiPost('/prices/local', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['local-prices'] })
      setShowAddDialog(false)
      toast.success('Цена добавлена')
    },
  })

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Цены региона</h1>
          <p className="text-sm text-slate-500 mt-1">Башкортостан · Салават, Стерлитамак, Ишимбай</p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="w-4 h-4 mr-2" /> Добавить цену
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Поиск материалов и работ..."
                value={search}
                onChange={(e) => handleFilterChange(setSearch)(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              value={city}
              onChange={(e) => handleFilterChange(setCity)(e.target.value)}
              options={CITIES.map(c => ({ value: c, label: c }))}
              className="w-40"
            />
            <Select
              value={category}
              onChange={(e) => handleFilterChange(setCategory)(e.target.value)}
              options={CATEGORIES.map(c => ({ value: c, label: c }))}
              className="w-40"
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <th className="text-left p-4 font-semibold text-slate-500">Наименование</th>
                  <th className="text-left p-4 font-semibold text-slate-500">Категория</th>
                  <th className="text-left p-4 font-semibold text-slate-500">Ед.</th>
                  <th className="text-right p-4 font-semibold text-slate-500">Цена</th>
                  <th className="text-left p-4 font-semibold text-slate-500">Город</th>
                  <th className="text-right p-4 font-semibold text-slate-500">Обновлено</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-400">
                      <div className="flex items-center justify-center gap-2">
                        <RotateCw className="w-4 h-4 animate-spin" />
                        Загрузка...
                      </div>
                    </td>
                  </tr>
                ) : paginatedPrices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-400">Нет данных</td>
                  </tr>
                ) : (
                  paginatedPrices.map((p, i) => (
                    <motion.tr
                      key={p.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <td className="p-4 font-medium text-slate-800 dark:text-slate-200">{p.name}</td>
                      <td className="p-4">
                        <span className="px-2 py-1 text-xs rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
                          {p.category}
                        </span>
                      </td>
                      <td className="p-4 text-slate-500">{p.unit}</td>
                      <td className="p-4 text-right font-semibold text-slate-800 dark:text-slate-200">
                        {p.price.toLocaleString('ru')} ₽
                      </td>
                      <td className="p-4">
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                          <MapPin className="w-3 h-3" /> {p.city}
                        </span>
                      </td>
                      <td className="p-4 text-right text-xs text-slate-400">
                        {new Date(p.updated_at).toLocaleDateString('ru')}
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
              <span className="text-xs text-slate-500">
                Страница {page} из {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(page - p) <= 2)
                  .map((p, idx, arr) => (
                    <span key={p} className="flex items-center">
                      {idx > 0 && arr[idx - 1] !== p - 1 && (
                        <span className="px-1 text-slate-400 text-xs">...</span>
                      )}
                      <button
                        onClick={() => setPage(p)}
                        className={`min-w-[32px] h-8 px-2 rounded-lg text-sm font-medium transition-colors ${
                          page === p
                            ? 'bg-primary-500 text-white'
                            : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {p}
                      </button>
                    </span>
                  ))}
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1.5 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 disabled:opacity-40 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onClose={() => setShowAddDialog(false)} title="Добавить цену">
        <DialogContent>
          <form onSubmit={(e) => {
            e.preventDefault()
            const form = new FormData(e.currentTarget)
            addMutation.mutate(Object.fromEntries(form))
          }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Наименование</label>
              <Input name="name" required placeholder="Штукатурка цементная..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Категория</label>
                <Select name="category" options={CATEGORIES.filter(c => c !== 'Все').map(c => ({ value: c, label: c }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Ед. изм.</label>
                <Input name="unit" required placeholder="м², шт, кг..." />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Цена (₽)</label>
                <Input name="price" type="number" required placeholder="500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Город</label>
                <Select name="city" options={['Салават', 'Стерлитамак', 'Ишимбай'].map(c => ({ value: c, label: c }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowAddDialog(false)}>Отмена</Button>
              <Button type="submit">Сохранить</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
