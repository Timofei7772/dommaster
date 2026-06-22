const toNumber = (value, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

const normalizeEstimateItems = (items = []) => {
  return items.map((item) => ({
    ...item,
    section_id: item?.section_id ? Number(item.section_id) : 0,
    quantity: toNumber(item?.quantity),
    labor_price: toNumber(item?.labor_price ?? item?.price),
    material_price: toNumber(item?.material_price)
  }))
}

const groupEstimateItemsBySection = (items = []) => {
  const sectionMap = new Map()
  const sectionOrder = []
  const noSectionItems = []

  items.forEach((item) => {
    const sid = item?.section_id ? Number(item.section_id) : 0
    if (!sid) {
      noSectionItems.push(item)
      return
    }

    if (!sectionMap.has(sid)) {
      sectionMap.set(sid, [])
      sectionOrder.push(sid)
    }
    sectionMap.get(sid).push(item)
  })

  if (noSectionItems.length > 0) {
    sectionOrder.unshift(0)
    sectionMap.set(0, noSectionItems)
  }

  return {
    sectionMap,
    sectionOrder,
    noSectionItems
  }
}

module.exports = {
  normalizeEstimateItems,
  groupEstimateItemsBySection
}
