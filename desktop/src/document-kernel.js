const DocumentType = Object.freeze({
  ESTIMATE: 'estimate',
  CONTRACT: 'contract',
  ADDITIONAL_AGREEMENT: 'additional_agreement',
  KS2: 'ks2',
  KS3: 'ks3',
  FOT: 'fot',
  M29: 'm29',
  COMMERCIAL_OFFER: 'commercial_offer',
  MATERIALS_REQUEST: 'materials_request',
  PACKAGE: 'package',
});

const AdditionalAgreementType = Object.freeze({
  ADDITIONAL: 'additional',
  INDEPENDENT: 'independent',
  REPLACEMENT: 'replacement',
});

const { computeCommercialTotals } = require('./commercial-offer');

const getDocumentTypes = () => Object.values(DocumentType);
const getAdditionalAgreementTypes = () => Object.values(AdditionalAgreementType);

const buildDocumentContext = (db, estimateId, options = {}) => {
  const { getEstimateContext } = require('./document-context');
  return getEstimateContext(db, estimateId, options);
};

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const round2 = (value) => Math.round(toNumber(value) * 100) / 100;

const clone = (value) => JSON.parse(JSON.stringify(value));

function describeAgreementDelta(deltaAmount) {
  if (deltaAmount > 0) {
    return {
      deltaDirection: 'increase',
      deltaAbsAmount: round2(deltaAmount),
    };
  }

  if (deltaAmount < 0) {
    return {
      deltaDirection: 'decrease',
      deltaAbsAmount: round2(Math.abs(deltaAmount)),
    };
  }

  return {
    deltaDirection: 'no_change',
    deltaAbsAmount: 0,
  };
}

function validateDocumentType(type) {
  if (!getDocumentTypes().includes(type)) {
    throw new Error(`Unsupported document type: ${type}`);
  }
}

function validateAgreementType(type) {
  if (!getAdditionalAgreementTypes().includes(type)) {
    throw new Error(`Unsupported additional agreement type: ${type}`);
  }
}

function deriveTotals(context) {
  const estimate = context?.estimate || {};
  const laborTotal = round2(
    estimate.total_labor
    ?? context?.labor?.summary?.totalAmount
    ?? 0
  );
  const materialTotal = round2(
    estimate.total_materials
    ?? context?.materials?.summary?.totalAmount
    ?? 0
  );
  const subtotal = round2(
    estimate.subtotal
    ?? estimate.total_cost
    ?? (laborTotal + materialTotal)
  );
  const vatRate = toNumber(
    context?.settings?.estimates?.vatEnabled === false
      ? 0
      : (estimate.vat_percent ?? context?.settings?.estimates?.vatRate ?? 20)
  );
  const vatAmount = round2(
    estimate.vat_cost
    ?? (vatRate > 0 ? subtotal * vatRate / 100 : 0)
  );
  const grandTotal = round2(
    estimate.total_with_vat
    ?? estimate.total_cost
    ?? (subtotal + vatAmount)
  );

  return {
    laborTotal,
    materialTotal,
    subtotal,
    vatRate,
    vatAmount,
    grandTotal,
  };
}

function buildEstimateDocument(context) {
  const totals = deriveTotals(context);
  const rows = (context?.rows || []).map((row, index) => ({
    index: index + 1,
    id: row.id,
    name: row.name,
    unit: row.unit,
    quantity: row.quantity,
    laborTotal: round2(row.labor_total),
    materialTotal: round2(row.material_total),
    total: round2(row.total),
    rowType: row.row_type,
    sectionId: row.section_id,
    code: row.code,
  }));

  return {
    type: DocumentType.ESTIMATE,
    title: 'Смета',
    meta: {
      estimateId: context?.estimate?.id ?? null,
      estimateNumber: context?.estimate?.number || '',
      projectId: context?.project?.id ?? null,
      projectName: context?.project?.name || '',
      createdAt: context?.estimate?.created_at || context?.meta?.createdAt || '',
      updatedAt: context?.meta?.updatedAt || '',
    },
    templateHints: {
      renderer: 'estimate-html-pdf',
    },
    sections: clone(context?.sections || []),
    rows,
    totals,
  };
}

