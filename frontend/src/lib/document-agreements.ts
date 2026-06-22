import {
  AdditionalAgreementType,
  type AdditionalAgreementTypeType,
  type Contract,
} from './electron.ts'

type LinkedContract = Pick<Contract, 'id' | 'number' | 'contract_type' | 'parent_contract_id'> & {
  estimate_id?: number | null
}

export const AGREEMENT_DISABLED_MESSAGE = 'Сначала сформируйте договор'

export const agreementActions: Array<{
  type: AdditionalAgreementTypeType
  label: string
}> = [
  { type: AdditionalAgreementType.ADDITIONAL, label: 'Доп. к смете' },
  { type: AdditionalAgreementType.INDEPENDENT, label: 'Отдельное' },
  { type: AdditionalAgreementType.REPLACEMENT, label: 'Замена' },
]

export function findLinkedContractForEstimate(
  contracts: LinkedContract[],
  estimateId: number | null
): LinkedContract | null {
  if (!estimateId) {
    return null
  }

  return (
    contracts.find(
      (contract) =>
        contract.estimate_id === estimateId &&
        contract.contract_type === 'contract' &&
        !contract.parent_contract_id
    ) || null
  )
}

export function getAgreementAvailability(contract: LinkedContract | null) {
  return {
    disabled: !contract,
    reason: contract ? '' : AGREEMENT_DISABLED_MESSAGE,
  }
}

export function buildAgreementGenerationData(
  agreementType: AdditionalAgreementTypeType,
  docDate: string
) {
  return {
    date: docDate,
    subject: getAgreementSubject(agreementType),
  }
}

function getAgreementSubject(agreementType: AdditionalAgreementTypeType) {
  switch (agreementType) {
    case AdditionalAgreementType.INDEPENDENT:
      return 'Выполнение отдельных работ'
    case AdditionalAgreementType.REPLACEMENT:
      return 'Замена состава работ'
    case AdditionalAgreementType.ADDITIONAL:
    default:
      return 'Выполнение дополнительных работ'
  }
}
