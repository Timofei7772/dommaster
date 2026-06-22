/**
 * ZARU AI смета - Панель сценариев маржи
 * Сравнение различных вариантов коэффициентов
 */

import { useState, useEffect, useCallback } from 'react'
import { formatCurrency } from '@/lib/EstimateEngine'
import type { MarginScenario, ScenarioResult } from '@/lib/EstimateEngine'

// Types come from @/lib/electron

interface MarginScenariosPanelProps {
    estimateId: number
}

export function MarginScenariosPanel({ estimateId }: MarginScenariosPanelProps) {
    const [scenarios, setScenarios] = useState<MarginScenario[]>([])
    const [results, setResults] = useState<Map<number, ScenarioResult>>(new Map())
    const [isLoading, setIsLoading] = useState(false)
    const [newScenario, setNewScenario] = useState({
        name: '',
        work_coef_override: 1.8,
        material_coef_override: 1.04,
        description: ''
    })
    const [showAddForm, setShowAddForm] = useState(false)

    const loadScenarios = useCallback(async () => {
        if (window.electronAPI?.marginScenarios) {
            try {
                const api = window.electronAPI.marginScenarios
                const list = await api.getAll(estimateId)
                setScenarios(list)

                const resultMap = new Map<number, ScenarioResult>()
                for (const s of list) {
                    try {
                        const result = await api.calculate(estimateId, s.id)
                        resultMap.set(s.id, result)
                    } catch (e) {
                        console.error('Ошибка расчёта сценария:', s.id, e)
                    }
                }
                setResults(resultMap)
            } catch (error) {
                console.error('Ошибка загрузки сценариев:', error)
            }
        }
    }, [estimateId])

    useEffect(() => {
        loadScenarios()
    }, [loadScenarios])

    const handleAddScenario = async () => {
        if (!newScenario.name) return
        setIsLoading(true)

        try {
            if (window.electronAPI?.marginScenarios) {
                await window.electronAPI.marginScenarios.create({
                    estimate_id: estimateId,
                    ...newScenario
                })
                await loadScenarios()
                setNewScenario({
                    name: '',
                    work_coef_override: 1.8,
                    material_coef_override: 1.04,
                    description: ''
                })
                setShowAddForm(false)
            }
        } catch (error) {
            console.error('Ошибка создания сценария:', error)
        } finally {
            setIsLoading(false)
        }
    }

    const getMarginColor = (percent: number) => {
        if (percent >= 25) return 'text-green-600'
        if (percent >= 15) return 'text-blue-600'
        if (percent >= 10) return 'text-yellow-600'
        return 'text-red-600'
    }

    const getMarginLabel = (percent: number) => {
        if (percent >= 25) return { bg: 'bg-green-100 text-green-700', label: 'Отлично' }
        if (percent >= 15) return { bg: 'bg-blue-100 text-blue-700', label: 'Хорошо' }
        if (percent >= 10) return { bg: 'bg-yellow-100 text-yellow-700', label: 'Средне' }
        return { bg: 'bg-red-100 text-red-700', label: 'Низко' }
    }

    return (
        <div className="card border-purple-200 dark:border-purple-800">
            <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-2">
                    <span className="text-purple-500">📊</span>
                    <span className="font-medium">Сценарии маржи</span>
                </div>
                <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                >
                    ➕
                </button>
            </div>

            <div className="p-4 pt-0 space-y-3">
                {/* Форма добавления */}
                {showAddForm && (
                    <div className="border rounded-lg p-3 space-y-2 bg-gray-50 dark:bg-gray-800/50">
                        <input
                            placeholder="Название сценария"
                            value={newScenario.name}
                            onChange={(e) => setNewScenario(prev => ({ ...prev, name: e.target.value }))}
                            className="input w-full text-sm"
                        />
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-xs text-gray-500">Коэф. работы</label>
                                <input
                                    type="number"
                                    value={newScenario.work_coef_override}
                                    onChange={(e) => setNewScenario(prev => ({
                                        ...prev,
                                        work_coef_override: parseFloat(e.target.value) || 1.0
                                    }))}
                                    className="input w-full text-sm"
                                    step={0.05}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500">Коэф. материалов</label>
                                <input
                                    type="number"
                                    value={newScenario.material_coef_override}
                                    onChange={(e) => setNewScenario(prev => ({
                                        ...prev,
                                        material_coef_override: parseFloat(e.target.value) || 1.0
                                    }))}
                                    className="input w-full text-sm"
                                    step={0.01}
                                />
                            </div>
                        </div>
                        <button
                            onClick={handleAddScenario}
                            disabled={isLoading || !newScenario.name}
                            className="btn-primary w-full text-sm"
                        >
                            {isLoading ? '⏳ ' : ''}Добавить сценарий
                        </button>
                    </div>
                )}

                {/* Список сценариев */}
                {scenarios.length === 0 && !showAddForm ? (
                    <div className="text-center py-4 text-gray-500 text-sm">
                        Сценарии не созданы
                    </div>
                ) : (
                    <div className="space-y-2">
                        {scenarios.map((scenario) => {
                            const result = results.get(scenario.id)
                            const badge = result ? getMarginLabel(result.margin_percent) : null

                            return (
                                <div
                                    key={scenario.id}
                                    className="rounded-lg border p-3 space-y-2 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-sm">{scenario.name}</span>
                                        {badge && (
                                            <span className={`text-xs px-2 py-1 rounded ${badge.bg}`}>{badge.label}</span>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                                        <div>Работы: ×{scenario.work_coef_override?.toFixed(2) || '—'}</div>
                                        <div>Материалы: ×{scenario.material_coef_override?.toFixed(2) || '—'}</div>
                                    </div>

                                    {result && (
                                        <div className="pt-2 border-t">
                                            <div className="flex justify-between text-xs">
                                                <span className="text-gray-500">Сметная стоимость</span>
                                                <span className="font-medium">{formatCurrency(result.total_smeta)}</span>
                                            </div>
                                            <div className="flex justify-between text-sm mt-1">
                                                <span>{result.margin_percent >= 0 ? '📈' : '📉'} Маржа</span>
                                                <span className={`font-medium ${getMarginColor(result.margin_percent)}`}>
                                                    {formatCurrency(result.margin_abs)} ({result.margin_percent.toFixed(1)}%)
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* Сравнительная таблица */}
                {scenarios.length > 1 && results.size > 0 && (
                    <div className="pt-3 border-t">
                        <h4 className="text-xs font-medium text-gray-500 mb-2">Сравнение</h4>
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b">
                                    <th className="text-left py-1">Сценарий</th>
                                    <th className="text-right py-1">Смета</th>
                                    <th className="text-right py-1">Маржа %</th>
                                </tr>
                            </thead>
                            <tbody>
                                {scenarios.map((s) => {
                                    const r = results.get(s.id)
                                    if (!r) return null
                                    return (
                                        <tr key={s.id} className="border-b last:border-0">
                                            <td className="py-1">{s.name}</td>
                                            <td className="text-right py-1 font-mono">
                                                {(r.total_smeta / 1000).toFixed(0)}к
                                            </td>
                                            <td className={`text-right py-1 font-medium ${getMarginColor(r.margin_percent)}`}>
                                                {r.margin_percent.toFixed(1)}%
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}

export default MarginScenariosPanel