function buildContractDocument(context) {
  const totals = deriveTotals(context);
  const contract = context?.contract || {};
  const amount = round2(contract.amount ?? totals.grandTotal);

  return {
    type: DocumentType.CONTRACT,
    title: 'Договор',
    meta: {
      contractId: contract.id ?? null,
      contractNumber: contract.number || '',
      clientType: contract.client_type || 'individual',
      date: contract.date || context?.meta?.createdAt || '',
    },
    templateHints: {
      templateId: (contract.client_type === 'company') ? 'contract-company' : 'contract-individual',
    },
    parties: {
      customerName: contract.client || contract.client_name || context?.project?.client_name || context?.estimate?.client_name || '',
      contractorName: context?.companyInfo?.name || '',
    },
    subject: contract.subject || context?.project?.name || context?.estimate?.name || 'Выполнение строительно-монтажных работ',
    totals: {
      ...totals,
      grandTotal: amount,
      contractAmount: amount,
    },
  };
}

function buildKs2Document(context) {
  const totals = deriveTotals(context);
  const rows = (context?.execution?.completedWorks || []).map((row, index) => ({
    index: index + 1,
    id: row.id,
    name: row.name,
    code: row.code || '',
    unit: row.unit,
    quantity: row.quantity,
    price: round2(toNumber(row.quantity) ? toNumber(row.total) / toNumber(row.quantity) : row.total),
    total: round2(row.total),
  }));

  return {
    type: DocumentType.KS2,
    title: 'Акт КС-2',
    meta: {
      estimateId: context?.estimate?.id ?? null,
      estimateNumber: context?.estimate?.number || '',
      projectId: context?.project?.id ?? null,
    },
    rows,
    totals: {
      ...totals,
      totalWithoutVat: totals.subtotal,
      totalVat: totals.vatAmount,
      totalWithVat: totals.grandTotal,
      currentPeriodTotal: totals.grandTotal,
    },
  };
}

function buildKs3Document(context) {
  const totals = deriveTotals(context);

  return {
    type: DocumentType.KS3,
    title: 'Справка КС-3',
    meta: {
      estimateId: context?.estimate?.id ?? null,
      estimateNumber: context?.estimate?.number || '',
      projectId: context?.project?.id ?? null,
    },
    totals: {
      ...totals,
      estimateTotal: totals.grandTotal,
      previousTotal: 0,
      currentPeriodTotal: totals.grandTotal,
      totalWithoutVat: totals.subtotal,
      totalVat: totals.vatAmount,
      totalWithVat: totals.grandTotal,
      payable: totals.grandTotal,
    },
  };
}

function buildCommercialOfferDocument(context) {
  const commercialTotals = computeCommercialTotals(context?.estimate || {}, context?.items || []);

  return {
    type: DocumentType.COMMERCIAL_OFFER,
    title: 'Коммерческое предложение',
    meta: {
      estimateId: context?.estimate?.id ?? null,
      estimateNumber: context?.estimate?.number || '',
      projectId: context?.project?.id ?? null,
      customerName: context?.estimate?.client_name || context?.project?.client_name || '',
    },
    rows: clone(context?.items || []),
    totals: {
      laborTotal: round2(commercialTotals.laborTotal),
      materialTotal: round2(commercialTotals.materialTotal),
      overheadAmount: round2(commercialTotals.overheadAmount),
      profitAmount: round2(commercialTotals.profitAmount),
      vatAmount: round2(commercialTotals.vatAmount),
      grandTotal: round2(commercialTotals.grandTotal),
    },
  };
}

function buildAdditionalAgreementDocument(context, options = {}) {
  const agreementType = options.agreementType || AdditionalAgreementType.ADDITIONAL;
  validateAgreementType(agreementType);

  const agreementData = options.agreementData || {};
  const baseTotals = deriveTotals(context);
  const contractAmount = round2(context?.contract?.amount ?? baseTotals.grandTotal);
  const estimateGrandTotal = round2(context?.estimate?.total_with_vat ?? baseTotals.grandTotal);
  const hasExplicitAmount = agreementData.amount !== undefined && agreementData.amount !== null;
  const deltaAmount = hasExplicitAmount
    ? round2(agreementData.amount)
    : round2(estimateGrandTotal - contractAmount);
  const deltaMeta = describeAgreementDelta(deltaAmount);

  return {
    type: DocumentType.ADDITIONAL_AGREEMENT,
    title: 'Дополнительное соглашение',
    meta: {
      agreementType,
      agreementNumber: agreementData.number || '',
      contractNumber: context?.contract?.number || '',
      date: agreementData.date || context?.meta?.createdAt || '',
      deltaDirection: deltaMeta.deltaDirection,
    },
    templateHints: {
      templateId: `${agreementType}-${context?.contract?.client_type === 'company' ? 'company' : 'individual'}`,
    },
    subject: agreementData.subject || 'Выполнение дополнительных работ',
    totals: {
      ...baseTotals,
      deltaAmount,
      deltaAbsAmount: deltaMeta.deltaAbsAmount,
      contractAmount,
      resultingContractTotal: round2(contractAmount + deltaAmount),
    },
  };
}

