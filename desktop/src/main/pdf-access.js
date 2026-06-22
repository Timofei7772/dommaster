function isCoreDocumentFeature(feature) {
  return feature === 'core_document';
}

async function ensurePdfExportAllowed(licenseFacade, options = {}) {
  const status = await licenseFacade.getStatus();
  const feature = options.feature || 'estimate_pdf';

  // Core documents may still render to PDF internally, but they remain part of
  // the base product. They are also available in the free 5-estimate demo tier.
  if (isCoreDocumentFeature(feature)) {
    return status;
  }

  const gate = licenseFacade.canUsePdfExport(status);

  if (!gate.allowed) {
    throw new Error('PDF_LICENSE_REQUIRED');
  }

  return status;
}

module.exports = {
  ensurePdfExportAllowed,
};
