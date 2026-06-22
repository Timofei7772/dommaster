export const normalizeEstimateId = (estimateId: string | number | null | undefined): string => {
  if (estimateId === null || estimateId === undefined) return ''
  return String(estimateId)
}

export const estimateQueryKey = (estimateId: string | number | null | undefined) => [
  'estimate',
  normalizeEstimateId(estimateId),
] as const

export const estimateItemsQueryKey = (estimateId: string | number | null | undefined) => [
  'estimate-items',
  normalizeEstimateId(estimateId),
] as const

export const estimateSectionsQueryKey = (estimateId: string | number | null | undefined) => [
  'estimate-sections',
  normalizeEstimateId(estimateId),
] as const
