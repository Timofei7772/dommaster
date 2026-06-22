const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ExcelJS = require('exceljs');

const { importDefektovkaFromExcel } = require('../src/documents');

async function createWorkbookWithSectionHeader(filePath) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Дефектовка');

  sheet.getCell('A1').value = 1.8;
  sheet.getCell('B1').value = 'Коэфф. для стоимости работ';
  sheet.getCell('A2').value = 1.04;
  sheet.getCell('B2').value = 'Коэфф. для стоимости материалов';

  sheet.getCell('A6').value = '№ п/п';
  sheet.getCell('B6').value = 'Наименование работ';
  sheet.getCell('C6').value = 'Ед. изм.';
  sheet.getCell('D6').value = 'Кол-во';
  sheet.getCell('E6').value = 'Цена';
  sheet.getCell('F6').value = 'Стоимость';
  sheet.getCell('H6').value = 'Тип';
  sheet.getCell('I6').value = 'Сметная цена';

  // Реальный паттерн наших экспортов: заголовок раздела записан в колонку A.
  sheet.getCell('A8').value = '1. Раздел: Ванная';
  sheet.mergeCells('A8:F8');

  sheet.getCell('A9').value = 1;
  sheet.getCell('B9').value = 'Штукатурка стен';
  sheet.getCell('C9').value = 'м2';
  sheet.getCell('D9').value = 10;
  sheet.getCell('E9').value = 300;
  sheet.getCell('F9').value = 3000;
  sheet.getCell('H9').value = 'дс';
  sheet.getCell('I9').value = 540;

  await workbook.xlsx.writeFile(filePath);
}

test('importDefektovkaFromExcel preserves room names from section headers in column A', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smetaai-sections-'));
  const filePath = path.join(tempDir, 'defektovka.xlsx');

  try {
    await createWorkbookWithSectionHeader(filePath);

    const result = await importDefektovkaFromExcel(filePath);

    assert.equal(result.sections.length, 1);
    assert.equal(result.sections[0].name, 'Ванная');
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].section, 'Ванная');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
