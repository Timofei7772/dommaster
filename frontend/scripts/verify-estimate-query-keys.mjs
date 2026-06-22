import { readFileSync } from 'node:fs'

const detail = readFileSync('C:/Projects/SmetaAI/frontend/src/pages/EstimateDetail.tsx', 'utf8')
const modal = readFileSync('C:/Projects/SmetaAI/frontend/src/components/EditItemModal.tsx', 'utf8')

const failures = []

if (!detail.includes('estimateItemsQueryKey') || !detail.includes('estimateQueryKey')) {
  failures.push('EstimateDetail.tsx does not use shared estimate query key helpers.')
}

if (!modal.includes('estimateItemsQueryKey') || !modal.includes('estimateQueryKey')) {
  failures.push('EditItemModal.tsx does not use shared estimate query key helpers.')
}

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log('estimate query key usage looks consistent')
