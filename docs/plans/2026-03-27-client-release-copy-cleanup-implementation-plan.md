# Client Release Copy Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Очистить клиентский релиз SmetaAI от надписей про возврат и от всех клиентски видимых упоминаний `Смета 2007`, сохранив рабочий desktop flow.

**Architecture:** Видимые клиенту тексты правятся в frontend, docs, desktop document generation и packaged resource names. Внутренние совместимые alias допускаются, если они снижают риск поломки существующего document flow и IPC.

**Tech Stack:** Electron, React, Node.js, electron-builder, Markdown.

---

### Task 1: Audit and lock the target strings

**Files:**
- Modify: `C:\Projects\SmetaAI\docs\plans\2026-03-27-client-release-copy-cleanup-design.md`
- Test: repository-wide `rg` queries

**Steps:**
1. Run `rg` for `14 дней`, `возврат`, `Смета 2007`, `smeta2007`.
2. Separate real client-visible strings from false positives like comments about function return values.
3. Keep the final write scope limited to visible release artifacts.

### Task 2: Clean frontend and client docs

**Files:**
- Modify: `C:\Projects\SmetaAI\frontend\src\pages\Purchase.tsx`
- Modify: `C:\Projects\SmetaAI\docs\client\getting_started.md`
- Modify: `C:\Projects\SmetaAI\docs\client\README.txt`

**Steps:**
1. Remove visible refund / `14 дней` sales copy.
2. Remove visible `Смета 2007` wording from client-facing docs and labels.
3. Run `npm run build` in `frontend`.

### Task 3: Clean desktop document labels and generated output names

**Files:**
- Modify: `C:\Projects\SmetaAI\desktop\main.js`
- Modify: `C:\Projects\SmetaAI\desktop\src\documents.js`
- Modify: `C:\Projects\SmetaAI\desktop\preload.js`
- Modify: `C:\Projects\SmetaAI\frontend\src\lib\electron.ts`

**Steps:**
1. Replace visible `Смета 2007` labels, output names and docType strings with neutral commercial names.
2. Keep internal compatibility where needed.
3. Re-run desktop tests.

### Task 4: Rename packaged resource names that the client can see

**Files:**
- Modify: `C:\Projects\SmetaAI\desktop\db\DocTemplates\...`
- Modify: `C:\Projects\SmetaAI\desktop\templates\...`
- Modify: code paths that load these resources

**Steps:**
1. Rename visible template filenames that contain `2007`.
2. Update loading paths in desktop code.
3. Verify no broken references remain with `rg`.

### Task 5: Final verification

**Files:**
- Test: repository-wide `rg`
- Test: `frontend` build
- Test: desktop node-tests

**Steps:**
1. Re-run `rg` on the target strings in source paths.
2. Run `npm run build` in `frontend`.
3. Run desktop smoke tests.
