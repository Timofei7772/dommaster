const { buildWorksList } = require('./commercial-offer');
const { generateDocument } = require('./document-kernel');

function formatAmountDefault(amount) {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
}

function formatShortNameDefault(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 3) {
    return `${parts[0]} ${parts[1][0]}.${parts[2][0]}.`;
  }
  if (parts.length === 2) {
    return `${parts[0]} ${parts[1][0]}.`;
  }
  return String(fullName || '');
}

function formatDateDefault(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toISOString().slice(0, 10);
  } catch {
    return String(dateStr);
  }
}

function numberToWordsDefault(value) {
  return formatAmountDefault(value);
}

function resolveHelpers(helpers = {}) {
  const templates = helpers.templates || {};
  return {
    formatAmount: helpers.formatAmount || formatAmountDefault,
    formatShortName: helpers.formatShortName || formatShortNameDefault,
    templates: {
      formatDateForDoc: templates.formatDateForDoc || formatDateDefault,
      numberToWords: templates.numberToWords || numberToWordsDefault,
    },
    now: helpers.now || new Date(),
  };
}

function buildContractTemplateData({ context, document, helpers }) {
  const { formatAmount, formatShortName, templates } = helpers;
  const contract = context?.contract || {};
  const project = context?.project || {};
  const estimate = context?.estimate || {};
  const company = context?.companyInfo || {};
  const settings = context?.settings || {};

  const amount = Number(document?.totals?.contractAmount ?? document?.totals?.grandTotal ?? 0);
  const vatRate = Number(document?.totals?.vatRate ?? settings?.estimates?.vatRate ?? 20);
  const vatEnabled = settings?.estimates?.vatEnabled !== false && vatRate > 0;
  const vatAmount = Number(document?.totals?.vatAmount ?? 0);
  const vatInfo = vatEnabled
    ? `В том числе НДС ${vatRate}%: ${formatAmount(vatAmount)} руб.`
    : 'НДС не облагается';

  const clientName = contract.client || contract.client_name || project.client_name || estimate.client_name || '';
  const clientAddress = contract.client_address || project.address || estimate.address || '';

  return {
    'номер договора': contract.number || '',
    'Дата договора': templates.formatDateForDoc(contract.date || document?.meta?.date || context?.meta?.createdAt || new Date().toISOString()),
    'предмет договора': document.subject || contract.subject || project.name || estimate.name || 'Выполнение строительно-монтажных работ',
    'цена договора': formatAmount(amount),
    'цена договора прописью': templates.numberToWords(amount),
    'информация о НДС': vatInfo,
    'начало работ по договору': templates.formatDateForDoc(contract.start_date || contract.date || new Date().toISOString()),
    'окончание работ по договору': templates.formatDateForDoc(contract.end_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()),

    'Фамилия Имя Отчество': clientName,
    'Фамилия Имя Отчество заказчика': clientName,
    'Фамилия И.О.': formatShortName(clientName),
    'адрес заказчика': clientAddress,
    'телефоны заказчика': contract.client_phone || '',
    'ИНН заказчика': contract.client_inn || '',
    'серия  номер паспорта': contract.client_passport || '',
    'серия номер паспорта': contract.client_passport || '',
    'кем выдан паспорт и дата выдачи': contract.client_passport_issued || '',
    'код подразд': contract.client_passport_code || '',

    'Название подрядчика': company.name || contract.contractor || '',
    'ООО «Подрядчик»': company.name || contract.contractor || '',
    'должность, фамилия, инициалы подписывающего договор': `${company.directorPosition || 'Директора'} ${formatShortName(company.director)}`,
    'должность подписывающего, название подрядчика': `${company.directorPosition || 'Директор'}, ${company.name || ''}`,
    'Устава': company.directorBasis || 'Устава',
    'юридический адрес подрядчика': company.address || '',
    'адрес подрядчика': company.address || '',
    'телефоны подрядчика': company.phone || '',
    'ИНН подрядчика': company.inn || '',
    'КПП подрядчика': company.kpp || '',
    'ОГРН': company.ogrn || '',
    'ОГРН подрядчика': company.ogrn || '',
    'БИК банка подрядчика': company.bik || '',
    'расч. счёт подрядчика': company.checkingAccount || '',
    'корр. счёт подрядчика': company.correspondentAccount || '',
    'банк подрядчика': company.bankName || '',
    'название банка подрядчика': company.bankName || '',
    'Телефон подрядчика': company.phone || '',
    'E-mail подрядчика': company.email || '',

    'должность подрядчика': company.directorPosition || 'Директор',
    'Фамилия И.О. подрядчика': formatShortName(company.director),

    'текст первого подпункта': '',
    '12 (двенадцать) месяцев': '12 (двенадцать) месяцев',
    '12.  ПРИЛОЖЕНИЯ К ДОГОВОРУ.': '12. ПРИЛОЖЕНИЯ К ДОГОВОРУ.',
    'Приложения к договору': 'Приложение №1 - Локальная смета',

    number: contract.number || '',
    date: templates.formatDateForDoc(contract.date || document?.meta?.date || new Date().toISOString()),
    client: clientName,
    contractor: company.name || '',
    subject: document.subject || contract.subject || project.name || '',
    amount: formatAmount(amount),
    amount_words: templates.numberToWords(amount),
    project_name: project.name || '',
    project_address: project.address || '',
    client_type: contract.client_type || 'individual',
  };
}

