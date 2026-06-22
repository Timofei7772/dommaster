const toNumber = (value, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

const normalizeRow = (item) => {
  const quantity = toNumber(item.quantity)
  const materialPrice = toNumber(item.material_price ?? item.materials_cost)
  const laborPrice = toNumber(item.labor_price ?? item.labor_cost)

  return {
    id: item.id,
    section_id: item.section_id || null,
    row_type: item.row_type || 'rascenka',
    code: item.code || item.justification || '',
    name: item.name || '',
    unit: item.unit || 'шт',
    quantity,
    material_price: materialPrice,
    labor_price: laborPrice,
    material_total: toNumber(item.materials_total, materialPrice * quantity),
    labor_total: toNumber(item.labor_total, laborPrice * quantity),
    total: toNumber(item.total, (materialPrice + laborPrice) * quantity)
  }
}

const buildEstimateSnapshot = (context, options = {}) => {
  const generatedAt = options.generatedAt || new Date().toISOString()
  const templateVersion = options.templateVersion || 'v1'

  return {
    schemaVersion: 1,
    generatedAt,
    templateVersion,
    estimate: {
      id: context.estimate?.id,
      number: context.estimate?.number || '',
      name: context.estimate?.name || '',
      status: context.estimate?.status || 'draft',
      totals: {
        subtotal: toNumber(context.estimate?.subtotal),
        total_materials: toNumber(context.estimate?.total_materials),
        total_works: toNumber(context.estimate?.total_works),
        total_overhead: toNumber(context.estimate?.total_overhead),
        total_profit: toNumber(context.estimate?.total_profit),
        total_without_vat: toNumber(context.estimate?.total_without_vat),
        total_vat: toNumber(context.estimate?.total_vat),
        total_with_vat: toNumber(context.estimate?.total_with_vat)
      }
    },
    project: context.project || null,
    company: context.companyInfo || {},
    coefficients: context.coefficients || { work_coef: 1.8, material_coef: 1.04 },
    sections: (context.sections || []).map((section) => ({
      id: section.id,
      name: section.name,
      sort_order: section.sort_order ?? 0
    })),
    rows: (context.items || []).map(normalizeRow)
  }
}

module.exports = {
  normalizeRow,
  buildEstimateSnapshot
}
