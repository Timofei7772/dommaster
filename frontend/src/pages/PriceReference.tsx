/**
 * ZARU Смета - Справочник цен на материалы
 * Поиск и обновление цен из различных источников
 */

import { useState, useEffect } from 'react'
import {
  Search,
  Package,
  RefreshCw,
  Download,
  TrendingUp,
  Database,
  Edit2,
  Save,
  X,
  MapPin
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { useSettings, REGIONS_DATA } from '@/hooks/useSettings'
import {
  searchMaterialPrice,
  getAllMaterialPrices,
  ParsedPrice,
  applyRegionCoefficient,
  exportPricesAsJson
} from '@/lib/priceParser'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'

export default function PriceReference() {
  const { settings } = useSettings()
  const [search, setSearch] = useState('')
  const [materials, setMaterials] = useState<ParsedPrice[]>([])
  const [searchResults, setSearchResults] = useState<ParsedPrice[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPrice, setEditPrice] = useState(0)
  
  // Региональный коэффициент
  const regionKey = settings.general?.region || 'moscow'
  const regionData = REGIONS_DATA[regionKey] || { name: 'Москва', coefficient: 1.0 }
  const coefficient = settings.estimates?.regionCoefficient || 1.0

  // Загружаем все материалы при старте
  useEffect(() => {
    setMaterials(getAllMaterialPrices())
  }, [])

  // Поиск материалов
  const handleSearch = async () => {
    if (!search.trim()) {
      setSearchResults([])
      return
    }
    
    setIsSearching(true)
    try {
      const result = await searchMaterialPrice(search)
      setSearchResults(result.results)
      if (result.results.length === 0) {
        toast.error('Материалы не найдены')
      }
    } catch {
      toast.error('Ошибка поиска')
    }
    setIsSearching(false)
  }

  // Экспорт в JSON
  const handleExport = () => {
    const json = exportPricesAsJson()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `prices_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('База цен экспортирована')
  }

  // Сохранить изменённую цену
  const handleSavePrice = (name: string) => {
    setMaterials(prev => prev.map(m => 
      m.name === name ? { ...m, price: editPrice } : m
    ))
    setEditingId(null)
    toast.success('Цена обновлена')
  }

  // Показываем результаты поиска или все материалы
  const displayedMaterials = searchResults.length > 0 ? searchResults : materials

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Заголовок */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Database className="w-7 h-7 text-primary-600" />
            Справочник цен
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Актуальные цены на строительные материалы
          </p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => {
              setMaterials(getAllMaterialPrices())
              toast.success('База обновлена')
            }}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Обновить
          </button>
          <button onClick={handleExport} className="btn-primary flex items-center gap-2">
            <Download className="w-4 h-4" />
            Экспорт
          </button>
        </div>
      </div>

      {/* Региональный коэффициент */}
      <div className="card p-4 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MapPin className="w-5 h-5 text-indigo-600" />
            <div>
              <p className="font-semibold text-indigo-900 dark:text-indigo-100">
                Регион: {regionData.name}
              </p>
              <p className="text-sm text-indigo-700 dark:text-indigo-300">
                Цены корректируются на коэффициент региона
              </p>
            </div>
          </div>
          <div className="text-2xl font-bold text-indigo-600">
            ×{coefficient.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Всего позиций</p>
              <p className="text-xl font-bold">{materials.length}</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Средняя цена</p>
              <p className="text-xl font-bold text-green-600">
                {formatCurrency(materials.reduce((a, m) => a + m.price, 0) / materials.length || 0)}
              </p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Обновлено</p>
              <p className="text-xl font-bold">{new Date().toLocaleDateString('ru')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Поиск */}
      <div className="card p-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Поиск материала (цемент, песок, кирпич...)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={isSearching}
            className="btn-primary px-6"
          >
            {isSearching ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              'Найти'
            )}
          </button>
          {searchResults.length > 0 && (
            <button
              onClick={() => {
                setSearchResults([])
                setSearch('')
              }}
              className="btn-secondary"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Таблица материалов */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="text-left p-4 font-medium text-slate-600 dark:text-slate-300">
                  Наименование
                </th>
                <th className="text-right p-4 font-medium text-slate-600 dark:text-slate-300">
                  Базовая цена
                </th>
                <th className="text-right p-4 font-medium text-slate-600 dark:text-slate-300">
                  С коэфф. ({regionData.name})
                </th>
                <th className="text-center p-4 font-medium text-slate-600 dark:text-slate-300">
                  Ед. изм.
                </th>
                <th className="text-center p-4 font-medium text-slate-600 dark:text-slate-300">
                  Источник
                </th>
                <th className="text-center p-4 font-medium text-slate-600 dark:text-slate-300">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {displayedMaterials.map((material, idx) => (
                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="p-4">
                    <p className="font-medium text-slate-900 dark:text-white">
                      {material.name}
                    </p>
                  </td>
                  <td className="p-4 text-right">
                    {editingId === material.name ? (
                      <input
                        type="number"
                        value={editPrice}
                        onChange={(e) => setEditPrice(Number(e.target.value))}
                        className="input w-28 text-right"
                        autoFocus
                      />
                    ) : (
                      <span className="font-mono text-slate-600 dark:text-slate-300">
                        {formatCurrency(material.price)}
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <span className="font-mono font-semibold text-indigo-600">
                      {formatCurrency(applyRegionCoefficient(material.price, coefficient))}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-sm">
                      {material.unit}
                    </span>
                  </td>
                  <td className="p-4 text-center text-sm text-slate-500">
                    {material.source}
                  </td>
                  <td className="p-4 text-center">
                    {editingId === material.name ? (
                      <div className="flex justify-center gap-1">
                        <button
                          onClick={() => handleSavePrice(material.name)}
                          className="p-1.5 hover:bg-green-100 rounded text-green-600"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-1.5 hover:bg-slate-100 rounded text-slate-500"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingId(material.name)
                          setEditPrice(material.price)
                        }}
                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-500"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {displayedMaterials.length === 0 && (
          <div className="p-12 text-center text-slate-500">
            <Package className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <p>Материалы не найдены</p>
          </div>
        )}
      </div>

      {/* Подсказка */}
      <div className="card p-4 bg-blue-50 dark:bg-blue-900/20">
        <p className="text-sm text-blue-700 dark:text-blue-300">
          <strong>Совет:</strong> Цены автоматически корректируются на региональный коэффициент. 
          {' '}Измените регион в <Link to="/settings" className="underline">Настройках</Link>, чтобы увидеть цены для вашего региона.
        </p>
      </div>
    </div>
  )
}
