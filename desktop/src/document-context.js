const { getDocumentTypes, getAdditionalAgreementTypes } = require('./document-kernel')
const { resolveWritableFolderPath } = require('./output-paths')

const parseCompany = (settings) => {
  const raw = settings?.company
  if (!raw) return {}
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return {} }
  }
  return raw
}

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

const isWorkRow = (rowType) => !rowType || rowType === 'rascenka' || rowType === 'work' || rowType === 'pr'
const isMaterialRow = (rowType) => rowType === 'material' || rowType === 'mat'

const normalizeRow = (item) => {
  const quantity = toNumber(item?.quantity)
  const materialPrice = toNumber(item?.material_price ?? item?.materials_cost)
  const laborPrice = toNumber(item?.labor_price ?? item?.labor_cost)

  return {
    id: item?.id,
    name: item?.name || '',
    unit: item?.unit || 'шт',
    row_type: item?.row_type || 'rascenka',
    quantity,
    material_price: materialPrice,
    labor_price: laborPrice,
    material_total: toNumber(item?.materials_total, materialPrice * quantity),
    labor_total: toNumber(item?.labor_total, laborPrice * quantity),
    total: toNumber(item?.total ?? item?.sum_smeta, (materialPrice + laborPrice) * quantity),
    section_id: item?.section_id || null,
    code: item?.code || item?.justification || '',
  }
}

const aggregateMaterialsFromEstimate = (db, normalizedRows) => {
  const aggregated = new Map()

  const appendMaterial = (material) => {
    const name = String(material?.name || '').trim()
    if (!name) return

    const unit = material?.unit || 'шт'
    const price = toNumber(material?.price ?? material?.material_price)
    const quantity = toNumber(material?.quantity ?? material?.totalQty)
    const key = `${name}::${unit}::${price}`

    const current = aggregated.get(key) || {
      name,
      unit,
      price,
      totalQty: 0,
      total: 0,
    }

    current.totalQty += quantity
    current.total += quantity * price
    aggregated.set(key, current)
  }

  if (typeof db?.getEstimateItemMaterials === 'function') {
    normalizedRows.forEach((row) => {
      const estimateItemMaterials = db.getEstimateItemMaterials(row.id) || []
      estimateItemMaterials.forEach((material) => {
        appendMaterial({
          name: material.name,
          unit: material.unit,
          price: material.price,
          quantity: toNumber(material.quantity) * toNumber(row.quantity, 1),
        })
      })
    })
  }

  if (!aggregated.size) {
    normalizedRows
      .filter((item) => isMaterialRow(item.row_type))
      .forEach((item) => {
        appendMaterial({
          name: item.name,
          unit: item.unit,
          price: item.material_price,
          quantity: item.quantity,
        })
      })
  }

  return [...aggregated.values()].map((item) => ({
    ...item,
    totalQty: toNumber(item.totalQty),
    total: toNumber(item.total),
  }))
}

const getEstimateContext = (db, estimateId, options = {}) => {
  const estimate = db.getEstimate(estimateId)
  if (!estimate) throw new Error('Смета не найдена')

  const project = estimate.project_id ? db.getProject(estimate.project_id) : null
  const items = db.getEstimateItems(estimateId) || []
  const sections = db.getEstimateSections(estimateId) || []
  const coefficients = db.getCoefficients(estimateId) || { work_coef: 1.8, material_coef: 1.04 }
  const settings = db.getAllSettings ? db.getAllSettings() : {}
  const companyInfo = parseCompany(settings)
  const dataPath = db.getDataPath ? db.getDataPath() : ''
  const folderPath = resolveWritableFolderPath(project?.folder_path, dataPath)
  const contract = options.contractId && db.getContract ? (db.getContract(options.contractId) || null) : null

  const normalizedRows = items.map(normalizeRow)
  const completedWorks = normalizedRows.filter((item) => isWorkRow(item.row_type))
  const materialItems = normalizedRows.filter((item) => isMaterialRow(item.row_type))
  const aggregatedMaterials = aggregateMaterialsFromEstimate(db, normalizedRows)

  const nowIso = new Date().toISOString()
  const laborTotal = completedWorks.reduce((sum, item) => sum + toNumber(item.labor_total), 0)
  const materialsTotal = aggregatedMaterials.reduce((sum, item) => sum + toNumber(item.total), 0)

  return {
    estimate,
    project,
    contract,
    items,
    rows: normalizedRows,
    sections,
    coefficients,
    settings,
    companyInfo,
    folderPath,
    dataPath,
    execution: {
      completedWorks,
      periods: [],
    },
    labor: {
      norms: [],
      costs: completedWorks.map((item) => ({
        item_id: item.id,
        name: item.name,
        unit: item.unit,
        quantity: item.quantity,
        amount: item.labor_total,
      })),
      summary: {
        totalHours: 0,
        totalAmount: laborTotal,
      },
    },
    materials: {
      items: aggregatedMaterials,
      sourceItems: materialItems,
      suppliers: [],
      summary: {
        totalAmount: materialsTotal,
        totalItems: aggregatedMaterials.length,
      },
    },
    meta: {
      version: 1,
      createdAt: nowIso,
      updatedAt: estimate.updated_at || estimate.created_at || nowIso,
      templateVersion: 'documents-core-v1',
    },
    documentTypes: getDocumentTypes(),
    additionalAgreementTypes: getAdditionalAgreementTypes(),
  }
}

module.exports = {
  parseCompany,
  normalizeRow,
  getEstimateContext
}
