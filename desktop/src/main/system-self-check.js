function createMinimalSelfCheckContext({ now = () => new Date().toISOString() } = {}) {
  const timestamp = now();

  return {
    estimate: {
      id: 'self-check-estimate',
      number: 'SELF-CHECK-001',
      name: 'Self-check estimate',
      client_name: 'Self-check client',
      subtotal: 100,
      total_cost: 100,
      total_labor: 100,
      total_materials: 0,
      vat_percent: 20,
      vat_cost: 20,
      total_with_vat: 120,
      created_at: timestamp,
      updated_at: timestamp,
    },
    project: {
      id: 'self-check-project',
      name: 'Self-check project',
      client_name: 'Self-check client',
    },
    rows: [
      {
        id: 'row-1',
        name: 'Тестовая работа',
        unit: 'шт',
        quantity: 1,
        labor_total: 100,
        material_total: 0,
        total: 100,
        row_type: 'work',
        section_id: 'section-1',
        code: 'TEST-001',
      },
    ],
    items: [
      {
        id: 'row-1',
        name: 'Тестовая работа',
        unit: 'шт',
        quantity: 1,
        labor_total: 100,
        material_total: 0,
        total: 100,
      },
    ],
    sections: [
      { id: 'section-1', name: 'Самопроверка' },
    ],
    execution: {
      completedWorks: [
        {
          id: 'row-1',
          name: 'Тестовая работа',
          code: 'TEST-001',
          unit: 'шт',
          quantity: 1,
          total: 120,
        },
      ],
    },
    labor: {
      costs: [
        {
          item_id: 'row-1',
          name: 'Тестовая работа',
          unit: 'ч',
          quantity: 8,
          amount: 100,
        },
      ],
      summary: {
        totalAmount: 100,
        totalHours: 8,
      },
    },
    materials: {
      items: [
        {
          name: 'Тестовый материал',
          unit: 'шт',
          totalQty: 0,
          price: 0,
          total: 0,
        },
      ],
      summary: {
        totalAmount: 0,
        totalItems: 1,
      },
    },
    settings: {
      estimates: {
        vatEnabled: true,
        vatRate: 20,
      },
    },
    companyInfo: {
      name: 'SmetaAI',
    },
    meta: {
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };
}

function runSystemSelfCheck({
  generateDocument,
  logger,
  createContext = createMinimalSelfCheckContext,
  now = () => new Date().toISOString(),
} = {}) {
  const issues = [];

  try {
    const context = createContext({ now });
    const estimate = generateDocument({ type: 'estimate', context });
    const ks2 = generateDocument({ type: 'ks2', context });
    const ks3 = generateDocument({ type: 'ks3', context });
    const fot = generateDocument({ type: 'fot', context });
    const materials = generateDocument({ type: 'materials_request', context });

    if (estimate?.totals?.grandTotal !== ks3?.totals?.estimateTotal) {
      const type = 'SELF_CHECK_TOTAL_MISMATCH';
      issues.push(type);
      logger?.logError?.(type, {
        estimateTotal: estimate?.totals?.grandTotal ?? null,
        ks3EstimateTotal: ks3?.totals?.estimateTotal ?? null,
      });
    }

    if (ks2?.totals?.totalWithVat !== ks3?.totals?.payable) {
      const type = 'SELF_CHECK_PAYMENT_MISMATCH';
      issues.push(type);
      logger?.logError?.(type, {
        ks2TotalWithVat: ks2?.totals?.totalWithVat ?? null,
        ks3Payable: ks3?.totals?.payable ?? null,
      });
    }

    if (!Number.isFinite(Number(fot?.totals?.totalAmount)) || Number(fot?.totals?.totalAmount) <= 0) {
      const type = 'SELF_CHECK_FOT_INVALID';
      issues.push(type);
      logger?.logError?.(type, {
        fotTotalAmount: fot?.totals?.totalAmount ?? null,
      });
    }

    if (!Array.isArray(materials?.rows)) {
      const type = 'SELF_CHECK_MATERIALS_INVALID';
      issues.push(type);
      logger?.logError?.(type, {
        rowsType: typeof materials?.rows,
      });
    }

    if (issues.length === 0) {
      logger?.logInfo?.('SELF_CHECK_OK', {
        checkedAt: now(),
        documents: ['estimate', 'ks2', 'ks3', 'fot', 'materials_request'],
      });
    }

    return {
      ok: issues.length === 0,
      issues,
    };
  } catch (error) {
    logger?.logError?.('SELF_CHECK_CRASH', error);
    return {
      ok: false,
      issues: ['SELF_CHECK_CRASH'],
    };
  }
}

module.exports = {
  createMinimalSelfCheckContext,
  runSystemSelfCheck,
};
