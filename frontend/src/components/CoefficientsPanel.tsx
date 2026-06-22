/**
 * ZARU AI смета - Панель коэффициентов
 * Управление коэффициентами расчёта сметы
 */

import { useState, useEffect, useCallback } from 'react'
import type { Coefficients, MarginReport } from '@/lib/EstimateEngine'
import { PRESET_SCENARIOS, formatCurrency } from '@/lib/EstimateEngine'

// Types come from @/lib/electron

interface CoefficientsPanelProps {
    estimateId: number
    onRecalculate?: (report: MarginReport) => void
}

export function CoefficientsPanel({ estimateId, onRecalculate }: CoefficientsPanelProps) {
    const [coefficients, setCoefficients] = useState<Coefficients>({
        estimate_id: estimateId,
        work_coef: 1.8,
        material_coef: 1.04,
        overhead_coef: 1.0,
        profit_coef: 1.0
    })
    const [marginReport, setMarginReport] = useState<MarginReport | null>(null)
    const [isExpanded, setIsExpanded] = useState(true)
    const [isLoading, setIsLoading] = useState(false)

    const loadCoefficients = useCallback(async () => {
        if (window.electronAPI?.coefficients) {
            try {
                const coef = await window.electronAPI.coefficients.get(estimateId)
                setCoefficients(coef)
            } catch (error) {
                console.error('Ошибка загрузки коэффициентов:', error)
            }
        }
    }, [estimateId])

    useEffect(() => {
        loadCoefficients()
    }, [loadCoefficients])

    const handleSave = async () => {
        setIsLoading(true)
        try {
            if (window.electronAPI?.coefficients) {
                await window.electronAPI.coefficients.set(estimateId, coefficients)
                const report = await window.electronAPI.coefficients.recalculate(estimateId)
                setMarginReport(report)
                onRecalculate?.(report)
            }
        } catch (error) {
            console.error('Ошибка сохранения коэффициентов:', error)
        } finally {
            setIsLoading(false)
        }
    }

    const applyPreset = (presetKey: keyof typeof PRESET_SCENARIOS) => {
        const preset = PRESET_SCENARIOS[presetKey]
        setCoefficients(prev => ({
            ...prev,
            work_coef: preset.work_coef,
            material_coef: preset.material_coef
        }))
    }

    const handleInputChange = (field: keyof Coefficients, value: number) => {
        setCoefficients(prev => ({
            ...prev,
            [field]: value
        }))
    }

    return (
        <div className="card border-blue-200 dark:border-blue-800">
            <div
                className="flex items-center justify-between p-4 cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2">
                    <span className="text-blue-500">⚙️</span>
                    <span className="font-medium">Коэффициенты расчёта</span>
                </div>
                <div className="flex items-center gap-2">
                    {marginReport && (
                        <span className={`text-sm px-2 py-1 rounded ${marginReport.margin_percent > 15 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                            Маржа: {marginReport.margin_percent.toFixed(1)}%
                        </span>
                    )}
                    <span>{isExpanded ? '▲' : '▼'}</span>
                </div>
            </div>

            {isExpanded && (
                <div className="p-4 pt-0 space-y-4">
                    {/* Пресеты */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => applyPreset('economy')}
                            className="flex-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                            Эконом
                        </button>
                        <button
                            onClick={() => applyPreset('standard')}
                            className="flex-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                            Стандарт
                        </button>
                        <button
                            onClick={() => applyPreset('premium')}
                            className="flex-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                            Премиум
                        </button>
                    </div>

                    {/* Коэффициенты */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Коэф. на работы</label>
                            <input
                                type="number"
                                value={coefficients.work_coef}
                                onChange={(e) => handleInputChange('work_coef', parseFloat(e.target.value) || 1.0)}
                                className="input w-full text-sm"
                                step={0.05}
                                min={1.0}
                                max={3.0}
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Коэф. на материалы</label>
                            <input
                                type="number"
                                value={coefficients.material_coef}
                                onChange={(e) => handleInputChange('material_coef', parseFloat(e.target.value) || 1.0)}
                                className="input w-full text-sm"
                                step={0.01}
                                min={1.0}
                                max={1.5}
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Накладные</label>
                            <input
                                type="number"
                                value={coefficients.overhead_coef}
                                onChange={(e) => handleInputChange('overhead_coef', parseFloat(e.target.value) || 1.0)}
                                className="input w-full text-sm"
                                step={0.05}
                                min={1.0}
                                max={2.0}
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Прибыль</label>
                            <input
                                type="number"
                                value={coefficients.profit_coef}
                                onChange={(e) => handleInputChange('profit_coef', parseFloat(e.target.value) || 1.0)}
                                className="input w-full text-sm"
                                step={0.05}
                                min={1.0}
                                max={2.0}
                            />
                        </div>
                    </div>

                    {/* Отчёт о марже */}
                    {marginReport && (
                        <div className="rounded-lg bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 p-3 space-y-1">
                            <div className="flex justify-between text-xs">
                                <span className="text-gray-500">Фактич. (дефектовка)</span>
                                <span className="font-medium">{formatCurrency(marginReport.total_fact)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-gray-500">Сметная стоимость</span>
                                <span className="font-medium">{formatCurrency(marginReport.total_smeta)}</span>
                            </div>
                            <div className="flex justify-between text-sm font-medium border-t pt-1 mt-1">
                                <span>📈 Прибыль</span>
                                <span className="text-green-600 dark:text-green-400">
                                    {formatCurrency(marginReport.margin_abs)} ({marginReport.margin_percent.toFixed(1)}%)
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Кнопка пересчёта */}
                    <button
                        onClick={handleSave}
                        disabled={isLoading}
                        className="btn-primary w-full flex items-center justify-center gap-2"
                    >
                        {isLoading ? '⏳' : '🔄'}
                        Пересчитать смету
                    </button>
                </div>
            )}
        </div>
    )
}

export default CoefficientsPanel
