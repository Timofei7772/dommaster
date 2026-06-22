/**
 * ZARU AI смета - Calculation Engine
 * Движок расчёта сметы с коэффициентами
 */

// =========================================
// ТИПЫ
// =========================================

// Типы строк по аналогии со ZaruAI Смета
// pr/rascenka — расценка (работа), mat/material — материал,
// meh/mechanism — механизм, spr — справочная, comment — комментарий,
// irazd — итог раздела, itog — итого по смете, lz_* — лимитированные затраты
export type RowType =
    | 'rascenka' | 'pr' | 'work'           // работы
    | 'material' | 'mat'                    // материалы
    | 'mechanism' | 'meh'                   // механизмы
    | 'comment' | 'spr' | 'empt'           // нерасчётные
    | 'irazd' | 'irazdp' | 'irazdm'        // итоги разделов
    | 'itog' | 'itogp' | 'itogm'           // итого по смете
    | 'lz_top_p' | 'lz_top_m' | 'lz_top_f' // лимзатраты сверху
    | 'lz_bot_p' | 'lz_bot_m' | 'lz_bot_f' // лимзатраты снизу

export interface EstimateItem {
    id: number
    estimate_id: number
    name: string
    unit: string
    quantity: number
    material_price: number
    labor_price: number
    row_type: RowType
    parent_item_id?: number
    section_id?: number
    catalog_item_id?: number
    quantity_expr?: string
    sum_fact: number
    sum_smeta: number
    justification?: string
    sort_order: number
}

export interface Coefficients {
    id?: number
    estimate_id: number
    work_coef: number      // Коэффициент на работы (напр. 1.8)
    material_coef: number  // Коэффициент на материалы (напр. 1.04)
    overhead_coef: number  // Накладные расходы
    profit_coef: number    // Прибыль
}

export interface EstimateSection {
    id: number
    estimate_id: number
    parent_section_id?: number
    name: string
    code?: string
    level: number
    sort_order: number
}

export interface EstimateTemplate {
    id: number
    name: string
    description?: string
    category: string
    template_data: string
    created_at: string
}

export interface MarginScenario {
    id: number
    estimate_id: number
    name: string
    work_coef_override?: number
    material_coef_override?: number
    description?: string
    created_at: string
}

export interface MarginReport {
    total_fact: number
    total_smeta: number
    margin_abs: number
    margin_percent: number
}

export interface ScenarioResult extends MarginReport {
    scenario_id: number
    scenario_name: string
}

// =========================================
// ЛОКАЛЬНЫЙ РАСЧЁТ (без обращения к backend)
// =========================================

// Вспомогательная функция: округление до 2 знаков (ROUND как в ZaruAI Смета)
function r2(v: number): number {
    return Math.round((v || 0) * 100) / 100
}

// Является ли тип строки нерасчётным
function isNonCalc(rowType: RowType | string): boolean {
    return (
        rowType === 'comment' || rowType === 'spr' || rowType === 'empt' ||
        rowType === 'irazd' || rowType === 'irazdp' || rowType === 'irazdm' ||
        rowType === 'itog' || rowType === 'itogp' || rowType === 'itogm' ||
        String(rowType).startsWith('lz_')
    )
}

// Является ли строка материалом
function isMat(rowType: RowType | string): boolean {
    return rowType === 'material' || rowType === 'mat'
}

// Является ли строка механизмом
function isMeh(rowType: RowType | string): boolean {
    return rowType === 'mechanism' || rowType === 'meh'
}

export class EstimateEngine {
    private coefficients: Coefficients

    constructor(coefficients?: Partial<Coefficients>) {
        this.coefficients = {
            estimate_id: 0,
            work_coef: coefficients?.work_coef ?? 1.8,
            material_coef: coefficients?.material_coef ?? 1.04,
            overhead_coef: coefficients?.overhead_coef ?? 1.0,
            profit_coef: coefficients?.profit_coef ?? 1.0
        }
    }

    setCoefficients(coef: Partial<Coefficients>): void {
        Object.assign(this.coefficients, coef)
    }

    getCoefficients(): Coefficients {
        return { ...this.coefficients }
    }

    /**
     * Рассчитать фактическую стоимость (дефектовка — без коэффициентов)
     */
    calculateDefectovka(items: EstimateItem[]): { total_materials: number; total_labor: number; total_meh: number; total: number } {
        let total_materials = 0
        let total_labor = 0
        let total_meh = 0

        items.forEach(item => {
            if (isNonCalc(item.row_type)) return
            const qty = item.quantity || 0
            const mat = item.material_price || 0
            const lab = item.labor_price || 0

            if (isMat(item.row_type)) {
                total_materials += r2(mat * qty)
            } else if (isMeh(item.row_type)) {
                total_meh += r2(mat * qty)
            } else {
                total_labor += r2(lab * qty) + r2(mat * qty)
            }
        })

        return {
            total_materials: r2(total_materials),
            total_labor: r2(total_labor),
            total_meh: r2(total_meh),
            total: r2(total_materials + total_labor + total_meh)
        }
    }

