/**
 * ZARU Смета - Страница ФОТ (Фонд оплаты труда)
 * Расчёт зарплаты, налогов и отчислений
 * Учитывает режим налогообложения из настроек
 */

import { useState, useMemo, useCallback, useEffect } from 'react'
import {
    Calculator,
    Users,
    Wallet,
    TrendingUp,
    Download,
    Plus,
    Trash2,
    DollarSign,
    Percent,
    FileText,
    Settings,
    AlertCircle
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { useSettings } from '@/hooks/useSettings'
import { getElectronAPI } from '@/lib/electron'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'

interface Worker {
    id: number
    name: string
    position: string
    salary: number
    workDays: number
    overtime: number
    bonus: number
}

const defaultWorkers: Worker[] = [
    { id: 1, name: 'Иванов И.И.', position: 'Прораб', salary: 80000, workDays: 22, overtime: 0, bonus: 0 },
    { id: 2, name: 'Петров П.П.', position: 'Мастер', salary: 60000, workDays: 22, overtime: 8, bonus: 5000 },
    { id: 3, name: 'Сидоров С.С.', position: 'Плиточник', salary: 50000, workDays: 20, overtime: 0, bonus: 0 },
]

// Ставки налогов и отчислений (2024)
const TAX_RATES = {
    ndfl: 0.13,        // НДФЛ 13%
    pfr: 0.22,         // ПФР 22%
    fss: 0.029,        // ФСС 2.9%
    ffoms: 0.051,      // ФФОМС 5.1%
    nsPfr: 0.02,       // НС и ПЗ (травматизм) ~2%
    selfemployed: 0.06, // НПД для самозанятых 6%
}

export default function FOT() {
    const { settings } = useSettings()
    const [workers, setWorkersState] = useState<Worker[]>([])
    const [, setLoaded] = useState(false)
    const [showAddModal, setShowAddModal] = useState(false)
    const [newWorker, setNewWorker] = useState({ name: '', position: '', salary: 0, workDays: 22, overtime: 0, bonus: 0 })

    // Загрузка из БД при старте
    useEffect(() => {
      (async () => {
        try {
          const data = await window.electronAPI?.fot?.getWorkers?.()
          setWorkersState(data?.length ? data : defaultWorkers)
        } catch {
          setWorkersState(defaultWorkers)
        }
        setLoaded(true)
      })()
    }, [])

    const setWorkers = useCallback((updaterOrValue: Worker[] | ((prev: Worker[]) => Worker[])) => {
      setWorkersState(prev => {
        const newVal = typeof updaterOrValue === 'function' ? updaterOrValue(prev) : updaterOrValue
        window.electronAPI?.fot?.saveWorkers?.(newVal)
        return newVal
      })
    }, [])

    // Получаем режим налогообложения из настроек
    const fotMode = settings.fot?.mode || 'employee'
    const ndflEnabled = settings.fot?.ndflEnabled ?? true
    const insuranceEnabled = settings.fot?.insuranceEnabled ?? true

    // Расчёты для каждого работника с учётом режима
    const calculations = useMemo(() => {
        return workers.map(w => {
            const workDays = w.workDays || 22
            const grossSalary = w.salary + w.bonus + (w.overtime * (w.salary / workDays / 8) * 1.5)
            
            // НДФЛ - только если включён и режим не самозанятый
            const ndfl = (fotMode === 'selfemployed' || !ndflEnabled) ? 0 : grossSalary * TAX_RATES.ndfl
            const netSalary = grossSalary - ndfl

            // Отчисления работодателя - только если режим сотрудник и взносы включены
            const pfr = (fotMode === 'selfemployed' || !insuranceEnabled) ? 0 : grossSalary * TAX_RATES.pfr
            const fss = (fotMode === 'selfemployed' || !insuranceEnabled) ? 0 : grossSalary * TAX_RATES.fss
            const ffoms = (fotMode === 'selfemployed' || !insuranceEnabled) ? 0 : grossSalary * TAX_RATES.ffoms
            const nsPfr = (fotMode === 'selfemployed' || !insuranceEnabled) ? 0 : grossSalary * TAX_RATES.nsPfr
            
            // НПД для самозанятых
            const npd = fotMode === 'selfemployed' ? grossSalary * TAX_RATES.selfemployed : 0
            
            const totalTaxes = pfr + fss + ffoms + nsPfr + npd
            const totalCost = grossSalary + totalTaxes

            return {
                ...w,
                grossSalary,
                ndfl,
                netSalary,
                pfr,
                fss,
                ffoms,
                nsPfr,
                npd,
                totalTaxes,
                totalCost
            }
        })
    }, [workers, fotMode, ndflEnabled, insuranceEnabled])

    // Итоги
    const totals = useMemo(() => {
        return calculations.reduce((acc, c) => ({
            grossSalary: acc.grossSalary + c.grossSalary,
            ndfl: acc.ndfl + c.ndfl,
            netSalary: acc.netSalary + c.netSalary,
            pfr: acc.pfr + c.pfr,
            fss: acc.fss + c.fss,
            ffoms: acc.ffoms + c.ffoms,
            nsPfr: acc.nsPfr + c.nsPfr,
            totalTaxes: acc.totalTaxes + c.totalTaxes,
            totalCost: acc.totalCost + c.totalCost
        }), { grossSalary: 0, ndfl: 0, netSalary: 0, pfr: 0, fss: 0, ffoms: 0, nsPfr: 0, totalTaxes: 0, totalCost: 0 })
    }, [calculations])

    const handleAddWorker = () => {
        if (!newWorker.name || !newWorker.position || newWorker.salary <= 0) {
            toast.error('Заполните все поля')
            return
        }
        setWorkers([...workers, { ...newWorker, id: Date.now() }])
        setNewWorker({ name: '', position: '', salary: 0, workDays: 22, overtime: 0, bonus: 0 })
        setShowAddModal(false)
        toast.success('Работник добавлен')
    }

    const handleDeleteWorker = (id: number) => {
        setWorkers(workers.filter(w => w.id !== id))
        toast.success('Работник удалён')
    }

    const handleExport = async () => {
        const data = calculations.map(c => ({
            'ФИО': c.name,
            'Должность': c.position,
            'Начислено': c.grossSalary,
            'НДФЛ': c.ndfl,
            'К выплате': c.netSalary,
            'ПФР': c.pfr,
            'ФСС': c.fss + c.ffoms,
            'Итого затрат': c.totalCost
        }))
        
        try {
            const ws = XLSX.utils.json_to_sheet(data)
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, 'ФОТ')
            const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
            
            const api = getElectronAPI()
            if (api?.dialog) {
                const fileName = `ФОТ_${new Date().toISOString().slice(0, 10)}.xlsx`
                const dialogResult = await api.dialog.showSaveDialog({
                    title: 'Сохранить ФОТ (Фонд оплаты труда)',
                    defaultPath: fileName,
                    filters: [{ name: 'Excel файлы', extensions: ['xlsx'] }]
                })
                
                if (!dialogResult.canceled && dialogResult.filePath) {
                    if (window.require) {
                        const fs = window.require('fs')
                        fs.writeFileSync(dialogResult.filePath, Buffer.from(buf))
                        toast.success(`✅ ФОТ сохранен:\\n${dialogResult.filePath}`, { duration: 6000 })
                        
                        if (api?.shell) {
                            await api.shell.showItemInFolder(dialogResult.filePath)
                        }
                    }
                }
            } else {
                saveAs(new Blob([buf]), `ФОТ_${new Date().toISOString().slice(0, 10)}.xlsx`)
                toast.success('ФОТ загружен в папку Downloads', { duration: 4000 })
            }
        } catch (err) {
            console.error('Ошибка экспорта:', err)
            toast.error('Ошибка при сохранении ФОТ')
        }
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Заголовок */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Calculator className="w-7 h-7 text-primary-600" />
                        Фонд оплаты труда (ФОТ)
                    </h1>
                    <p className="text-slate-600 dark:text-slate-400">Расчёт зарплат, налогов и отчислений</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setShowAddModal(true)} className="btn-primary flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        Добавить
                    </button>
                    <button onClick={handleExport} className="btn-secondary flex items-center gap-2">
                        <Download className="w-4 h-4" />
                        Экспорт
                    </button>
                </div>
            </div>

            {/* Режим налогообложения */}
            <div className={`p-4 rounded-xl border ${
                fotMode === 'selfemployed' 
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                    : fotMode === 'ip_patent'
                        ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                        : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
            }`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <AlertCircle className={`w-5 h-5 ${
                            fotMode === 'selfemployed' ? 'text-green-600' 
                            : fotMode === 'ip_patent' ? 'text-amber-600' : 'text-blue-600'
                        }`} />
                        <div>
                            <p className="font-semibold">
                                Режим: {fotMode === 'selfemployed' ? 'Самозанятые (НПД)' 
                                    : fotMode === 'ip_patent' ? 'ИП / Патент' : 'Сотрудники по ТК'}
                            </p>
                            <p className="text-sm opacity-75">
                                {fotMode === 'selfemployed' 
                                    ? 'НДФЛ не удерживается, страх. взносы не начисляются'
                                    : ndflEnabled && insuranceEnabled 
                                        ? 'НДФЛ 13% + страховые взносы ~30%'
                                        : !ndflEnabled && !insuranceEnabled
                                            ? 'Налоги отключены'
                                            : ndflEnabled ? 'Только НДФЛ 13%' : 'Только страховые взносы'}
                            </p>
                        </div>
                    </div>
                    <Link to="/settings" className="btn-secondary text-sm flex items-center gap-1">
                        <Settings className="w-4 h-4" />
                        Изменить
                    </Link>
                </div>
            </div>

            {/* Карточки итогов */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="card p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                            <Users className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-500">Работников</p>
                            <p className="text-xl font-bold">{workers.length}</p>
                        </div>
                    </div>
                </div>
                <div className="card p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                            <Wallet className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-500">К выплате</p>
                            <p className="text-xl font-bold text-green-600">{formatCurrency(totals.netSalary)}</p>
                        </div>
                    </div>
                </div>
                <div className="card p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                            <Percent className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-500">Налоги и взносы</p>
                            <p className="text-xl font-bold text-amber-600">{formatCurrency(totals.totalTaxes + totals.ndfl)}</p>
                        </div>
                    </div>
                </div>
                <div className="card p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-purple-600" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-500">Общие затраты</p>
                            <p className="text-xl font-bold text-purple-600">{formatCurrency(totals.totalCost)}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Таблица работников */}
            <div className="card overflow-hidden">
                <div className="card-header">
                    <h2 className="font-semibold flex items-center gap-2">
                        <FileText className="w-5 h-5 text-slate-600" />
                        Ведомость ФОТ
                    </h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-slate-50 dark:bg-slate-800/50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">ФИО</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Должность</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">Начислено</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">НДФЛ 13%</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">К выплате</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">ПФР 22%</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">ФСС 2.9%</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">ФФОМС 5.1%</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">НС/ПЗ</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">Итого затрат</th>
                                <th className="px-4 py-3 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {calculations.map(c => (
                                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                                    <td className="px-4 py-3 font-medium">{c.name}</td>
                                    <td className="px-4 py-3 text-slate-600">{c.position}</td>
                                    <td className="px-4 py-3 text-right">{formatCurrency(c.grossSalary)}</td>
                                    <td className="px-4 py-3 text-right text-red-600">-{formatCurrency(c.ndfl)}</td>
                                    <td className="px-4 py-3 text-right font-bold text-green-600">{formatCurrency(c.netSalary)}</td>
                                    <td className="px-4 py-3 text-right text-slate-500">{formatCurrency(c.pfr)}</td>
                                    <td className="px-4 py-3 text-right text-slate-500">{formatCurrency(c.fss)}</td>
                                    <td className="px-4 py-3 text-right text-slate-500">{formatCurrency(c.ffoms)}</td>
                                    <td className="px-4 py-3 text-right text-slate-500">{formatCurrency(c.nsPfr)}</td>
                                    <td className="px-4 py-3 text-right font-bold">{formatCurrency(c.totalCost)}</td>
                                    <td className="px-4 py-3">
                                        <button onClick={() => handleDeleteWorker(c.id)} className="p-1 text-red-500 hover:bg-red-50 rounded">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-slate-100 dark:bg-slate-800 font-bold">
                            <tr>
                                <td className="px-4 py-3" colSpan={2}>ИТОГО</td>
                                <td className="px-4 py-3 text-right">{formatCurrency(totals.grossSalary)}</td>
                                <td className="px-4 py-3 text-right text-red-600">-{formatCurrency(totals.ndfl)}</td>
                                <td className="px-4 py-3 text-right text-green-600">{formatCurrency(totals.netSalary)}</td>
                                <td className="px-4 py-3 text-right">{formatCurrency(totals.pfr)}</td>
                                <td className="px-4 py-3 text-right">{formatCurrency(totals.fss)}</td>
                                <td className="px-4 py-3 text-right">{formatCurrency(totals.ffoms)}</td>
                                <td className="px-4 py-3 text-right">{formatCurrency(totals.nsPfr)}</td>
                                <td className="px-4 py-3 text-right text-purple-600">{formatCurrency(totals.totalCost)}</td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {/* Справка по ставкам */}
            <div className="card p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <DollarSign className="w-5 h-5" />
                    Ставки налогов и взносов (2024)
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                        <p className="text-slate-500">НДФЛ</p>
                        <p className="font-bold">13%</p>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                        <p className="text-slate-500">ПФР</p>
                        <p className="font-bold">22%</p>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                        <p className="text-slate-500">ФСС</p>
                        <p className="font-bold">2.9%</p>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                        <p className="text-slate-500">ФФОМС</p>
                        <p className="font-bold">5.1%</p>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                        <p className="text-slate-500">НС и ПЗ</p>
                        <p className="font-bold">~2%</p>
                    </div>
                </div>
            </div>

            {/* Модальное окно добавления */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="card p-6 w-full max-w-md mx-4">
                        <h3 className="text-lg font-semibold mb-4">Добавить работника</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm text-slate-500">ФИО</label>
                                <input
                                    type="text"
                                    value={newWorker.name}
                                    onChange={e => setNewWorker({ ...newWorker, name: e.target.value })}
                                    className="input"
                                    placeholder="Иванов Иван Иванович"
                                />
                            </div>
                            <div>
                                <label className="text-sm text-slate-500">Должность</label>
                                <input
                                    type="text"
                                    value={newWorker.position}
                                    onChange={e => setNewWorker({ ...newWorker, position: e.target.value })}
                                    className="input"
                                    placeholder="Прораб"
                                />
                            </div>
                            <div>
                                <label className="text-sm text-slate-500">Оклад (руб.)</label>
                                <input
                                    type="number"
                                    value={newWorker.salary || ''}
                                    onChange={e => setNewWorker({ ...newWorker, salary: Number(e.target.value) })}
                                    className="input"
                                    placeholder="50000"
                                />
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="text-sm text-slate-500">Раб. дней</label>
                                    <input
                                        type="number"
                                        value={newWorker.workDays}
                                        onChange={e => setNewWorker({ ...newWorker, workDays: Number(e.target.value) })}
                                        className="input"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm text-slate-500">Переработка (ч)</label>
                                    <input
                                        type="number"
                                        value={newWorker.overtime || ''}
                                        onChange={e => setNewWorker({ ...newWorker, overtime: Number(e.target.value) })}
                                        className="input"
                                        placeholder="0"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm text-slate-500">Премия (руб.)</label>
                                    <input
                                        type="number"
                                        value={newWorker.bonus || ''}
                                        onChange={e => setNewWorker({ ...newWorker, bonus: Number(e.target.value) })}
                                        className="input"
                                        placeholder="0"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2 mt-6">
                            <button onClick={() => setShowAddModal(false)} className="btn-secondary flex-1">Отмена</button>
                            <button onClick={handleAddWorker} className="btn-primary flex-1">Добавить</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
