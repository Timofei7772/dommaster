function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value) {
  return Math.round(toNumber(value) * 100) / 100;
}

function getLineTotal(item) {
  const preferred = [
    item?.sum_smeta,
    item?.total,
    item?.total_cost,
  ].find((value) => Number.isFinite(Number(value)) && Number(value) > 0);

  if (preferred != null) {
    return round2(preferred);
  }

  const quantity = toNumber(item?.quantity) || 1;
  const labor = toNumber(item?.labor_price ?? item?.price);
  const material = toNumber(item?.material_price);
  return round2((labor + material) * quantity);
}

function buildWorksList(items, formatAmount) {
  const lines = [];
  let currentSection = null;
  let rowIndex = 0;

  for (const item of items || []) {
    if (!item?.name) continue;

    const sectionName = item.section_name || item.section || null;
    if (sectionName && sectionName !== currentSection) {
      if (lines.length) lines.push('');
      lines.push(`${sectionName}:`);
      currentSection = sectionName;
    }

    rowIndex += 1;
    const quantity = toNumber(item.quantity) || 1;
    const unit = item.unit || 'шт.';
    const lineTotal = getLineTotal(item);
    lines.push(`${rowIndex}. ${item.name} — ${quantity} ${unit} — ${formatAmount(lineTotal)} руб.`);
  }

  return lines.join('\n').trim();
}

function computeCommercialTotals(estimate, items) {
  const laborFromItems = round2((items || []).reduce((sum, item) => {
    const quantity = toNumber(item?.quantity) || 1;
    return sum + toNumber(item?.labor_price ?? item?.price) * quantity;
  }, 0));

  const materialsFromItems = round2((items || []).reduce((sum, item) => {
    const quantity = toNumber(item?.quantity) || 1;
    return sum + toNumber(item?.material_price) * quantity;
  }, 0));

  const laborTotal = round2(toNumber(estimate?.total_labor) || laborFromItems);
  const materialTotal = round2(toNumber(estimate?.total_materials) || materialsFromItems);
  const subtotal = round2(toNumber(estimate?.subtotal) || (laborTotal + materialTotal));

  const overheadPercent = toNumber(estimate?.overhead_percent);
  const profitPercent = toNumber(estimate?.profit_percent);
  const vatPercent = toNumber(estimate?.vat_percent) || 20;

  const overheadAmount = round2(toNumber(estimate?.overhead_amount) || (subtotal * overheadPercent / 100));
  const profitAmount = round2(toNumber(estimate?.profit_amount) || ((subtotal + overheadAmount) * profitPercent / 100));
  const vatAmount = round2(toNumber(estimate?.vat_cost) || ((subtotal + overheadAmount + profitAmount) * vatPercent / 100));
  const grandTotal = round2(
    toNumber(estimate?.total_with_vat)
    || toNumber(estimate?.total_cost)
    || (subtotal + overheadAmount + profitAmount + vatAmount)
  );

  return {
    laborTotal,
    materialTotal,
    overheadAmount,
    profitAmount,
    vatAmount,
    grandTotal,
  };
}

