function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toWordTextFragment(value) {
  const parts = String(value ?? '').split(/\r?\n/);
  return parts.map((part, index) => {
    const safeText = escapeXml(part);
    const needsSpace = /^\s|\s$/.test(part);
    const textNode = `<w:t${needsSpace ? ' xml:space="preserve"' : ''}>${safeText}</w:t>`;
    return index === 0 ? textNode : `<w:br/>${textNode}`;
  }).join('');
}

function replaceBookmarkPlaceholdersInXml(xml, bookmarkValues = {}) {
  let result = xml;

  for (const [bookmarkName, value] of Object.entries(bookmarkValues)) {
    const escapedName = bookmarkName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const replacement = `<w:r>${toWordTextFragment(value)}</w:r>`;

    const primaryPattern = new RegExp(
      `(<w:bookmarkStart[^>]*w:id="([^"]+)"[^>]*w:name="${escapedName}"[^>]*/>)([\\s\\S]*?)(<w:bookmarkEnd[^>]*w:id="\\2"[^>]*/>)`,
      'g'
    );

    const secondaryPattern = new RegExp(
      `(<w:bookmarkStart[^>]*w:name="${escapedName}"[^>]*w:id="([^"]+)"[^>]*/>)([\\s\\S]*?)(<w:bookmarkEnd[^>]*w:id="\\2"[^>]*/>)`,
      'g'
    );

    result = result.replace(primaryPattern, `$1${replacement}$4`);
    result = result.replace(secondaryPattern, `$1${replacement}$4`);
  }

  return result;
}

module.exports = {
  escapeXml,
  toWordTextFragment,
  replaceBookmarkPlaceholdersInXml,
};
