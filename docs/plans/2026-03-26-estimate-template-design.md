# Estimate Template Design

**Date:** 2026-03-26

**Scope:** Universal estimate workbook template for repeated use across projects, including a printable client-facing sheet, hidden rule/config sheets, VAT mode switching, and import-ready structure for CSV/JSON data.

## Goal

Create a modern, print-friendly estimate template that:

- looks professional on A4 and in PDF export;
- supports repeated use without manual restyling;
- calculates line totals, section subtotals, VAT, and grand totals automatically;
- classifies rows into human-readable sections from keywords;
- maps cleanly to the existing backend `Estimate`, `EstimateSection`, and `EstimateItem` model shapes.

## Confirmed Decisions

### Workbook structure

- `Смета` - visible client-facing worksheet.
- `Справочники` - hidden worksheet with keyword rules, statuses, units, and optional helper lists.
- `Настройки` - hidden worksheet with VAT mode, VAT rate, colors, company placeholders, print parameters, and named settings.
- `Логи` - omitted in v1; can be added later if generation diagnostics become necessary.

### Delivery model

Use a `B+` workflow:

1. A Python script generates the canonical workbook design and saves it to `templates/estimate_template.xlsx`.
2. The same builder/fill path can later populate the template from CSV/JSON or estimate database data.
3. The generated workbook becomes the project-owned visual template artifact.

### VAT model

- Default mode: VAT on top (`vat_on_top = TRUE`).
- Alternate mode: VAT included in price (`vat_on_top = FALSE`).
- VAT rate is configurable on `Настройки`.
- The visible sheet must expose the active VAT mode in the header.

## Existing Project Constraints

- `C:\Projects\SmetaAI` is not currently a git worktree, so design and implementation docs cannot rely on normal commit history.
- The backend already contains:
  - `backend/app/models/estimate.py`
  - `backend/app/routers/estimates.py`
  - `backend/app/services/document_generator.py`
- `openpyxl` is available in `requirements.txt`, so no new dependency is needed for workbook generation.

## Workbook Layout

### Sheet 1: `Смета`

The visible sheet is optimized for client review, print, and PDF export.

#### Visible columns

| Column | Label | Purpose |
|--------|-------|---------|
| A | `№` | Item or section numbering |
| B | `Наименование работ` | Section titles, work names, notes |
| C | `Ед. изм.` | Unit |
| D | `Кол-во` | Quantity |
| E | `Цена за ед.` | Unit price |
| F | `Стоимость` | Calculated amount |

#### Hidden helper columns

Hidden columns on the same worksheet keep formulas dynamic without cluttering the client view.

| Column | Name | Purpose |
|--------|------|---------|
| G | `row_kind` | `section`, `item`, `section_total`, `summary`, `blank` |
| H | `section_name` | Normalized section label |
| I | `section_key` | Matched keyword or imported classifier |
| J | `source_id` | Imported row ID / trace token |

#### Row map

| Rows | Purpose |
|------|---------|
| 1-8 | Multi-level header |
| 9 | Spacer |
| 10 | Project info ribbon |
| 11 | Spacer |
| 12 | Table header |
| 13-112 | Dynamic work area for 5-100+ lines |
| 113 | Spacer |
| 114-120 | Totals block |
| 122-126 | Signature block |
| 128-132 | Notes block |

The generator should be allowed to insert rows beyond the base design if the estimate exceeds the default visible range.

### Sheet 2: `Справочники`

Hidden sheet storing classification rules and validation lists.

#### Rule table

| Column | Label | Example |
|--------|-------|---------|
| A | `priority` | `10` |
| B | `keywords_csv` | `демонтаж,вывоз` |
| C | `section_name` | `Подготовительные работы` |
| D | `section_code` | `prep` |
| E | `room_type` | `tech` |
| F | `is_active` | `TRUE` |

#### Initial rules

| keywords_csv | section_name |
|--------------|--------------|
| `демонтаж,вывоз` | `Подготовительные работы` |
| `плитка,сантехника` | `Ванная комната` |
| `ламинат,плинтус` | `Жилые комнаты (Пол)` |
| `шпаклевка,обои` | `Стены и потолки` |
| `светодиод,проводка` | `Электрика` |
| `шкаф,купе` | `Мебель и столярные работы` |