    /**
     * Рассчитать сметную стоимость строк (с коэффициентами, ROUND до 2 знаков)
     * Алгоритм: цена строки = ROUND(кол-во × ROUND(ценаФакт × коэфф, 2), 2)
     */
    calculateSmeta(items: EstimateItem[]): {
        sum_pr: number; sum_mat: number; sum_meh: number
        itogo: number; margin_abs: number; margin_percent: number
    } {
        const mc = this.coefficients.material_coef
        const wc = this.coefficients.work_coef
        let sum_pr = 0, sum_mat = 0, sum_meh = 0

        items.forEach(item => {
            if (isNonCalc(item.row_type)) return
            const qty = item.quantity || 0
            const mat = item.material_price || 0
            const lab = item.labor_price || 0

            if (isMat(item.row_type)) {
                sum_mat += r2(qty * r2(mat * mc))
            } else if (isMeh(item.row_type)) {
                sum_meh += r2(qty * r2(mat * mc))
            } else {
                // расценка: работы × work_coef + материалы × material_coef
                sum_pr += r2(qty * r2(lab * wc)) + r2(qty * r2(mat * mc))
            }
        })

        const itogo = r2(sum_pr + sum_mat + sum_meh)
        const defect = this.calculateDefectovka(items)

        return {
            sum_pr: r2(sum_pr),
            sum_mat: r2(sum_mat),
            sum_meh: r2(sum_meh),
            itogo,
            margin_abs: r2(itogo - defect.total),
            margin_percent: defect.total > 0 ? r2((itogo - defect.total) / defect.total * 100) : 0
        }
    }

    /**
     * Полный расчёт с детализацией по каждой позиции
     * Возвращает sum_fact и sum_smeta для каждой строки + итоги по смете
     */
    calculateFull(items: EstimateItem[], overheadPercent = 0, profitPercent = 0, vatPercent = 0): {
        items: Array<EstimateItem & { sum_fact: number; sum_smeta: number }>;
        totals: {
            fact_total: number;
            sum_pr: number;
            sum_mat: number;
            sum_meh: number;
            itogo_po_razdelam: number;
            overhead_amount: number;
            profit_amount: number;
            total_cost: number;
            vat_cost: number;
            total_with_vat: number;
        }
    } {
        const mc = this.coefficients.material_coef
        const wc = this.coefficients.work_coef
        let sum_pr = 0, sum_mat = 0, sum_meh = 0, fact_total = 0

        const calculatedItems = items.map(item => {
            if (isNonCalc(item.row_type)) return { ...item, sum_fact: 0, sum_smeta: 0 }

            const qty = item.quantity || 0
            const mat = item.material_price || 0
            const lab = item.labor_price || 0

            // Формулы точно как в ZaruAI Смета:
            // I = ROUND(E * H, 2)         — сметная цена
            // J = ROUND(I * ROUND(D,2), 2) — итого по строке
            const qty_r = r2(qty)  // ROUND(D,2)
            const sum_fact = r2((mat + lab) * qty)
            let sum_smeta = 0

            if (isMat(item.row_type)) {
                sum_smeta = r2(r2(mat * mc) * qty_r)
                sum_mat += sum_smeta
            } else if (isMeh(item.row_type)) {
                sum_smeta = r2(r2(mat * mc) * qty_r)
                sum_meh += sum_smeta
            } else {
                sum_smeta = r2(r2(lab * wc) * qty_r) + r2(r2(mat * mc) * qty_r)
                sum_pr += sum_smeta
            }
            fact_total += sum_fact

            return { ...item, sum_fact, sum_smeta }
        })

        const itogo_po_razdelam = r2(sum_pr + sum_mat + sum_meh)
        const overhead_amount   = r2(itogo_po_razdelam * overheadPercent / 100)
        const profit_amount     = r2((itogo_po_razdelam + overhead_amount) * profitPercent / 100)
        const total_cost        = r2(itogo_po_razdelam + overhead_amount + profit_amount)
        const vat_cost          = r2(total_cost * vatPercent / 100)
        const total_with_vat    = r2(total_cost + vat_cost)

        return {
            items: calculatedItems,
            totals: {
                fact_total: r2(fact_total),
                sum_pr: r2(sum_pr),
                sum_mat: r2(sum_mat),
                sum_meh: r2(sum_meh),
                itogo_po_razdelam,
                overhead_amount,
                profit_amount,
                total_cost,
                vat_cost,
                total_with_vat
            }
        }
    }

    /**
     * Сравнительный расчёт для сценариев маржи
     */
    calculateScenario(items: EstimateItem[], scenario: Partial<Coefficients>): ScenarioResult {
        const originalCoef = { ...this.coefficients }

        this.setCoefficients({
            work_coef: scenario.work_coef ?? originalCoef.work_coef,
            material_coef: scenario.material_coef ?? originalCoef.material_coef
        })

        const result = this.calculateSmeta(items)
        const defect = this.calculateDefectovka(items)

        this.coefficients = originalCoef

        return {
            scenario_id: 0,
            scenario_name: 'Пользовательский',
            total_fact: defect.total,
            total_smeta: result.itogo,
            margin_abs: result.margin_abs,
            margin_percent: result.margin_percent
        }
    }
}

// =========================================
// ПРЕДУСТАНОВЛЕННЫЕ СЦЕНАРИИ
// =========================================

export const PRESET_SCENARIOS = {
    economy: {
        name: 'Эконом',
        description: 'Минимальная цена для заказчика',
        work_coef: 1.5,
        material_coef: 1.02
    },
    standard: {
        name: 'Стандарт',
        description: 'Баланс цена/качество',
        work_coef: 1.8,
        material_coef: 1.04
    },
    premium: {
        name: 'Премиум',
        description: 'Максимальная маржа',
        work_coef: 2.2,
        material_coef: 1.1
    }
}

// =========================================
// УТИЛИТЫ
// =========================================

export function formatCurrency(value: number): string {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: 2
    }).format(value)
}

export function formatPercent(value: number): string {
    return new Intl.NumberFormat('ru-RU', {
        style: 'percent',
        minimumFractionDigits: 1
    }).format(value / 100)
}

// Экспорт по умолчанию
export default EstimateEngine
