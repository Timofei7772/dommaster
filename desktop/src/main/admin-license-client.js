function normalizeLicenseApiUrl(value) {
  return (value || process.env.LICENSE_API_URL || 'http://localhost:8000').replace(/\/$/, '');
}

function isAsciiHeaderValue(value) {
  return /^[\x20-\x7E]+$/.test(value);
}

async function issueAdminLicense({
  apiUrl,
  email,
  plan,
  adminSecret,
  fetchImpl = global.fetch?.bind(global),
}) {
  if (!email || !email.trim() || !email.includes('@')) {
    throw new Error('Введите email покупателя');
  }

  if (!plan || !plan.trim()) {
    throw new Error('Введите тариф лицензии');
  }

  if (!adminSecret || !adminSecret.trim()) {
    throw new Error('Введите admin secret');
  }

  const normalizedSecret = adminSecret.trim();
  if (!isAsciiHeaderValue(normalizedSecret)) {
    throw new Error('Admin secret должен содержать только латинские символы, цифры и знаки без кириллицы');
  }

  if (!fetchImpl) {
    throw new Error('Fetch API недоступен в текущем окружении');
  }

  const response = await fetchImpl(`${normalizeLicenseApiUrl(apiUrl)}/api/license/admin/issue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Secret': normalizedSecret,
    },
    body: JSON.stringify({
      email: email.trim(),
      plan: plan.trim().toLowerCase(),
    }),
  });

  const payload = await response.json();
  if (!response.ok || payload?.success !== true) {
    throw new Error(payload?.detail || payload?.error || 'Не удалось выдать лицензию');
  }

  return {
    licenseKey: payload.license_key,
    expiresAt: payload.expires_at,
    plan: payload.plan,
    maxPcs: payload.max_pcs,
  };
}

module.exports = {
  normalizeLicenseApiUrl,
  issueAdminLicense,
};
