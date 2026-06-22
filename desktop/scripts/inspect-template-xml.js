const fs = require('fs');
const PizZip = require('pizzip');

const [templatePath, ...needles] = process.argv.slice(2);

if (!templatePath || needles.length === 0) {
  console.error('Usage: node inspect-template-xml.js <template.dotx> <needle1> [needle2]');
  process.exit(1);
}

const zip = new PizZip(fs.readFileSync(templatePath, 'binary'));
const xml = zip.file('word/document.xml')?.asText() || '';
const plainText = Array.from(xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g))
  .map((match) => match[1])
  .join('')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');

for (const needle of needles) {
  const index = xml.indexOf(needle);
  console.log(`--- ${needle} ---`);
  if (index >= 0) {
    const start = Math.max(0, index - 500);
    const end = Math.min(xml.length, index + 700);
    console.log(xml.slice(start, end));
    continue;
  }

  const plainIndex = plainText.indexOf(needle);
  if (plainIndex < 0) {
    console.log('NOT FOUND');
    continue;
  }

  const start = Math.max(0, plainIndex - 300);
  const end = Math.min(plainText.length, plainIndex + 500);
  console.log(plainText.slice(start, end));
}
