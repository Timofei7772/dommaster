const fs = require('fs');
const path = require('path');

const fontPath = path.join(__dirname, 'src', 'roboto.ttf');
const outputPath = path.join(__dirname, 'src', 'lib', 'robotoFont.ts');

const fontBuffer = fs.readFileSync(fontPath);
const base64 = fontBuffer.toString('base64');

const content = `// Auto-generated Roboto font for jsPDF (Cyrillic support)
// Size: ${fontBuffer.length} bytes

export const robotoFont = "${base64}";
`;

fs.writeFileSync(outputPath, content);
console.log('Font converted successfully!');
console.log('Output:', outputPath);
console.log('Base64 size:', base64.length, 'characters');
