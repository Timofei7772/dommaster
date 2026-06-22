# Commercial Release PDF And Installer Assets Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Починить desktop PDF/print path для смет и включить в коммерческий installer лучшие клиентские и админские артефакты без изменения интерфейса.

**Architecture:** PDF helper выносится в тестируемый desktop main-module, который готовит временный HTML-файл для `printToPDF` и централизует обработку `shell.openPath`. Installer получает отдельную папку со стартовыми базами `quick` и `full`, а документация обновляется под реальную выдачу клиенту и администратору.

**Tech Stack:** Electron, Node.js test runner, electron-builder, Markdown documentation.

---

### Task 1: Record the failing desktop behavior in tests

**Files:**
- Create: `C:\Projects\SmetaAI\desktop\tests\pdf-runtime.test.js`
- Create: `C:\Projects\SmetaAI\desktop\src\main\pdf-runtime.js`

**Steps:**
1. Write a failing Node test for temporary HTML file creation and cleanup.
2. Run `node --test desktop/tests/pdf-runtime.test.js` and confirm it fails.
3. Add the minimal helper implementation in `desktop/src/main/pdf-runtime.js`.
4. Re-run `node --test desktop/tests/pdf-runtime.test.js` and confirm it passes.

### Task 2: Switch estimate PDF generation to the robust helper

**Files:**
- Modify: `C:\Projects\SmetaAI\desktop\main.js`
- Test: `C:\Projects\SmetaAI\desktop\tests\pdf-runtime.test.js`

**Steps:**
1. Replace the `data:` URL loading path with the helper-backed temp HTML file flow.
2. Keep the existing IPC names and renderer behavior unchanged.
3. Re-run the focused desktop tests.

### Task 3: Surface file-open failures instead of silently ignoring them

**Files:**
- Modify: `C:\Projects\SmetaAI\desktop\src\main\pdf-runtime.js`
- Modify: `C:\Projects\SmetaAI\desktop\main.js`
- Test: `C:\Projects\SmetaAI\desktop\tests\pdf-runtime.test.js`

**Steps:**
1. Add a tested helper for `shell.openPath` success/error normalization.
2. Update `shell:openPath` IPC to await and validate the Electron result.
3. Re-run the focused test file and the existing desktop Node suite.

### Task 4: Put starter client databases into installer resources

**Files:**
- Create: `C:\Projects\SmetaAI\docs\client\starter-db\README.md`
- Create/Copy: `C:\Projects\SmetaAI\docs\client\starter-db\quick\catalog_simple.json`
- Create/Copy: `C:\Projects\SmetaAI\docs\client\starter-db\full\catalog.json`
- Create/Copy: `C:\Projects\SmetaAI\docs\client\starter-db\full\catalog_rsk.json`
- Create/Copy: `C:\Projects\SmetaAI\docs\client\starter-db\full\regions.json`
- Modify: `C:\Projects\SmetaAI\desktop\package.json`

**Steps:**
1. Add the quick/full starter-db structure under client docs.
2. Ensure electron-builder packages these resources into the installer.
3. Run `npm run build` in `frontend` or the relevant packaging smoke-check used by the project.

### Task 5: Upgrade client and admin docs for commercial delivery

**Files:**
- Modify: `C:\Projects\SmetaAI\docs\admin\license_management.md`
- Modify: `C:\Projects\SmetaAI\docs\client\getting_started.md`
- Modify: `C:\Projects\SmetaAI\docs\client\README.txt`
- Modify: `C:\Projects\SmetaAI\docs\security\licensing_test_report.md`

**Steps:**
1. Rewrite the admin doc as an operational runbook for license generation, customer delivery and starter-db handoff.
2. Rewrite the client docs so the packaged `.exe` contains a complete usage guide and starter-db explanation.
3. Update the security/release verification doc to include PDF smoke-test and bundled asset checks.

### Task 6: Final verification

**Files:**
- Test: `C:\Projects\SmetaAI\desktop\tests\pdf-runtime.test.js`
- Test: `C:\Projects\SmetaAI\desktop\tests\feature-gating.test.js`
- Test: `C:\Projects\SmetaAI\desktop\tests\license-manager.test.js`
- Test: `C:\Projects\SmetaAI\desktop\tests\license-ipc.test.js`

**Steps:**
1. Run `node --test desktop/tests/pdf-runtime.test.js desktop/tests/feature-gating.test.js desktop/tests/license-manager.test.js desktop/tests/license-ipc.test.js`.
2. Run the already-used frontend build check.
3. Confirm the docs and starter-db resources exist in the expected source paths.