function buildCommercialOfferData({
  estimate,
  items,
  project,
  settings,
  company,
  templates,
  formatAmount,
  formatShortName,
  now = new Date(),
}) {
  const totals = computeCommercialTotals(estimate, items);
  const customerName = estimate?.client_name || project?.client_name || '';
  const worksList = buildWorksList(items, formatAmount) || estimate?.name || project?.name || 'Строительно-монтажные работы';
  const nowIso = new Date(now).toISOString();
  const validUntil = new Date(new Date(now).getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const vatRate = settings?.estimates?.vatEnabled !== false
    ? (settings?.estimates?.vatRate || estimate?.vat_percent || 20)
    : null;

  const contractorCard = [
    company?.name || '',
    `ИНН: ${company?.inn || ''}, КПП: ${company?.kpp || ''}`.trim(),
    company?.address || '',
    company?.ogrn ? `ОГРН: ${company.ogrn}` : '',
    [company?.phone, company?.email].filter(Boolean).join(', '),
  ].filter(Boolean).join('\n');

  const bankDetails = [
    company?.checkingAccount ? `Р/с: ${company.checkingAccount}` : '',
    company?.bankName || '',
    [company?.bik ? `БИК: ${company.bik}` : '', company?.correspondentAccount ? `К/с: ${company.correspondentAccount}` : '']
      .filter(Boolean)
      .join(', '),
  ].filter(Boolean).join('\n');

  const signature = `${company?.directorPosition || 'Генеральный директор'} ${company?.name || ''}  ____________________  /${formatShortName(company?.director)}/`;
  const vatText = vatRate ? `Стоимость указана с учётом НДС ${vatRate}%.` : 'НДС не облагается.';

  const baseData = {
    'Общество с ограниченной ответственностью Строительная компания «Подрядчик»': company?.fullName || company?.name || '',
    '123456, г. Москва, ул. Самая длинная, д. 1, стр.2, оф.3а': company?.address || '',
    '+7 (495) 123-45-67': company?.phone || '',
    'info@podrjadchik.ru': company?.email || '',
    'www.podrjadchik.ru': company?.website || '',
    'наименование заказчика': customerName,
    'дата комм. предл': templates.formatDateForDoc(nowIso),
    'Наименование участника, ИНН/КПП, юридический адрес, ОГРН, ОКВД, телефоны, email, сайт': contractorCard,
    'банковские реквизиты участника': bankDetails,
    'должность, ФИО и телефон': `${company?.directorPosition || 'Директор'} ${company?.director || ''}, тел: ${company?.phone || ''}`,
    'наименование работ': worksList,
    'Стоимость указана с учётом НДС 20%.': vatText,
    'начало работ по договору': templates.formatDateForDoc(project?.start_date || nowIso),
    'окончание работ по договору': templates.formatDateForDoc(project?.end_date || validUntil),
    'порядок оплаты по договору': 'Аванс 30%, остаток после выполнения работ',
    'срок оплаты': '5 рабочих дней',
    'сведения о гарантии': '12 месяцев на выполненные работы',
    'Приложения:…': 'Приложения:',
    'Приложение 1': 'Приложение 1 - Локальная смета',
    'дата': templates.formatDateForDoc(validUntil),
    'Генеральный директор ООО "Подрядчик"  ____________________  /Фамилия И.О./': signature,
  };

  const bookmarkData = {
    LogoNameContractor: company?.fullName || company?.name || '',
    LogoAddrContractor: company?.address || '',
    LogoTelContractor: company?.phone || '',
    LogoEmailContractor: company?.email || '',
    LogoSiteContractor: company?.website || '',
    CustomerName: customerName,
    DateKP: templates.formatDateForDoc(nowIso),
    Contractor: contractorCard,
    BankRekvizitsContractor: bankDetails,
    ContactPerson: `${company?.directorPosition || 'Директор'} ${company?.director || ''}, тел: ${company?.phone || ''}`,
    NaimenovanieRabot: worksList,
    FullPrice: formatAmount(totals.grandTotal),
    StoimostRabot: formatAmount(totals.laborTotal),
    StoimostMaterialov: formatAmount(totals.materialTotal),
    NDS: vatText,
    NachaloRabot: templates.formatDateForDoc(project?.start_date || nowIso),
    OkonchanieRabot: templates.formatDateForDoc(project?.end_date || validUntil),
    Payment: 'Аванс 30%, остаток после выполнения работ',
    SrokPayments: '5 рабочих дней',
    Guarantee: '12 месяцев на выполненные работы',
    RazdelPrilogenija: 'Приложения:',
    Prilogenije1: 'Приложение 1 - Локальная смета',
    DateActuallyKP: templates.formatDateForDoc(validUntil),
    Podpis: signature,
  };

  for (const [bookmarkName, value] of Object.entries(bookmarkData)) {
    baseData[`@bookmark:${bookmarkName}`] = value;
  }

  return baseData;
}

module.exports = {
  buildWorksList,
  buildCommercialOfferData,
  computeCommercialTotals,
};