Additional lookup blocks can contain:

- status labels: `Черновик`, `На согласовании`, `Утверждено`, `Архив`;
- unit suggestions: `м2`, `м`, `пог.м`, `шт`, `компл.`;
- optional room presets for future UI integration.

### Sheet 3: `Настройки`

Hidden configuration sheet storing values referenced by formulas and the builder.

| Cell | Name | Default |
|------|------|---------|
| B1 | `vat_on_top` | `TRUE` |
| B2 | `vat_rate` | `0.20` |
| B3 | `currency_symbol` | `руб.` |
| B4 | `document_prefix` | `СМ-` |
| B5 | `primary_color` | `#1E3A5F` |
| B6 | `success_color` | `#10B981` |
| B7 | `muted_color` | `#6B7280` |
| B8 | `border_color` | `#E5E7EB` |
| B9 | `stripe_color` | `#F9FAFB` |
| B10 | `header_fill` | `#F5F7FA` |
| B11 | `company_name` | `ООО "Название компании"` |
| B12 | `company_phone` | `+7 (000) 000-00-00` |
| B13 | `company_email` | `info@example.ru` |
| B14 | `company_site` | `www.example.ru` |
| B15 | `company_address` | `Адрес офиса` |
| B16 | `company_tax` | `ИНН / ОГРН` |

The builder should register named ranges for at least:

- `vat_on_top`
- `vat_rate`
- `company_name`
- `document_prefix`

## Visual Design

### Palette

The palette is screen-friendly but conservative enough for CMYK export and grayscale print.

| Element | HEX | Notes |
|---------|-----|-------|
| Primary accent | `#1E3A5F` | Section headers, title, table header |
| Success accent | `#10B981` | Subtotals, positive totals, summary emphasis |
| Header background | `#F5F7FA` | Top header panel |
| Stripe background | `#F9FAFB` | Zebra rows |
| Border | `#E5E7EB` | Horizontal rules, card outline |
| Primary text | `#111827` | Main content |
| Secondary text | `#6B7280` | Meta and footnotes |
| Totals tint | `#ECFDF5` | Totals panel background |

### Typography

- Preferred design font: `Inter`.
- Spreadsheet fallback font: `Arial`, because it is consistently available for openpyxl-generated files.
- Header title: 16-18 pt bold.
- Section headings: 12-13 pt bold.
- Body text: 10-11 pt regular.
- Numeric cells: 11 pt, right-aligned.

### Print profile

- Paper: A4 portrait.
- Margins: narrow but safe for office printers.
- Repeating title rows: header row 12 on each printed page.
- Fit width to one page; allow height to spill to multiple pages.
- Avoid vertical borders; use horizontal separators only.

## Header Design

### Visual structure

The top area spans rows 1-8 and visually behaves like a card with three columns.

| Zone | Position | Content |
|------|----------|---------|
| A | Left | Logo placeholder, company name, slogan |
| B | Center | `ЛОКАЛЬНАЯ СМЕТА`, document number, dates, VAT mode |
| C | Right | Phone, email, site, office address, tax details |

### Project ribbon

Row 10 is a full-width ribbon for project metadata:

- `Название объекта`
- `Адрес объекта`
- `Заказчик`
- `Ответственный менеджер`
- `Статус проекта`

Status should be rendered as a pill-like chip through fill color and bold text, not through emoji.

## Main Table Design

### Header row

Row 12 uses dark fill and white text:

| A12 | B12 | C12 | D12 | E12 | F12 |
|-----|-----|-----|-----|-----|-----|
| `№` | `Наименование работ` | `Ед. изм.` | `Кол-во` | `Цена за ед.` | `Стоимость` |

### Row types

| `row_kind` | Visual behavior |
|------------|-----------------|
| `section` | Full-width dark band; text in column B; other visible cells empty |
| `item` | Normal zebra/body row |
| `section_total` | Bold subtotal row with green emphasis in F |
| `summary` | Totals block row |
| `blank` | Spacer row |

### Section subtotal strategy

The generator inserts an explicit subtotal row after each section. This is clearer for print and avoids requiring the user to interpret grouped totals mentally.

## Totals Block

