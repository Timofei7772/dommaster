# Additional Agreements Design

**Date:** 2026-04-03

## Goal

Подключить три типа допсоглашений (`additional`, `independent`, `replacement`) к уже существующей документной архитектуре `document-kernel -> adapter -> docxtemplater -> .docx`, не ломая UI и не затрагивая стабильное ядро сметы.

## Constraints

- Допсоглашение можно генерировать только при наличии связанного договора.
- Без договора функция должна быть видна в UI, но недоступна.
- Никакой записи или чтения рабочих шаблонов из `Program Files`.
- Никаких ручных вводов внутри документа: данные берутся из проекта, сметы и договора.
- Текущие документы (`договор`, `КС-2`, `КС-3`, `ФОТ`, `материалы`, `пакет`) не должны регрессировать.

## Recommended Approach

Использовать текущий trusted pipeline:

```text
contract + estimate + project
-> document-kernel
-> document-template-adapters
-> docxtemplater
-> .docx
```

Допсоглашения не получают отдельную подсистему. Они входят в уже существующую document architecture и повторяют модель генерации договора.

## User Experience

Во вкладке `Документы` появляется компактная секция:

```text
Доп. соглашения
- Доп. к смете
- Отдельное
- Замена
```

Если у текущей сметы нет связанного договора:

- секция видна
- все три кнопки disabled
- отображается пояснение: `Сначала создайте договор, чтобы добавить допсоглашение`

Если договор есть:

- кнопки активны
- генерация идёт сразу по нажатию

## Data Model

Допсоглашение собирается только из уже существующих данных:

- `contract`
- `project`
- `estimate`
- `client`
- `agreement`

Минимальная структура `agreement`:

```js
{
  type: 'additional' | 'independent' | 'replacement',
  number,
  date,
  reason,
  total,
}
```

`contract` является обязательным входом. Если его нет, генерация не выполняется.

## Backend Design

### 1. Kernel

`document-kernel` должен поддерживать три варианта допсоглашений через один builder.

Ожидаемое поведение:

- выбор типа идёт через `options.agreementType`
- payload всегда строится на базе существующего договора
- данные сметы и проекта подтягиваются из той же связи, что и у договора

### 2. Adapter

`document-template-adapters` выполняет две задачи:

- маппинг kernel data -> Word placeholders
- выбор правильного шаблона по:
  - `agreementType`
  - `clientType` (`person` / `company`)

### 3. Template Runtime

Шаблоны `.dotx` считаются bundled assets, но работать приложение должно через writable user copy:

```text
app.getPath('userData')/templates/agreements/...
```

При первом использовании:

- если локальной копии нет, шаблон копируется из bundled source
- дальше генерация идёт только из writable user dir

Это исключает проблемы `Program Files` и делает поведение одинаковым в dev и packaged build.

## Template Contract

Шаблоны должны использовать стабильные placeholders. Минимальный контракт:

```text
{{contract.number}}
{{contract.date}}
{{client.name}}
{{client.type}}
{{project.address}}
{{agreement.number}}
{{agreement.date}}
{{agreement.reason}}
{{agreement.total}}
```

Если шаблон не содержит placeholders, автогенерации не будет. Поэтому шаблонная структура должна быть приведена к единому формату.

## Error Handling

Основная доменная ошибка:

```text
AGREEMENT_CONTRACT_REQUIRED
```

Показывается, когда пользователь пытается сгенерировать допсоглашение без существующего договора.

UX-правило:

- в нормальном сценарии до этой ошибки доходить не должно, потому что кнопки disabled
- backend всё равно обязан проверять это как trusted guard

## Acceptance Criteria

### UI

- Секция `Доп. соглашения` видна всегда.
- Без договора кнопки disabled.
- Пояснение о необходимости сначала создать договор отображается.

### Generation

- `additional`, `independent`, `replacement` создаются через один pipeline.
- Для `phys/legal` выбираются корректные `.dotx`.
- В документ попадают:
  - номер и дата договора
  - клиент
  - адрес проекта
  - номер и дата допсоглашения
  - причина
  - сумма

### Stability

- Нет `undefined` в generated mapping.
- Нет зависимости от `Program Files`.
- Повторная генерация даёт стабильный результат.
- Текущие документы и пакет документов не ломаются.

## Testing Strategy

Нужны три слоя тестов:

1. `desktop/tests/...`
   - без договора генерация отклоняется
   - с договором выбирается правильный шаблон
   - mapping допсоглашений заполняет обязательные поля

2. `frontend/...`
   - кнопки disabled без договора
   - кнопки активны при наличии договора

3. Runtime/template path
   - шаблоны резолвятся через writable user dir
   - при отсутствии локальной копии выполняется bootstrap-copy

## Result

После реализации допсоглашения станут частью текущего document workflow:

```text
договор -> допсоглашение -> docx
```

без отдельного экрана, без ручных полей и без новой архитектуры.