function buildFotDocument(context) {
  const totals = deriveTotals(context);
  const rows = (context?.labor?.costs || []).map((row) => {
    const hours = round2(row.quantity ?? 0);
    const total = round2(row.amount ?? 0);
    const rate = hours > 0 ? round2(total / hours) : total;
    return {
      item_id: row.item_id,
      name: row.name,
      unit: row.unit,
      hours,
      rate,
      total,
    };
  });

  return {
    type: DocumentType.FOT,
    title: 'ФОТ',
    meta: {
      estimateId: context?.estimate?.id ?? null,
      estimateNumber: context?.estimate?.number || '',
    },
    rows,
    totals: {
      totalAmount: round2(context?.labor?.summary?.totalAmount ?? totals.laborTotal),
      totalHours: round2(context?.labor?.summary?.totalHours ?? 0),
    },
  };
}

function buildMaterialsRequestDocument(context) {
  const rows = (context?.materials?.items || []).map((row, index) => ({
    index: index + 1,
    name: row.name,
    unit: row.unit,
    totalQty: round2(row.totalQty ?? row.quantity ?? 0),
    price: round2(row.price ?? 0),
    total: round2(row.total ?? ((row.totalQty ?? row.quantity ?? 0) * (row.price ?? 0))),
  }));

  return {
    type: DocumentType.MATERIALS_REQUEST,
    title: 'Заявка на материалы',
    meta: {
      estimateId: context?.estimate?.id ?? null,
      estimateNumber: context?.estimate?.number || '',
    },
    rows,
    totals: {
      totalAmount: round2(context?.materials?.summary?.totalAmount ?? 0),
      totalItems: Number(context?.materials?.summary?.totalItems ?? rows.length),
    },
  };
}

function buildPackageDocument(context) {
  const estimate = buildEstimateDocument(context);
  const contract = buildContractDocument(context);
  const ks2 = buildKs2Document(context);
  const ks3 = buildKs3Document(context);

  return {
    type: DocumentType.PACKAGE,
    title: 'Пакет документов',
    meta: {
      estimateId: context?.estimate?.id ?? null,
      estimateNumber: context?.estimate?.number || '',
    },
    documents: [estimate, contract, ks2, ks3],
    totals: {
      grandTotal: estimate.totals.grandTotal,
    },
  };
}

function generateDocument({ type, context, options = {} }) {
  validateDocumentType(type);
  if (!context) {
    throw new Error('Document context is required');
  }

  switch (type) {
    case DocumentType.ESTIMATE:
      return buildEstimateDocument(context);
    case DocumentType.CONTRACT:
      return buildContractDocument(context);
    case DocumentType.ADDITIONAL_AGREEMENT:
      return buildAdditionalAgreementDocument(context, options);
    case DocumentType.KS2:
      return buildKs2Document(context);
    case DocumentType.KS3:
      return buildKs3Document(context);
    case DocumentType.FOT:
      return buildFotDocument(context);
    case DocumentType.MATERIALS_REQUEST:
      return buildMaterialsRequestDocument(context);
    case DocumentType.COMMERCIAL_OFFER:
      return buildCommercialOfferDocument(context);
    case DocumentType.PACKAGE:
      return buildPackageDocument(context);
    case DocumentType.M29:
      return {
        type: DocumentType.M29,
        title: 'М-29',
        meta: {
          estimateId: context?.estimate?.id ?? null,
          estimateNumber: context?.estimate?.number || '',
        },
        rows: clone(context?.materials?.items || []),
        totals: {
          totalAmount: round2(context?.materials?.summary?.totalAmount ?? 0),
        },
      };
    default:
      throw new Error(`Unsupported document type: ${type}`);
  }
}

module.exports = {
  DocumentType,
  AdditionalAgreementType,
  getDocumentTypes,
  getAdditionalAgreementTypes,
  buildDocumentContext,
  generateDocument,
};