The totals panel is right-weighted and visually separated from the table body.

Recommended labels:

- `Итого по разделам`
- `Итого без НДС`
- `НДС (20%)`
- `Всего по смете`

For `vat_on_top = TRUE`:

- `Итого по разделам` and `Итого без НДС` are equal unless overhead/profit are added later.
- `НДС` is calculated from `Итого без НДС`.
- `Всего по смете = Итого без НДС + НДС`.

For `vat_on_top = FALSE`:

- `Всего по смете` is the gross amount.
- `НДС` is extracted from the gross amount.
- `Итого без НДС = Всего по смете - НДС`.

## Signatures and Notes

### Signature block

Left-aligned under totals:

- `Составил`
- `Проверил`
- `Дата`

### Notes block

Small font, secondary color:

- срок выполнения работ;
- условия оплаты;
- гарантия;
- контакты для вопросов.

## HTML/CSS Mockup

The HTML mockup is the visual contract for the spreadsheet styling, not a runtime artifact.

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <title>Сметный расчет</title>
    <style>
      :root {
        --primary: #1e3a5f;
        --success: #10b981;
        --bg-soft: #f5f7fa;
        --row-alt: #f9fafb;
        --border: #e5e7eb;
        --text: #111827;
        --muted: #6b7280;
        --totals-bg: #ecfdf5;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 24px;
        font-family: Inter, "Segoe UI", Arial, sans-serif;
        color: var(--text);
        background: #ffffff;
      }
      .page {
        width: 794px;
        margin: 0 auto;
      }
      .header {
        display: grid;
        grid-template-columns: 1.2fr 1fr 1fr;
        gap: 20px;
        padding: 20px 24px;
        background: linear-gradient(180deg, #f7f9fc 0%, var(--bg-soft) 100%);
        border: 1px solid var(--border);
        border-bottom: 3px solid var(--primary);
        border-radius: 10px;
      }
      .logo-box {
        width: 88px;
        height: 88px;
        border: 1px dashed #c7d2de;
        border-radius: 12px;
        display: grid;
        place-items: center;
        color: var(--muted);
        margin-bottom: 12px;
      }
      .doc-title {
        margin: 0 0 8px;
        font-size: 28px;
        line-height: 1.1;
        color: var(--primary);
      }
      .meta,
      .contacts,
      .project-grid,
      .notes {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.6;
      }
      .vat-chip,
      .status-chip {
        display: inline-block;
        padding: 6px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
      }
      .vat-chip {
        background: #e8f5ef;
        color: #047857;
      }
      .status-chip {
        background: #e8eef6;
        color: var(--primary);
      }
      .project-bar {
        margin-top: 16px;
        padding: 14px 18px;
        border: 1px solid var(--border);
        border-radius: 10px;
        background: #ffffff;
      }
      .project-grid {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 12px 16px;
      }
      table {
        width: 100%;
        margin-top: 18px;
        border-collapse: separate;
        border-spacing: 0;
      }
      thead th {
        padding: 12px 14px;
        background: var(--primary);
        color: #ffffff;
        text-align: left;
        font-size: 12px;
        font-weight: 700;
      }
      tbody td {
        padding: 11px 14px;
        border-bottom: 1px solid var(--border);
        font-size: 13px;
      }
      tbody tr:nth-child(even) td {
        background: var(--row-alt);
      }
      .section-row td {
        background: var(--primary) !important;
        color: #ffffff;
        font-weight: 700;
        border-bottom: 0;
      }
      .subtotal-row td {
        font-weight: 700;
      }
      .subtotal-row td:last-child,
      .totals-card .value {
        color: var(--success);
      }
      .num {
        text-align: right;
        white-space: nowrap;
      }
      .totals-card {
        width: 320px;
        margin-left: auto;
        margin-top: 22px;
        padding: 18px 20px;
        border: 1px solid #cfeadf;
        border-radius: 12px;
        background: var(--totals-bg);
      }
      .totals-row {
        display: flex;
        justify-content: space-between;
        padding: 8px 0;
        border-bottom: 1px solid #d9f0e4;
      }
      .totals-row.grand {
        margin-top: 6px;
        padding-top: 14px;
        border-top: 3px double var(--success);
        border-bottom: 0;
        font-size: 20px;
        font-weight: 800;
      }
      .footer {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 28px;
        margin-top: 28px;
      }
      .signatures {
        font-size: 13px;
        line-height: 2;
      }
      .line {
        display: inline-block;
        min-width: 180px;
        border-bottom: 1px solid #9ca3af;
      }
      .notes {
        font-size: 12px;
      }
    </style>
  </head>
  <body>
    <div class="page">
      <section class="header">
        <div>
          <div class="logo-box">ЛОГО</div>
          <strong>ООО "Название компании"</strong><br />
          <span class="meta">Ремонт и отделка помещений под ключ</span>
        </div>
        <div>
          <h1 class="doc-title">ЛОКАЛЬНАЯ СМЕТА</h1>
          <div class="meta">
            № СМ-2026-001<br />
            Дата: 26.03.2026<br />
            Действует до: 05.04.2026
          </div>
          <div style="margin-top: 10px;">
            <span class="vat-chip">НДС сверху (20%)</span>
          </div>
        </div>
        <div class="contacts">
          +7 (000) 000-00-00<br />
          info@example.ru<br />
          www.example.ru<br />
          Екатеринбург, ул. Примерная, 1<br />
          ИНН / ОГРН
        </div>
      </section>
      <section class="project-bar">
        <div class="project-grid">
          <div><strong>Объект</strong><br />Квартира, ЖК "Пример"</div>
          <div><strong>Адрес</strong><br />ул. Примерная, 10</div>
          <div><strong>Заказчик</strong><br />Иванов И.И.</div>
          <div><strong>Менеджер</strong><br />Петров П.П.</div>
          <div><strong>Статус</strong><br /><span class="status-chip">На согласовании</span></div>
        </div>
      </section>
      <table>
        <thead>
          <tr>
            <th>№</th>
            <th>Наименование работ</th>
            <th>Ед. изм.</th>
            <th class="num">Кол-во</th>
            <th class="num">Цена за ед.</th>
            <th class="num">Стоимость</th>
          </tr>
        </thead>
        <tbody>
          <tr class="section-row">
            <td>1</td>
            <td colspan="5">Ванная комната</td>
          </tr>
          <tr>
            <td>1.1</td>
            <td>Демонтаж плитки</td>
            <td>м2</td>
            <td class="num">10,00</td>
            <td class="num">300,00</td>
            <td class="num">3 000,00</td>
          </tr>
          <tr>
            <td>1.2</td>
            <td>Укладка плитки</td>
            <td>м2</td>
            <td class="num">10,00</td>
            <td class="num">750,00</td>
            <td class="num">7 500,00</td>
          </tr>
          <tr class="subtotal-row">
            <td></td>
            <td colspan="4">Итого по разделу</td>
            <td class="num">10 500,00</td>
          </tr>
        </tbody>
      </table>
      <section class="totals-card">
        <div class="totals-row"><span>Итого без НДС</span><span class="value">173 250,00</span></div>
        <div class="totals-row"><span>НДС (20%)</span><span class="value">34 650,00</span></div>
        <div class="totals-row grand"><span>Всего по смете</span><span>207 900,00</span></div>
      </section>
      <section class="footer">
        <div class="signatures">
          Составил: <span class="line"></span> / <span class="line"></span><br />
          Проверил: <span class="line"></span> / <span class="line"></span><br />
          Дата: <span class="line" style="min-width: 120px;"></span>
        </div>
        <div class="notes">
          Срок выполнения работ: по согласованному графику.<br />
          Условия оплаты: аванс / этапы / финальный расчет.<br />
          Гарантия: согласно договору.<br />
          Контакты для вопросов: support@example.ru.
        </div>
      </section>
    </div>
  </body>
</html>
```

## Excel Formula Contract

### Line formulas

The workbook is generated by `openpyxl`, so formulas written into cells must use English function names, even if Excel later shows localized names.

#### Item line amount

For item rows only:

```excel
=IF($G14="item",IF(OR($D14="",$E14=""),"",ROUND($D14*$E14,2)),"")
```

Google Sheets equivalent:

```gs
=IF($G14="item",IF(OR($D14="",$E14=""),"",ROUND($D14*$E14,2)),"")
```

### Section subtotal

Subtotal rows sum all visible item rows with the same normalized section name:

```excel
=IF($G30="section_total",ROUND(SUMIFS($F$13:$F$500,$G$13:$G$500,"item",$H$13:$H$500,$H30),2),"")
```

Google Sheets equivalent:

```gs
=IF($G30="section_total",ROUND(SUMIFS($F$13:$F$500,$G$13:$G$500,"item",$H$13:$H$500,$H30),2),"")
```

### Grand totals

Sum only section subtotals, not the raw item rows:

```excel
=ROUND(SUMIFS($F$13:$F$500,$G$13:$G$500,"section_total"),2)
```

### VAT formulas

Assume:

- `F114` = subtotal base value
- `F115` = amount without VAT
- `F116` = VAT amount
- `F117` = grand total

Recommended formulas:

#### VAT amount

```excel
=IF(Настройки!$B$1,ROUND($F$115*Настройки!$B$2,2),ROUND($F$117-($F$117/(1+Настройки!$B$2)),2))
```

#### Amount without VAT

```excel
=IF(Настройки!$B$1,$F$114,ROUND($F$117-$F$116,2))
```

#### Grand total

```excel
=IF(Настройки!$B$1,ROUND($F$115+$F$116,2),$F$114)
```

### VAT mode indicator

```excel
=IF(Настройки!$B$1,"НДС сверху ("&TEXT(Настройки!$B$2,"0%")&")","НДС включен в цену ("&TEXT(Настройки!$B$2,"0%")&")")
```

### Document number

The generator should prefer Python-side numbering for deterministic output. If a formula-based placeholder is needed:

```excel
=Настройки!$B$4&YEAR(TODAY())&"-"&TEXT(ROW(),"000")
```

## Section Auto-Naming Logic

### Recommended source of truth

Section naming is resolved in Python during import/fill, not by spreadsheet formulas.

Reason:

- Excel formulas are poor at parsing comma-separated keyword rules and maintaining precedence.
- Python can apply priorities, normalization, transliteration, and fallback handling more safely.
- The workbook remains transparent because the matched section and keyword can still be written into hidden helper columns.

### Resolution algorithm

1. Normalize the work name:
   - lowercase;
   - replace `ё` with `е`;
   - trim repeated spaces;
   - optionally strip punctuation.
2. Iterate active rules from `Справочники` sorted by `priority`.
3. Split `keywords_csv` by comma.
4. If any keyword is present in the normalized work name, assign that row to `section_name`.
5. If no match is found, fall back to:
   - imported section if provided;
   - else `Прочие работы`.

### Example mapping

| Work name | Result |
|-----------|--------|
| `Демонтаж старой плитки и вывоз мусора` | `Подготовительные работы` |
| `Монтаж сантехники и плитки в санузле` | `Ванная комната` |
| `Укладка ламината и монтаж плинтуса` | `Жилые комнаты (Пол)` |

## Import Contract

### Supported input shapes

CSV/JSON rows should support at least:

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | Work title |
| `unit` | no | Default `шт` |
| `quantity` | no | Default `1` |
| `unit_price` | no | If absent, derive from project fields |
| `section_name` | no | Overrides auto-classifier if present |
| `item_number` | no | Optional |
| `description` | no | Optional long text |
| `materials_price` | no | Optional import source |
| `labor_price` | no | Optional import source |
| `machines_price` | no | Optional import source |

### Price resolution

If `unit_price` is absent:

```text
unit_price = materials_price + labor_price + machines_price
```

The client-facing template keeps one visible price column even if the source data contains multiple cost components.

## Printing and PDF Export Requirements

- Set print area to include the header, table, totals, signatures, and notes only.
- Repeat row 12 on printed pages.
- Freeze panes below row 12 and after column B for desktop editing.
- Preserve readable spacing when exported to PDF.
- Do not rely on image shadows or effects that Excel prints inconsistently.

## Open Questions Deferred to Implementation

- Whether logo placeholders should accept a client logo as a second image slot in the same header card.
- Whether additional coefficient rows should be shown in the totals panel for future estimate modes.
- Whether the first release should emit a pre-filled demo workbook alongside the blank template for manual QA.
