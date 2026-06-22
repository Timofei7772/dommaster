const fs = require('fs');
const PizZip = require('pizzip');

const [templatePath, searchText, replaceText] = process.argv.slice(2);

if (!templatePath || !searchText || replaceText === undefined) {
  console.error('Usage: node replace-template-text.js <template.dotx> <searchText> <replaceText>');
  process.exit(1);
}

function buildSplitTextPattern(text) {
  const chars = text.split('');
  const pattern = chars.map((char, index) => {
    const escaped = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (index < chars.length - 1) {
      return escaped + '(?:</w:t>(?:<[^>]*>)*<w:t[^>]*>)?';
    }
    return escaped;
  }).join('');

  return new RegExp(pattern, 'g');
}

const content = fs.readFileSync(templatePath, 'binary');
const zip = new PizZip(content);
const documentXml = zip.file('word/document.xml');

if (!documentXml) {
  console.error('word/document.xml not found');
  process.exit(2);
}

const xml = documentXml.asText();
const pattern = buildSplitTextPattern(searchText);

if (!pattern.test(xml)) {
  console.error('Search text not found');
  process.exit(3);
}

const updated = xml.replace(buildSplitTextPattern(searchText), replaceText);
zip.file('word/document.xml', updated);

const buffer = zip.generate({
  type: 'nodebuffer',
  compression: 'DEFLATE',
});

fs.writeFileSync(templatePath, buffer);
console.log('UPDATED', templatePath);
