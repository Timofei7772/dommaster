import test from 'node:test'
import assert from 'node:assert/strict'

import {
  AGREEMENT_DISABLED_MESSAGE,
  agreementActions,
  buildAgreementGenerationData,
  findLinkedContractForEstimate,
  getAgreementAvailability,
} from './document-agreements.ts'

test('findLinkedContractForEstimate returns only the main contract for the selected estimate', () => {
  const contract = findLinkedContractForEstimate(
    [
      { id: 10, estimate_id: 3, contract_type: 'agreement', parent_contract_id: 7, number: 'ДС-01' },
      { id: 11, estimate_id: 3, contract_type: 'contract', number: 'Д-003' },
      { id: 12, estimate_id: 4, contract_type: 'contract', number: 'Д-004' },
    ],
    3
  )

  assert.equal(contract?.id, 11)
  assert.equal(contract?.number, 'Д-003')
})

test('getAgreementAvailability explains why agreements are blocked without a contract', () => {
  const availability = getAgreementAvailability(null)

  assert.equal(availability.disabled, true)
  assert.equal(availability.reason, AGREEMENT_DISABLED_MESSAGE)
})

test('buildAgreementGenerationData derives stable default subjects by agreement type', () => {
  assert.deepEqual(buildAgreementGenerationData('additional', '2026-04-03'), {
    date: '2026-04-03',
    subject: 'Выполнение дополнительных работ',
  })

  assert.deepEqual(buildAgreementGenerationData('independent', '2026-04-03'), {
    date: '2026-04-03',
    subject: 'Выполнение отдельных работ',
  })

  assert.deepEqual(buildAgreementGenerationData('replacement', '2026-04-03'), {
    date: '2026-04-03',
    subject: 'Замена состава работ',
  })
})

test('agreementActions expose the three supported agreement buttons', () => {
  assert.deepEqual(
    agreementActions.map((action) => action.type),
    ['additional', 'independent', 'replacement']
  )
})
