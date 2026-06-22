const toNumber = (value, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

const groupDefektovkaItems = (items = [], sections = []) => {
  const normalizedItems = items.map((item) => ({
    ...item,
    section_id: item?.section_id ? Number(item.section_id) : 0,
    quantity: toNumber(item?.quantity, 1),
    labor_price: toNumber(item?.labor_price),
    material_price: toNumber(item?.material_price)
  }))

  const sectionMap = new Map()
  ;(sections || []).forEach((section) => {
    sectionMap.set(section.id, section)
  })

  const unassignedItems = normalizedItems.filter((item) => !item.section_id)
  const assignedItems = normalizedItems.filter((item) => item.section_id)
  const usedSectionIds = [...new Set(assignedItems.map((item) => item.section_id))]

  return {
    sectionMap,
    unassignedItems,
    assignedItems,
    usedSectionIds,
    normalizedItems
  }
}

module.exports = {
  groupDefektovkaItems
}