function buildCommercialOfferTemplateData({ context, document, helpers }) {
  const { formatAmount, formatShortName, templates, now } = helpers;
  const estimate = context?.estimate || {};
  const items = context?.items || [];
  const project = context?.project || {};
  const settings = context?.settings || {};
  const company = context?.companyInfo || {};
  const customerName = estimate.client_name || project.client_name || '';
  const worksList = buildWorksList(items, formatAmount) || estimate.name || project.name || 'Строительно-монтажные работы';
  const nowIso = new Date(now).toISOString();
  const validUntil = new Date(new Date(now).getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const vatRate = Number(document?.totals?.vatRate ?? (settings?.estimates?.vatEnabled !== false ? (settings?.estimates?.vatRate || estimate.vat_percent || 20) : 0));
  const vatText = vatRate > 0 ? `Стоимость указана с учётом НДС ${vatRate}%.` : 'НДС не облагается.';

  const contractorCard = [
    company.fullName || company.name || '',
    `ИНН: ${company.inn || ''}, КПП: ${company.kpp || ''}`.trim(),
    company.address || '',
    company.ogrn ? `ОГРН: ${company.ogrn}` : '',
    [company.phone, company.email].filter(Boolean).join(', '),
  ].filter(Boolean).join('\n');

  const bankDetails = [
    company.checkingAccount ? `Р/с: ${company.checkingAccount}` : '',
    company.bankName || '',
    [company.bik ? `БИК: ${company.bik}` : '', company.correspondentAccount ? `К/с: ${company.correspondentAccount}` : '']
      .filter(Boolean)
      .join(', '),
  ].filter(Boolean).join('\n');

  const signature = `${company.directorPosition || 'Генеральный директор'} ${company.name || ''}  ____________________  /${formatShortName(company.director)}/`;

  const data = {
    'Общество с ограниченной ответственностью Строительная компания «Подрядчик»': company.fullName || company.name || '',
    '123456, г. Москва, ул. Самая длинная, д. 1, стр.2, оф.3а': company.address || '',
    '+7 (495) 123-45-67': company.phone || '',
    'info@podrjadchik.ru': company.email || '',
    'www.podrjadchik.ru': company.website || '',
    'наименование заказчика': customerName,
    'дата комм. предл': templates.formatDateForDoc(nowIso),
    'Наименование участника, ИНН/КПП, юридический адрес, ОГРН, ОКВД, телефоны, email, сайт': contractorCard,
    'банковские реквизиты участника': bankDetails,
    'должность, ФИО и телефон': `${company.directorPosition || 'Директор'} ${company.director || ''}, тел: ${company.phone || ''}`,
    'наименование работ': worksList,
    'Стоимость указана с учётом НДС 20%.': vatText,
    'начало работ по договору': templates.formatDateForDoc(project.start_date || nowIso),
    'окончание работ по договору': templates.formatDateForDoc(project.end_date || validUntil),
    'порядок оплаты по договору': 'Аванс 30%, остаток после выполнения работ',
    'срок оплаты': '5 рабочих дней',
    'сведения о гарантии': '12 месяцев на выполненные работы',
    'Приложения:…': 'Приложения:',
    'Приложение 1': 'Приложение 1 - Локальная смета',
    'дата': templates.formatDateForDoc(validUntil),
    'Генеральный директор ООО "Подрядчик"  ____________________  /Фамилия И.О./': signature,
    '@bookmark:LogoNameContractor': company.fullName || company.name || '',
    '@bookmark:LogoAddrContractor': company.address || '',
    '@bookmark:LogoTelContractor': company.phone || '',
    '@bookmark:LogoEmailContractor': company.email || '',
    '@bookmark:LogoSiteContractor': company.website || '',
    '@bookmark:CustomerName': customerName,
    '@bookmark:DateKP': templates.formatDateForDoc(nowIso),
    '@bookmark:Contractor': contractorCard,
    '@bookmark:BankRekvizitsContractor': bankDetails,
    '@bookmark:ContactPerson': `${company.directorPosition || 'Директор'} ${company.director || ''}, тел: ${company.phone || ''}`,
    '@bookmark:NaimenovanieRabot': worksList,
    '@bookmark:FullPrice': formatAmount(document?.totals?.grandTotal),
    '@bookmark:StoimostRabot': formatAmount(document?.totals?.laborTotal),
    '@bookmark:StoimostMaterialov': formatAmount(document?.totals?.materialTotal),
    '@bookmark:NDS': vatText,
    '@bookmark:NachaloRabot': templates.formatDateForDoc(project.start_date || nowIso),
    '@bookmark:OkonchanieRabot': templates.formatDateForDoc(project.end_date || validUntil),
    '@bookmark:Payment': 'Аванс 30%, остаток после выполнения работ',
    '@bookmark:SrokPayments': '5 рабочих дней',
    '@bookmark:Guarantee': '12 месяцев на выполненные работы',
    '@bookmark:RazdelPrilogenija': 'Приложения:',
    '@bookmark:Prilogenije1': 'Приложение 1 - Локальная смета',
    '@bookmark:DateActuallyKP': templates.formatDateForDoc(validUntil),
    '@bookmark:Podpis': signature,
  };

  return data;
}

function buildAgreementTemplateData({ context, document, options, helpers }) {
  const { formatAmount, formatShortName, templates } = helpers;
  const agreementData = options?.agreementData || {};
  const contract = context?.contract || {};
  const project = context?.project || {};
  const estimate = context?.estimate || {};
  const company = context?.companyInfo || {};
  const settings = context?.settings || {};

  const clientName = contract.client || contract.client_name || project.client_name || '';
  const deltaAmount = Number(document?.totals?.deltaAmount ?? 0);
  const deltaAbsAmount = Number(document?.totals?.deltaAbsAmount ?? Math.abs(deltaAmount));
  const resultingContractTotal = Number(document?.totals?.resultingContractTotal ?? contract.amount ?? 0);
  const deltaDirection = document?.meta?.deltaDirection
    || (deltaAmount > 0 ? 'increase' : deltaAmount < 0 ? 'decrease' : 'no_change');
  const deltaDirectionLabel = deltaDirection === 'increase'
    ? 'Увеличение стоимости'
    : deltaDirection === 'decrease'
      ? 'Уменьшение стоимости'
      : 'Стоимость без изменений';
  const deltaChangeText = deltaDirection === 'increase'
    ? `Стоимость работ увеличена на ${formatAmount(deltaAbsAmount)} руб.`
    : deltaDirection === 'decrease'
      ? `Стоимость работ уменьшена на ${formatAmount(deltaAbsAmount)} руб.`
      : 'Стоимость работ не изменена.';

  return {
    'номер доп. согл.': document?.meta?.agreementNumber || agreementData.number || '',
    'номер договора': contract.number || '',
    'дата договора': templates.formatDateForDoc(contract.date),
    'Дата договора': templates.formatDateForDoc(contract.date),
    'дата доп. согл.': templates.formatDateForDoc(document?.meta?.date || agreementData.date || new Date().toISOString()),
    'ном. дог.': contract.number || '',
    'дата дог.': templates.formatDateForDoc(contract.date),

    'Фамилия Имя Отчество': clientName,
    'Фамилия Имя Отчество заказчика': clientName,
    'Фамилия И.О.': formatShortName(clientName),
    'адрес заказчика': contract.client_address || project.address || '',
    'телефоны заказчика': contract.client_phone || '',
    'ИНН заказчика': contract.client_inn || '',
    'серия  номер паспорта': contract.client_passport || '',
    'кем выдан паспорт и дата выдачи': contract.client_passport_issued || '',
    'код подразд': contract.client_passport_code || '',

    'Название подрядчика': company.name || '',
    'ООО «Подрядчик»': company.name || '',
    'должность, фамилия, инициалы, подписывающего договор': `${company.directorPosition || 'Директора'} ${formatShortName(company.director)}`,
    'должность подписывающего, название подрядчика': `${company.directorPosition || 'Директор'}, ${company.name || ''}`,
    'Устава': company.directorBasis || 'Устава',
    'юридический адрес подрядчика': company.address || '',
    'телефоны подрядчика': company.phone || '',
    'ИНН подрядчика': company.inn || '',
    'КПП подрядчика': company.kpp || '',
    'ОГРН': company.ogrn || '',
    'расч. счёт подрядчика': company.checkingAccount || '',
    'банк подрядчика': company.bankName || '',
    'корр. счёт подрядчика': company.correspondentAccount || '',
    'БИК банка подрядчика': company.bik || '',
    'Фамилия И.О. подрядчика': formatShortName(company.director),

    'номер сметы': estimate.number || '',
    'дата сметы': templates.formatDateForDoc(estimate.created_at),
    'номер приложения': agreementData.appendixNumber || '2',

      'предмет доп. соглашения': document.subject || agreementData.subject || 'Выполнение дополнительных работ',
      'цена доп. согл.': formatAmount(deltaAbsAmount),
      'цена доп. согл. прописью': templates.numberToWords(deltaAbsAmount),
      'тип изменения стоимости': deltaDirectionLabel,
      'текст изменения стоимости': deltaChangeText,
      'увеличение стоимости': deltaDirection === 'increase' ? deltaDirectionLabel : '',
      'уменьшение стоимости': deltaDirection === 'decrease' ? deltaDirectionLabel : '',
      'стоимость без изменений': deltaDirection === 'no_change' ? deltaDirectionLabel : '',
      'сумма изменения стоимости': formatAmount(deltaAbsAmount),
      'цена договора': formatAmount(resultingContractTotal),
      'цена договора прописью': templates.numberToWords(resultingContractTotal),
      'информация о НДС': settings?.estimates?.vatEnabled !== false
      ? `В том числе НДС ${settings?.estimates?.vatRate || document?.totals?.vatRate || 20}%`
      : 'НДС не облагается',

    'Изменить порядок и условия оплаты по Договору:': agreementData.changePayment ? 'Изменить порядок и условия оплаты по Договору:' : '',
    'один или несколько подпунктов о порядке оплаты работ (определяются в программе)': agreementData.paymentTerms || '',

    'Изменить сроки выполнения работ по Договору:': agreementData.changeTerms ? 'Изменить сроки выполнения работ по Договору:' : '',
    'Начало работ по договору': templates.formatDateForDoc(agreementData.startDate || contract.start_date),
    'Окончание работ по договору': templates.formatDateForDoc(agreementData.endDate || contract.end_date),
    'начало работ по договору': templates.formatDateForDoc(agreementData.startDate || contract.start_date),
    'окончание работ по договору': templates.formatDateForDoc(agreementData.endDate || contract.end_date),

    'Приложения к доп. соглашению:': 'Приложения к доп. соглашению:',
    'приложение №1, №2 и т.д.': agreementData.appendices || 'Приложение №1 - Дополнительная смета',
  };
}

function buildKs2RenderModel({ context, document, source, helpers }) {
  const { formatAmount } = helpers;
  return {
    number: source?.act?.number || '',
    estimateNumber: document?.meta?.estimateNumber || '',
    items: (document?.rows || []).map((row) => ({
      index: row.index,
      name: row.name ?? '',
      code: row.code ?? '',
      unit: row.unit ?? '',
      qty: formatAmount(row.quantity),
      price: formatAmount(row.price),
      total: formatAmount(row.total),
    })),
    totalWithoutVat: formatAmount(document?.totals?.totalWithoutVat),
    vat: formatAmount(document?.totals?.totalVat),
    totalWithVat: formatAmount(document?.totals?.totalWithVat),
  };
}

function buildKs3RenderModel({ document, source, helpers }) {
  const { formatAmount } = helpers;
  return {
    number: source?.cert?.number || '',
    estimateNumber: document?.meta?.estimateNumber || source?.cert?.estimate_number || '',
    estimateTotal: formatAmount(document?.totals?.estimateTotal),
    previous: formatAmount(document?.totals?.previousTotal),
    current: formatAmount(document?.totals?.currentPeriodTotal),
    payable: formatAmount(document?.totals?.payable),
  };
}

function buildFotRenderModel({ document, helpers }) {
  const { formatAmount } = helpers;
  return {
    number: document?.meta?.estimateNumber || '',
    items: (document?.rows || []).map((row, index) => ({
      index: row.index || index + 1,
      name: row.name ?? '',
      hours: formatAmount(row.hours),
      rate: formatAmount(row.rate),
      total: formatAmount(row.total),
    })),
    total: formatAmount(document?.totals?.totalAmount),
  };
}

function buildMaterialsRequestRenderModel({ document, helpers }) {
  const { formatAmount } = helpers;
  return {
    number: document?.meta?.estimateNumber || '',
    items: (document?.rows || []).map((row, index) => ({
      index: row.index || index + 1,
      name: row.name ?? '',
      unit: row.unit ?? '',
      qty: formatAmount(row.totalQty),
      price: formatAmount(row.price),
      total: formatAmount(row.total),
    })),
    total: formatAmount(document?.totals?.totalAmount),
  };
}

function prepareWordTemplateDocument({ type, context, options = {}, helpers = {} }) {
  const resolvedHelpers = resolveHelpers(helpers);
  const document = generateDocument({ type, context, options });

  switch (type) {
    case 'contract':
      return {
        templateId: options.templateId || document?.templateHints?.templateId || 'contract-individual',
        data: buildContractTemplateData({ context, document, helpers: resolvedHelpers }),
        document,
      };
    case 'commercial_offer':
      return {
        templateId: options.templateId || 'commercial-offer',
        data: buildCommercialOfferTemplateData({ context, document, helpers: resolvedHelpers }),
        document,
      };
    case 'additional_agreement':
      return {
        templateId: options.templateId || document?.templateHints?.templateId,
        data: buildAgreementTemplateData({ context, document, options, helpers: resolvedHelpers }),
        document,
      };
    default:
      throw new Error(`Word adapter is not implemented for document type: ${type}`);
  }
}

function prepareRendererDocument({ type, context, options = {}, helpers = {}, source = {} }) {
  const resolvedHelpers = resolveHelpers(helpers);
  const document = generateDocument({ type, context, options });

  switch (type) {
    case 'ks2':
      return {
        renderer: 'ks2-html',
        document,
        model: buildKs2RenderModel({ context, document, source, helpers: resolvedHelpers }),
        legacyArgs: {
          act: source.act,
          items: context?.items || [],
          sections: context?.sections || [],
          project: context?.project || null,
          estimate: context?.estimate || null,
          coefficients: context?.coefficients || {},
        },
      };
    case 'ks3':
      return {
        renderer: 'ks3-html',
        document,
        model: buildKs3RenderModel({ document, source, helpers: resolvedHelpers }),
        legacyArgs: {
          cert: source.cert,
          project: context?.project || null,
        },
      };
    case 'fot':
      return {
        renderer: 'fot-html',
        document,
        model: buildFotRenderModel({ document, helpers: resolvedHelpers }),
        legacyArgs: {
          estimate: context?.estimate || null,
          items: context?.items || [],
          sections: context?.sections || [],
          coefficients: context?.coefficients || {},
        },
      };
    case 'materials_request':
      return {
        renderer: 'materials-request-html',
        document,
        model: buildMaterialsRequestRenderModel({ document, helpers: resolvedHelpers }),
        legacyArgs: {
          estimate: context?.estimate || null,
          project: context?.project || null,
          rows: document?.rows || [],
          totals: document?.totals || {},
        },
      };
    default:
      throw new Error(`Renderer adapter is not implemented for document type: ${type}`);
  }
}

function generateDocxFromKernel({ type, context, options = {}, outputPath, helpers = {}, templateRuntime }) {
  const prepared = prepareWordTemplateDocument({ type, context, options, helpers });
  const runtime = templateRuntime || require('./templates');
  runtime.generateFromWordTemplate(prepared.templateId, prepared.data, outputPath);

  return {
    path: outputPath,
    templateId: prepared.templateId,
    data: prepared.data,
    document: prepared.document,
  };
}

module.exports = {
  prepareRendererDocument,
  prepareWordTemplateDocument,
  generateDocxFromKernel,
};
